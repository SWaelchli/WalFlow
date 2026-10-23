
from physics_refs import water_head
from simulation.equipment.tank import Tank
from simulation.equipment.centrifugal_pump import CentrifugalPump
from simulation.equipment.pressure_safety_valve import PressureSafetyValve
from simulation.equipment.pipe import Pipe
from simulation.schemas import HydraulicNetwork
from simulation.solver import NetworkSolver

def test_psv_pop_action_cracking():
    tank_in = Tank(name="Supply Tank", elevation=0.0, fluid_level=2.0)
    pump = CentrifugalPump(name="Feed Pump", flow_rated=0.002, head_rated=water_head(500000.0)) # 5 bar
    psv = PressureSafetyValve(name="PSV-101", set_pressure_barg=2.0, cv=10.0, action_mode="pop_action")
    tank_out = Tank(name="Drain Tank", elevation=0.0, fluid_level=0.0)

    pipe1 = Pipe(name="p1", length=5.0, diameter=0.05)
    pipe2 = Pipe(name="p2", length=5.0, diameter=0.05)
    pipe3 = Pipe(name="p3", length=5.0, diameter=0.05)

    nodes = {"t1": tank_in, "pump": pump, "psv": psv, "t2": tank_out}
    edges = [
        {"id": "e1", "source": "t1", "target": "pump", "pipe": pipe1},
        {"id": "e2", "source": "pump", "target": "psv", "pipe": pipe2},
        {"id": "e3", "source": "psv", "target": "t2", "pipe": pipe3}
    ]

    net = HydraulicNetwork(nodes=nodes, edges=edges)
    solver = NetworkSolver(net)
    stats = solver.solve()

    assert stats["success"] is True
    # The pump holds the inlet above 110 % of set (2.2 barg) even at full lift: overcapacity (F1-38)
    p_in, p_out = psv.inlets[0].pressure, psv.outlets[0].pressure
    assert psv.lift_state == "open" and (p_in - 101325.0) / 1e5 > 2.2
    assert psv.status == "overcapacity"
    assert psv.inlets[0].flow_rate > 0.0001
    # Same Cv at the rated point: Q/Q_rated = √(ΔP / ΔP_rated), ΔP_rated = 1.1·set (gauge) + P_atm − P_out
    expected = 100.0 * ((p_in - p_out) / (2.2e5 + 101325.0 - p_out)) ** 0.5
    assert abs(psv.capacity_utilization_pct - expected) < 0.1

def test_psv_unmitigated_higher_pressure():
    tank_in = Tank(name="Supply Tank", elevation=0.0, fluid_level=2.0)
    pump = CentrifugalPump(name="Feed Pump", flow_rated=0.002, head_rated=water_head(600000.0)) # 6 bar
    psv = PressureSafetyValve(name="PSV-101", set_pressure_barg=3.0, cv=15.0, action_mode="pop_action")
    tank_out = Tank(name="Drain Tank", elevation=0.0, fluid_level=0.0)

    pipe1 = Pipe(name="p1", length=5.0, diameter=0.05)
    pipe2 = Pipe(name="p2", length=5.0, diameter=0.05)
    pipe3 = Pipe(name="p3", length=5.0, diameter=0.05)

    nodes = {"t1": tank_in, "pump": pump, "psv": psv, "t2": tank_out}
    edges = [
        {"id": "e1", "source": "t1", "target": "pump", "pipe": pipe1},
        {"id": "e2", "source": "pump", "target": "psv", "pipe": pipe2},
        {"id": "e3", "source": "psv", "target": "t2", "pipe": pipe3}
    ]

    net = HydraulicNetwork(nodes=nodes, edges=edges)
    solver = NetworkSolver(net)

    # 1. Unmitigated pass (PSV forced closed)
    psv.forced_state = "forced_closed"
    solver.solve()
    p_unmitigated = psv.inlets[0].pressure

    # 2. Mitigated pass (PSV auto)
    psv.forced_state = "auto"
    solver.solve()
    p_mitigated = psv.inlets[0].pressure

    assert p_unmitigated > p_mitigated

def test_psv_modulating_and_pop_latching():
    tank_in = Tank(name="Supply Tank", elevation=0.0, fluid_level=2.0)
    pump = CentrifugalPump(name="Feed Pump", flow_rated=0.002, head_rated=water_head(400000.0)) # 4 bar
    psv = PressureSafetyValve(name="PSV-102", set_pressure_barg=2.5, cv=10.0, action_mode="modulating",
                              valve_type="balanced_bellows")   # lift from the inlet gauge pressure
    tank_out = Tank(name="Drain Tank", elevation=0.0, fluid_level=0.0)

    pipe1 = Pipe(name="p1", length=5.0, diameter=0.05)
    pipe2 = Pipe(name="p2", length=5.0, diameter=0.05)
    pipe3 = Pipe(name="p3", length=5.0, diameter=0.05)

    nodes = {"t1": tank_in, "pump": pump, "psv": psv, "t2": tank_out}
    edges = [
        {"id": "e1", "source": "t1", "target": "pump", "pipe": pipe1},
        {"id": "e2", "source": "pump", "target": "psv", "pipe": pipe2},
        {"id": "e3", "source": "psv", "target": "t2", "pipe": pipe3}
    ]

    net = HydraulicNetwork(nodes=nodes, edges=edges)
    solver = NetworkSolver(net)

    # Modulating test: lift linear from set (2.5 barg) to full lift at +10 % (2.75 barg)
    stats = solver.solve()
    assert stats["success"] is True
    assert psv.status == "modulating"
    p_in_g = (psv.inlets[0].pressure - 101325.0) / 1e5
    assert 2.5 < p_in_g < 2.75
    assert abs(psv.lift_pct - 100.0 * (p_in_g - 2.5) / 0.25) < 0.01

    # Pop latching: opens and stays at full lift
    psv.action_mode = "pop_latching"
    psv.reset_run_state()
    stats = solver.solve()
    assert stats["success"] is True
    assert psv.is_burst is True
    assert psv.status in ["open", "overcapacity"] and psv.lift_pct == 100.0


# --- valve type: backpressure dependency, pilot sensing; action modes -------------------------------

import json
import os

import numpy as np

import pytest

from physics_refs import solve
from routers.simulation import extract_telemetry
from simulation.equipment.pressure_source import PressureSource
from simulation.fluid_utils import FluidProperties
from simulation.graph_parser import GraphParser
from simulation.schemas import GlobalSettings, ReactFlowGraph
from simulation.solver import run_sequential_relief_simulation
from walflow_paths import EXAMPLES_DIR

P_ATM = 101325.0
BIG = 0.2   # DN200: pipe losses negligible against the valve


def _header_psv_tank(psv, header_barg, tank_level_m=0.0, outlet_pipe=(1.0, BIG)):
    """Header (fixed pressure) → PSV → tank; the tank level sets the superimposed backpressure."""
    nodes = {"src": PressureSource("Header", source_pressure=P_ATM + header_barg * 1e5), "psv": psv,
             "t": Tank("Drain", fluid_level=tank_level_m)}
    edges = [
        {"id": "e1", "source": "src", "target": "psv", "pipe": Pipe("p1", 1.0, BIG)},
        {"id": "e2", "source": "psv", "target": "t", "pipe": Pipe("p2", *outlet_pipe)},
    ]
    return nodes, edges


def _relief_run(nodes, edges):
    gs = GlobalSettings()
    for n in nodes.values():
        n.global_settings = gs
    for e in edges:
        e["pipe"].global_settings = gs
    net = HydraulicNetwork(nodes=nodes, edges=edges)
    stats, tel, _, _, _ = run_sequential_relief_simulation(net, NetworkSolver(net), extract_telemetry)
    assert stats["success"]
    return tel


@pytest.mark.parametrize("valve_type, design_sb_barg, header_barg, opens", [
    # Backpressure from 20 m of water ≈ 1.96 bar, set 5 barg
    ("conventional", 0.0, 6.5, False),       # 6.5 − 1.96 < 5: the backpressure holds the disc down
    ("conventional", 0.0, 7.3, True),        # 7.3 − 1.96 > 5
    ("conventional", 2.0, 5.2, True),        # CDTP 3: 5.2 − 1.96 > 3
    ("conventional", 2.0, 4.8, False),       # 4.8 − 1.96 < 3
    ("balanced_bellows", 0.0, 5.2, True),    # inlet gauge pressure only
    ("balanced_bellows", 0.0, 4.8, False),
])
def test_conventional_opening_shifts_with_backpressure(valve_type, design_sb_barg, header_barg, opens):
    bp_bar = FluidProperties.get_density("water", 293.15) * 9.81 * 20.0 / 1e5
    assert 1.9 < bp_bar < 2.0
    psv = PressureSafetyValve("PSV", set_pressure_barg=5.0, cv=2.0, action_mode="modulating",
                              valve_type=valve_type, design_superimposed_bp_barg=design_sb_barg)
    nodes, edges = _header_psv_tank(psv, header_barg, tank_level_m=20.0)
    assert solve(nodes, edges)["success"]
    assert (psv.inlets[0].flow_rate > 1e-6) == opens


@pytest.mark.parametrize("valve_type, limit, exceeded", [
    ("conventional", 10.0, True),         # built-up backpressure against 10 % of set
    ("balanced_bellows", 50.0, False),    # total backpressure against 50 % of set
    ("pilot", None, False),               # independent of backpressure
])
def test_backpressure_result_and_limit(valve_type, limit, exceeded):
    """Header 6 barg → PSV set 5 barg → 5 m of 15 mm pipe → drain at level 0: built-up = outlet line loss."""
    psv = PressureSafetyValve("PSV", set_pressure_barg=5.0, cv=2.0, action_mode="modulating", valve_type=valve_type)
    tel = _relief_run(*_header_psv_tank(psv, 6.0, outlet_pipe=(5.0, 0.015)))
    dev = tel["relief"]["devices"]["psv"]
    p_out_g = (psv.outlets[0].pressure - P_ATM) / 1e5
    assert dev["superimposed_bp_barg"] == pytest.approx(0.0, abs=1e-3)   # drain at level 0, no flow while closed
    assert dev["built_up_bp_barg"] == pytest.approx(p_out_g, abs=1e-3)
    assert dev["bp_limit_pct"] == limit and dev["bp_exceeded"] is exceeded
    assert tel["nodes"]["psv"]["backpressure"]["built_up_bp_barg"] == dev["built_up_bp_barg"]   # same result on the node
    if limit is None:
        assert dev["bp_pct_of_set"] is None
    else:
        assert dev["bp_pct_of_set"] == pytest.approx(100.0 * p_out_g / 5.0, abs=0.01)


def _pilot_graph(with_line: bool, valve_type: str = "pilot"):
    """Header 10.5 barg → 2 m DN200 → splitter → 20 m of 20 mm pipe → PSV (set 10 barg, modulating) → drain."""
    edges = [
        {"id": "e1", "source": "src", "target": "sp", "data": {"length_m": 2.0, "diameter_m": BIG}},
        {"id": "e2", "source": "sp", "target": "psv", "data": {"length_m": 20.0, "diameter_m": 0.02}},
        {"id": "e3", "source": "psv", "target": "t", "data": {"length_m": 1.0, "diameter_m": BIG}},
    ]
    if with_line:
        edges.append({"id": "s1", "source": "sp", "sourceHandle": "signal-inlet-0", "target": "psv",
                      "targetHandle": "signal-in", "data": {"type": "SIGNAL"}})
    return ReactFlowGraph(
        nodes=[
            {"id": "src", "type": "pressure_source", "position": {"x": 0, "y": 0},
             "data": {"label": "S", "source_pressure_bara": 10.5 + P_ATM / 1e5}},
            {"id": "sp", "type": "splitter", "position": {"x": 0, "y": 0}, "data": {"label": "SP"}},
            {"id": "psv", "type": "pressure_safety_valve", "position": {"x": 0, "y": 0},
             "data": {"label": "PSV", "set_pressure_barg": 10.0, "cv": 1.0, "action_mode": "modulating",
                      "valve_type": valve_type}},
            {"id": "t", "type": "tank", "position": {"x": 0, "y": 0}, "data": {"label": "T", "level_m": 0.0}},
        ],
        edges=edges,
    )


def test_pilot_lift_follows_the_remote_sensing_point():
    """Modulating pilot: lift from the sensed (splitter) pressure, not from its own inlet behind a lossy line."""
    net = GraphParser.parse_graph(_pilot_graph(with_line=True))
    psv = net.nodes["psv"]
    assert psv.has_remote_pilot
    assert NetworkSolver(net).solve()["success"]
    p_sp_g = (net.nodes["sp"].inlets[0].pressure - P_ATM) / 1e5
    p_in_g = (psv.inlets[0].pressure - P_ATM) / 1e5
    assert p_in_g < p_sp_g - 0.05                       # the sensing line bypasses a real line loss
    assert psv.lift_pct == pytest.approx(100.0 * (p_sp_g - 10.0) / 1.0, abs=0.05)

    own = GraphParser.parse_graph(_pilot_graph(with_line=False))
    assert not own.nodes["psv"].has_remote_pilot
    assert NetworkSolver(own).solve()["success"]
    p_own_g = (own.nodes["psv"].inlets[0].pressure - P_ATM) / 1e5
    assert own.nodes["psv"].lift_pct == pytest.approx(100.0 * (p_own_g - 10.0) / 1.0, abs=0.05)
    assert own.nodes["psv"].lift_pct < psv.lift_pct


def test_pilot_line_is_ignored_unless_the_valve_is_pilot_operated():
    net = GraphParser.parse_graph(_pilot_graph(with_line=True, valve_type="balanced_bellows"))
    assert net.nodes["psv"].remote_sensing_config is None and not net.nodes["psv"].has_remote_pilot


def _example(edits=None, case_prefix=None):
    data = json.load(open(os.path.join(EXAMPLES_DIR, "Example_Multi_PSV_Protection.wlf"), encoding="utf-8"))
    for n in data["nodes"]:
        n["data"].update((edits or {}).get(n["id"], {}))
    if case_prefix:
        data["active_case_id"] = next(c["id"] for c in data["cases"] if c["name"].startswith(case_prefix))
    net = GraphParser.parse_graph(ReactFlowGraph(**data))
    stats, _, _, _, _ = run_sequential_relief_simulation(net, NetworkSolver(net), extract_telemetry)
    assert stats["success"]
    return net


def test_example_pilot_senses_the_pump_discharge():
    """PSV-102 (pilot, modulating, 24 barg) senses the pump outlet port through its pilot line."""
    net = _example(case_prefix="PSV-101 blocked")
    psv, pump = net.nodes["node_psv_secondary"], net.nodes["node_hp_pump"]
    assert psv.status == "modulating"
    p_pump_g = (pump.outlets[0].pressure - P_ATM) / 1e5
    assert psv.lift_pct == pytest.approx(100.0 * (p_pump_g - 24.0) / 2.4, abs=0.05)


def test_example_pop_and_modulating_differ():
    pop = _example().nodes["node_psv_primary"]
    mod = _example({"node_psv_primary": {"action_mode": "modulating"}}).nodes["node_psv_primary"]
    assert pop.status == "open" and pop.lift_pct == 100.0
    assert mod.status == "modulating" and mod.lift_pct < 99.0
    assert mod.inlets[0].pressure - pop.inlets[0].pressure > 3e5   # pop falls well below set, modulating holds above


def _oversized_pop(action_mode):
    """3 barg pop PSV with Cv 15 behind a 6 bar pump: at full lift its inlet falls below reseat."""
    psv = PressureSafetyValve("PSV", set_pressure_barg=3.0, cv=15.0, action_mode=action_mode,
                              blowdown_pct=7.0, valve_type="balanced_bellows")
    nodes = {
        "t1": Tank("Supply", fluid_level=2.0),
        "pump": CentrifugalPump("Pump", flow_rated=0.002, head_rated=water_head(6e5)),
        "psv": psv,
        "t2": Tank("Drain", fluid_level=0.0),
    }
    edges = [
        {"id": "e1", "source": "t1", "target": "pump", "pipe": Pipe("p1", 5.0, 0.05)},
        {"id": "e2", "source": "pump", "target": "psv", "pipe": Pipe("p2", 5.0, 0.05)},
        {"id": "e3", "source": "psv", "target": "t2", "pipe": Pipe("p3", 5.0, 0.05)},
    ]
    assert solve(nodes, edges)["success"]
    return psv


def test_cycling_reports_reseat_to_set_range_and_average_load():
    psv = _oversized_pop("pop_action")
    assert psv.status == "cycling" and psv.lift_pct is None
    assert psv.cycle_low_barg == pytest.approx(3.0 * 0.93, abs=1e-6)    # reseat = set·(1 − blowdown)
    assert psv.cycle_high_barg == pytest.approx(3.0, abs=1e-6)
    p_in_g = (psv.inlets[0].pressure - P_ATM) / 1e5
    assert 3.0 <= p_in_g <= 3.0 * 1.01 + 1e-6      # the average state holds the inlet at set
    assert psv.inlets[0].flow_rate > 1e-4            # average relief load


def test_pop_latching_stays_open_below_reseat():
    psv = _oversized_pop("pop_latching")
    assert psv.status == "open" and psv.lift_pct == 100.0
    assert (psv.inlets[0].pressure - P_ATM) / 1e5 < psv.reseat_pressure_barg
    assert psv.cycle_low_barg is None


def test_closed_valve_sees_the_header_pressure_of_a_relieving_neighbour():
    """PSV-A relieves into a shared header with a lossy line to the drain; PSV-B stays closed on that header.
    Its superimposed (= total) backpressure is the final header pressure, not the one without relief."""
    from simulation.equipment.mixer import Mixer
    a = PressureSafetyValve("A", set_pressure_barg=5.0, cv=2.0, action_mode="modulating", valve_type="balanced_bellows")
    b = PressureSafetyValve("B", set_pressure_barg=10.0, cv=2.0, action_mode="modulating", valve_type="balanced_bellows")
    nodes = {"sa": PressureSource("SA", source_pressure=P_ATM + 6e5), "sb": PressureSource("SB", source_pressure=P_ATM + 2e5),
             "a": a, "b": b, "hdr": Mixer("Header"), "t": Tank("Drain", fluid_level=0.0)}
    edges = [
        {"id": "e1", "source": "sa", "target": "a", "pipe": Pipe("p1", 1.0, BIG)},
        {"id": "e2", "source": "sb", "target": "b", "pipe": Pipe("p2", 1.0, BIG)},
        {"id": "e3", "source": "a", "target": "hdr", "target_port": "inlet-0", "pipe": Pipe("p3", 1.0, BIG)},
        {"id": "e4", "source": "b", "target": "hdr", "target_port": "inlet-1", "pipe": Pipe("p4", 1.0, BIG)},
        {"id": "e5", "source": "hdr", "target": "t", "pipe": Pipe("p5", 5.0, 0.015)},
    ]
    tel = _relief_run(nodes, edges)
    dev_b = tel["relief"]["devices"]["b"]
    hdr_g = (b.outlets[0].pressure - P_ATM) / 1e5
    assert a.status != "closed" and b.status == "closed"
    assert hdr_g > 0.2
    assert dev_b["superimposed_bp_barg"] == pytest.approx(hdr_g, abs=1e-3)
    assert dev_b["total_bp_barg"] == dev_b["superimposed_bp_barg"] and dev_b["built_up_bp_barg"] == 0.0


def test_pilot_result_does_not_depend_on_node_order():
    """The pilot senses the splitter outlet; with the PSV listed first, the result pass must still use the
    solved splitter pressure (not the port value from before the solve)."""
    graph = _pilot_graph(with_line=True)
    graph.edges[-1].sourceHandle = "signal-outlet-0"
    graph.nodes.sort(key=lambda n: n.id != "psv")
    net = GraphParser.parse_graph(graph)
    assert list(net.nodes)[0] == "psv"
    solver = NetworkSolver(net)
    assert solver.solve()["success"]
    psv, sp = net.nodes["psv"], net.nodes["sp"]
    p_sp_g = (sp.outlets[0].pressure - P_ATM) / 1e5
    assert psv.lift_pct == pytest.approx(100.0 * (p_sp_g - 10.0) / 1.0, abs=0.05)
    # One result pass from the solved state, with the sensed port still at its value from before the solve
    p_int = np.array([solver.nodes_list[i].inlets[0].pressure for i in solver.internal_node_indices])
    q = np.array([e["pipe"].inlets[0].flow_rate for e in solver.edges_list])
    sp.outlets[0].pressure = P_ATM
    solver._update_telemetry(p_int, q)
    assert psv.lift_pct == pytest.approx(100.0 * (p_sp_g - 10.0) / 1.0, abs=0.05)


def test_pilot_keeps_its_first_sensing_line():
    graph = _pilot_graph(with_line=True)
    graph.edges.append(graph.edges[-1].model_copy(update={"id": "s2", "source": "src", "sourceHandle": "signal-outlet-0"}))
    net = GraphParser.parse_graph(graph)
    assert net.nodes["psv"].remote_sensing_config["node_id"] == "sp"


def test_pilot_sensing_a_point_outside_the_solve_senses_its_own_inlet():
    """A tap on a dead-end branch is left out of the solve: the pilot then senses its own inlet."""
    graph = _pilot_graph(with_line=False)
    graph.nodes.append(graph.nodes[1].model_copy(update={"id": "mp", "type": "measure_point", "data": {"label": "MP"}}))
    graph.edges.append(graph.edges[0].model_copy(update={"id": "e4", "source": "sp", "target": "mp"}))
    graph.edges.append(graph.edges[0].model_copy(update={"id": "s1", "source": "mp", "sourceHandle": "signal-inlet-0",
                                                         "target": "psv", "targetHandle": "signal-in",
                                                         "data": {"type": "SIGNAL"}}))
    net = GraphParser.parse_graph(graph)
    psv = net.nodes["psv"]
    assert psv.pilot_source is not None
    assert NetworkSolver(net).solve()["success"]
    assert not psv.has_remote_pilot
    p_own_g = (psv.inlets[0].pressure - P_ATM) / 1e5
    assert psv.lift_pct == pytest.approx(100.0 * (p_own_g - 10.0) / 1.0, abs=0.05)
    assert psv.inlet_opening_pressure_pa() == psv.set_pressure_pa


@pytest.mark.parametrize("handle, expected", [
    ("signal-inlet-0", ("inlet", 0)),
    ("signal-outlet-2", ("outlet", 2)),
    ("inlet-1", ("inlet", 1)),
    ("signal-out", ("outlet", 0)),      # malformed: legacy node-level sensing, no crash
    (None, ("outlet", 0)),
])
def test_signal_handle_parsing(handle, expected):
    from simulation.graph_parser import _parse_signal_handle
    assert _parse_signal_handle(handle) == expected
