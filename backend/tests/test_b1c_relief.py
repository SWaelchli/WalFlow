"""
B1c: relief devices.

F1-03  forced open is solved as open (PSV full lift, disc burst) and survives the unmitigated pass
F1-09  set / burst pressure in barg; a device opens when the inlet gauge pressure reaches it
F1-04  pop action: full lift above the reseat pressure, "cycling" (solved like a modulating valve) below
F1-38  capacity utilisation against the rated flow at 10 % overpressure, not against 1 bar
B1c    the open/closed state is held during a Newton solve and changed only between solves
"""
import sys
import os
import math
import pytest
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from physics_refs import solve, water_head
from routers.simulation import extract_telemetry
from simulation.equipment.pressure_source import PressureSource
from simulation.equipment.centrifugal_pump import CentrifugalPump
from simulation.equipment.tank import Tank
from simulation.equipment.pressure_safety_valve import PressureSafetyValve
from simulation.equipment.rupture_disc import RuptureDisc
from simulation.equipment.pipe import Pipe
from simulation.fluid_utils import FluidProperties
from simulation.graph_parser import GraphParser, ModelInputError
from simulation.schemas import HydraulicNetwork, GlobalSettings, ReactFlowGraph
from simulation.solver import NetworkSolver, run_sequential_relief_simulation

P_ATM = 101325.0
GPM = 15850.3231        # (US gal/min) per (m³/s)
PSI = 6894.757          # Pa per psi
BIG = 0.2               # DN200 lines: pipe losses negligible against the device


def cv_flow_m3s(cv: float, dp_pa: float, rho: float) -> float:
    """US flow-coefficient definition: Q[gpm] = Cv·√(ΔP[psi] / SG), SG relative to water at 60 °F (999 kg/m³)."""
    return cv * math.sqrt((dp_pa / PSI) / (rho / 999.0)) / GPM


def _header_to_drain(device, source_pa, **settings):
    nodes = {"src": PressureSource("Header", source_pressure=source_pa), "dev": device, "t": Tank("Drain", fluid_level=0.0)}
    edges = [
        {"id": "e1", "source": "src", "target": "dev", "pipe": Pipe("p1", 1.0, BIG)},
        {"id": "e2", "source": "dev", "target": "t", "pipe": Pipe("p2", 1.0, BIG)},
    ]
    return nodes, edges, solve(nodes, edges, **settings)


def _pump_to_psv(psv, head_bar=6.0):
    """Tank → centrifugal pump → PSV → drain: the PSV is the only outlet of the pump."""
    gs = GlobalSettings()
    nodes = {
        "t1": Tank("Supply", fluid_level=2.0),
        "pump": CentrifugalPump("Pump", flow_rated=0.002, head_rated=water_head(head_bar * 1e5)),
        "psv": psv,
        "t2": Tank("Drain", fluid_level=0.0),
    }
    edges = [
        {"id": "e1", "source": "t1", "target": "pump", "pipe": Pipe("p1", 5.0, 0.05)},
        {"id": "e2", "source": "pump", "target": "psv", "pipe": Pipe("p2", 5.0, 0.05)},
        {"id": "e3", "source": "psv", "target": "t2", "pipe": Pipe("p3", 5.0, 0.05)},
    ]
    for n in nodes.values():
        n.global_settings = gs
    for e in edges:
        e["pipe"].global_settings = gs
    return HydraulicNetwork(nodes=nodes, edges=edges)


# --- F1-09: gauge set pressure ------------------------------------------------------------------

@pytest.mark.parametrize("p_src_bara, opens", [(10.99, False), (11.03, True)])
def test_f1_09_set_10_barg_opens_at_11_013_bara(p_src_bara, opens):
    psv = PressureSafetyValve("PSV", set_pressure_barg=10.0, cv=1.0, action_mode="modulating")
    _, _, stats = _header_to_drain(psv, p_src_bara * 1e5)
    assert stats["success"]
    assert math.isclose(psv.set_pressure_bara, 11.01325)
    q = psv.inlets[0].flow_rate
    assert (q > 1e-6) == opens
    assert psv.status == ("cracked" if opens else "closed")


def test_f1_09_opening_follows_the_atmospheric_pressure_setting():
    """At 0.9 bar(a) ambient, 10 barg is 10.9 bar(a): a 10.95 bar(a) header now lifts the valve."""
    psv = PressureSafetyValve("PSV", set_pressure_barg=10.0, cv=1.0, action_mode="modulating")
    _, _, stats = _header_to_drain(psv, 10.95e5, atmospheric_pressure=90000.0)
    assert stats["success"] and psv.inlets[0].flow_rate > 1e-6


def test_f1_09_pop_opening_snapshot_in_gauge():
    """The relief ramp (F1-08) finds the opening at set (barg) + P_atm."""
    psv = PressureSafetyValve("PSV", set_pressure_barg=3.0, cv=0.5, action_mode="pop_action")
    net = _pump_to_psv(psv)
    stats, tel, *_ = run_sequential_relief_simulation(net, NetworkSolver(net), extract_telemetry)
    dev = tel["relief"]["devices"]["psv"]
    assert stats["success"] and dev["set_pressure_barg"] == 3.0
    assert abs(dev["inlet_at_opening_bara"] - 4.01325) < 0.01


# --- F1-38: capacity ------------------------------------------------------------------------------

def test_f1_38_capacity_is_100_pct_at_10_pct_overpressure():
    """Audit C4: set 20 barg, Cv 10, inlet at 22 barg relieving to atmosphere = full lift, rated flow."""
    psv = PressureSafetyValve("PSV", set_pressure_barg=20.0, cv=10.0, action_mode="modulating")
    _, _, stats = _header_to_drain(psv, P_ATM + 22.0e5)
    assert stats["success"]
    rho = FluidProperties.get_density("water", 293.15)
    q_rated = cv_flow_m3s(10.0, 22.0e5, rho)
    assert math.isclose(psv.inlets[0].flow_rate, q_rated, rel_tol=0.005)
    assert math.isclose(psv.rated_flow_lmin, q_rated * 60000.0, rel_tol=0.005)
    assert abs(psv.capacity_utilization_pct - 100.0) < 0.5
    assert psv.status == "cracked" and psv.lift_pct > 99.9


def test_f1_38_overcapacity_above_rated_flow():
    """Forced open at 30 barg inlet: flow above the rated flow → overcapacity, ratio √(30/22)."""
    psv = PressureSafetyValve("PSV", set_pressure_barg=20.0, cv=10.0, forced_state="forced_open")
    _, _, stats = _header_to_drain(psv, P_ATM + 30.0e5)
    assert stats["success"] and psv.status == "overcapacity"
    assert math.isclose(psv.capacity_utilization_pct, 100.0 * math.sqrt(30.0 / 22.0), rel_tol=0.005)


def test_f1_38_reduced_bore_disc_capacity():
    """Reduced-bore disc: rated = orifice flow at 1.1·burst (gauge); at 1.21·burst the ratio is √1.1."""
    rd = RuptureDisc("RD", burst_pressure_barg=10.0, bore_type="reduced_bore", pipe_diameter=0.05248, orifice_diameter=0.02)
    nodes, edges, stats = _header_to_drain(rd, P_ATM + 12.1e5)
    assert stats["success"] and rd.is_burst
    dp = rd.inlets[0].pressure - rd.outlets[0].pressure
    assert math.isclose(rd.capacity_utilization_pct, 100.0 * math.sqrt(dp / 11.0e5), rel_tol=0.005)
    assert rd.status == "overcapacity"


# --- F1-04: pop action and blowdown -----------------------------------------------------------------

def test_f1_04_undersized_pop_valve_stays_open_at_full_lift():
    """Cv 0.5 cannot pull the pump below the reseat pressure: full lift, flow by the Cv definition."""
    psv = PressureSafetyValve("PSV", set_pressure_barg=3.0, cv=0.5, action_mode="pop_action", blowdown_pct=7.0)
    net = _pump_to_psv(psv)
    stats = NetworkSolver(net).solve()
    assert stats["success"] and psv.lift_state == "open" and psv.lift_pct == 100.0
    p_in_g = (psv.inlets[0].pressure - P_ATM) / 1e5
    assert p_in_g >= psv.reseat_pressure_barg
    rho = psv.inlets[0].density
    dp = psv.inlets[0].pressure - psv.outlets[0].pressure
    assert math.isclose(psv.inlets[0].flow_rate, cv_flow_m3s(0.5, dp, rho), rel_tol=0.01)


def test_f1_04_oversized_pop_valve_cycles_near_set_pressure():
    """Cv 15 at full lift would drop the inlet far below reseat (2.79 barg): the valve cycles. Steady
    state: the modulating equivalent holds the inlet between set and +10 %, status "cycling"."""
    psv = PressureSafetyValve("PSV", set_pressure_barg=3.0, cv=15.0, action_mode="pop_action", blowdown_pct=7.0)
    net = _pump_to_psv(psv)
    stats = NetworkSolver(net).solve()
    assert stats["success"] and psv.status == "cycling"
    p_in_g = (psv.inlets[0].pressure - P_ATM) / 1e5
    assert 3.0 <= p_in_g <= 3.3
    assert psv.inlets[0].flow_rate > 1e-4
    assert math.isclose(psv.reseat_pressure_barg, 3.0 * 0.93)


def test_f1_04_result_does_not_depend_on_the_previous_run():
    psv = PressureSafetyValve("PSV", set_pressure_barg=3.0, cv=15.0, action_mode="pop_action")
    net = _pump_to_psv(psv)
    solver = NetworkSolver(net)
    solver.solve()
    first = (psv.status, psv.inlets[0].pressure, psv.inlets[0].flow_rate)
    solver.solve()
    second = (psv.status, psv.inlets[0].pressure, psv.inlets[0].flow_rate)
    assert first[0] == second[0]
    assert math.isclose(first[1], second[1], rel_tol=1e-6) and math.isclose(first[2], second[2], rel_tol=1e-5)


# --- F1-03: forced open -------------------------------------------------------------------------------

@pytest.mark.parametrize("make", [
    lambda: PressureSafetyValve("DEV", set_pressure_barg=50.0, cv=2.0, forced_state="forced_open"),
    lambda: RuptureDisc("DEV", burst_pressure_barg=50.0, cv=2.0, forced_state="forced_open"),
])
def test_f1_03_forced_open_relieves_below_set_pressure(make):
    dev = make()
    net = _pump_to_psv(dev)
    stats, tel, tel_unmit, *_ = run_sequential_relief_simulation(net, NetworkSolver(net), extract_telemetry)
    assert stats["success"] and dev.forced_state == "forced_open"
    assert tel["nodes"]["psv"]["outlets"][0]["flow_rate"] > 1e-4
    assert tel["nodes"]["psv"]["status"] in ("cracked", "burst", "overcapacity")
    # The unmitigated reference still holds every device closed
    assert tel_unmit["nodes"]["psv"]["outlets"][0]["flow_rate"] == 0.0
    assert tel["relief"]["devices"]["psv"]["forced_state"] == "forced_open"


def test_f1_03_forced_closed_stays_closed():
    psv = PressureSafetyValve("PSV", set_pressure_barg=1.0, cv=2.0, forced_state="forced_closed")
    net = _pump_to_psv(psv)
    stats, tel, *_ = run_sequential_relief_simulation(net, NetworkSolver(net), extract_telemetry)
    assert stats["success"] and tel["nodes"]["psv"]["outlets"][0]["flow_rate"] == 0.0
    assert psv.forced_state == "forced_closed"


# --- state held inside a Newton solve --------------------------------------------------------------

def test_relief_state_is_held_during_each_hydraulic_solve(monkeypatch):
    psv = PressureSafetyValve("PSV", set_pressure_barg=3.0, cv=15.0, action_mode="pop_action")
    net = _pump_to_psv(psv)
    solver = NetworkSolver(net)
    seen = []
    original = NetworkSolver._solve_hydraulics_core

    def recording(self, *args, **kwargs):
        before = (psv.lift_mode(), psv.lift_state)
        result = original(self, *args, **kwargs)
        assert (psv.lift_mode(), psv.lift_state) == before
        seen.append(before)
        return result

    monkeypatch.setattr(NetworkSolver, "_solve_hydraulics_core", recording)
    stats = solver.solve()
    assert stats["success"]
    # closed → full lift → cycling (modulating), each in its own solve
    assert [s[1] for s in seen[:3]] == ["closed", "open", "cycling"]


# --- file input (D1) ----------------------------------------------------------------------------------

def _graph(data):
    return ReactFlowGraph(
        nodes=[
            {"id": "src", "type": "pressure_source", "position": {"x": 0, "y": 0}, "data": {"label": "S", "source_pressure_bara": 5.0}},
            {"id": "psv", "type": "pressure_safety_valve", "position": {"x": 0, "y": 0}, "data": {"label": "PSV-7", **data}},
            {"id": "t", "type": "tank", "position": {"x": 0, "y": 0}, "data": {"label": "T"}},
        ],
        edges=[
            {"id": "e1", "source": "src", "target": "psv", "data": {}},
            {"id": "e2", "source": "psv", "target": "t", "data": {}},
        ],
    )


def test_d1_old_bar_a_key_is_not_converted():
    with pytest.raises(ModelInputError, match="PSV-7.*set pressure \\(barg\\) missing"):
        GraphParser.parse_graph(_graph({"set_pressure_bar": 20.0}))


def test_d1_barg_key_is_read():
    net = GraphParser.parse_graph(_graph({"set_pressure_barg": 12.5, "forced_state": "forced_open"}))
    psv = net.nodes["psv"]
    assert psv.set_pressure_barg == 12.5 and psv.forced_state == "forced_open"
