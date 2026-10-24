"""
The peak relief pressure is a steady state found on a ramp of the relief drivers
(pumps, sources), not an interpolation between the unmitigated and relieved states.
"""


import math

from physics_refs import water_head
from routers.simulation import extract_telemetry
from simulation.equipment.base_node import HydraulicNode
from simulation.equipment.tank import Tank
from simulation.equipment.centrifugal_pump import CentrifugalPump
from simulation.equipment.volumetric_pump import VolumetricPump
from simulation.equipment.pressure_source import PressureSource
from simulation.equipment.flow_source import FlowSource
from simulation.equipment.pressure_safety_valve import PressureSafetyValve
from simulation.equipment.rupture_disc import RuptureDisc
from simulation.equipment.pipe import Pipe
from simulation.schemas import HydraulicNetwork, GlobalSettings
from simulation.solver import NetworkSolver, run_sequential_relief_simulation

ID = 0.05
P_ATM_BAR = 1.01325


def barg(bara):
    """Set pressures are entered in barg; the reference values below are bar(a)."""
    return bara - P_ATM_BAR


def _network(nodes, edges):
    gs = GlobalSettings()
    for n in nodes.values():
        n.global_settings = gs
    for e in edges:
        e["pipe"].global_settings = gs
    return HydraulicNetwork(nodes=nodes, edges=edges)


def _run(net):
    return run_sequential_relief_simulation(net, NetworkSolver(net), extract_telemetry)


def _blocked_outlet_pump(psv):
    """Tank → centrifugal pump → PSV → drain: closing the PSV dead-heads the pump."""
    nodes = {
        "t1": Tank("Supply", fluid_level=2.0),
        "pump": CentrifugalPump("Pump", flow_rated=0.002, head_rated=water_head(600000.0)),
        "psv": psv,
        "t2": Tank("Drain", fluid_level=0.0),
    }
    edges = [
        {"id": "e1", "source": "t1", "target": "pump", "pipe": Pipe("p1", 5.0, ID)},
        {"id": "e2", "source": "pump", "target": "psv", "pipe": Pipe("p2", 5.0, ID)},
        {"id": "e3", "source": "psv", "target": "t2", "pipe": Pipe("p3", 5.0, ID)},
    ]
    return _network(nodes, edges)


def test_driver_flags():
    assert CentrifugalPump("P", 0.002, 30.0).is_relief_driver
    assert VolumetricPump("P", 0.001, 5000.0, 0.8).is_relief_driver
    assert PressureSource("S").is_relief_driver
    assert FlowSource("F").is_relief_driver
    assert not Tank("T").is_relief_driver
    assert not HydraulicNode("n", "generic").is_relief_driver
    assert PressureSource("S").relief_ramp_enabled   # on by default


def test_ramp_scales_and_restores_drivers():
    pump = CentrifugalPump("P", flow_rated=0.002, head_rated=30.0)
    c = pump.C_coeff
    pump.apply_relief_ramp(0.5)
    assert math.isclose(pump.head_shutoff, 30.0 * 1.2 * 0.25) and math.isclose(pump.flow_rated, 0.001)
    assert pump.C_coeff == c                          # affinity laws keep the curve shape
    pump.reset_relief_ramp()
    assert pump.head_rated == 30.0 and pump.flow_rated == 0.002

    src = PressureSource("S", source_pressure=1_101_325.0)
    src.apply_relief_ramp(0.5)
    assert math.isclose(src.source_pressure, 101325.0 + 500_000.0)
    src.reset_relief_ramp()
    assert src.source_pressure == 1_101_325.0


def test_pop_psv_opening_snapshot_is_at_set_pressure():
    psv = PressureSafetyValve("PSV-1", set_pressure_barg=barg(4.0), cv=15.0, action_mode="pop_action")
    net = _blocked_outlet_pump(psv)
    stats, tel, tel_unmit, has_psv, tel_peak = _run(net)
    assert stats["success"] and has_psv

    dev = tel["relief"]["devices"]["psv"]
    assert dev["opening_order"] == 1
    assert abs(dev["inlet_at_opening_bara"] - 4.0) < 0.01

    # Dead-headed pump: P_inlet = P_tank + λ²·ρg·H0, so λ² = (P_set − P_tank)/(P_unmit − P_tank)
    p_tank = tel_unmit["nodes"]["t1"]["outlets"][0]["pressure"] / 1e5
    p_unmit = dev["inlet_unmitigated_bara"]
    lam_expected = math.sqrt((4.0 - p_tank) / (p_unmit - p_tank))
    assert abs(dev["opening_ramp_pct"] / 100.0 - lam_expected) < 0.005

    # The peak is the higher of the opening snapshot (the closed PSV dead-heads the pump at its set pressure)
    # and the relieved state. The Cv 15 pop valve is oversized for this pump: it would cycle, so the
    # relieved state holds the inlet between set pressure and full lift at +10 %, which is the peak here.
    peak = tel["relief"]["peak"]
    assert psv.status == "cycling"
    p_set_g = 4.0 - P_ATM_BAR
    assert 4.0 <= dev["inlet_relieved_bara"] <= 4.0 + 0.1 * p_set_g
    assert peak["available"] and peak["pressure_bara"] == tel["kpis"]["relieved_pressure_bara"]
    assert tel["kpis"]["peak_pressure_bara"] == peak["pressure_bara"]
    if peak["source"] == "opening":
        assert tel_peak is not None and peak["device_ids"] == ["psv"]
        assert tel_peak["nodes"]["psv"]["forced_state"] == "auto"   # held closed by the method, not the user
    assert tel["kpis"]["unmitigated_peak_pressure_bara"] > peak["pressure_bara"]


def test_relieved_network_and_drivers_are_untouched_by_the_ramp():
    psv = PressureSafetyValve("PSV-1", set_pressure_barg=barg(4.0), cv=15.0, action_mode="pop_action")
    net = _blocked_outlet_pump(psv)
    stats, tel, *_ = _run(net)
    pump = net.nodes["pump"]
    assert pump.flow_rated == 0.002
    assert psv.status in ("modulating", "open", "cycling", "overcapacity")
    # Network ports still hold the relieved solution (KPIs read them after the call)
    assert math.isclose(psv.inlets[0].pressure, tel["nodes"]["psv"]["inlets"][0]["pressure"])


def test_rupture_disc_on_pressure_source():
    """Pressure source → disc → drain: closed disc sees the source pressure, λ is linear."""
    nodes = {
        "src": PressureSource("Header", source_pressure=1_001_325.0),   # 10 bar(a)
        "rd": RuptureDisc("RD-1", burst_pressure_barg=barg(5.0), cv=10.0),
        "t2": Tank("Drain", fluid_level=0.0),
    }
    edges = [
        {"id": "e1", "source": "src", "target": "rd", "pipe": Pipe("p1", 5.0, ID)},
        {"id": "e2", "source": "rd", "target": "t2", "pipe": Pipe("p2", 5.0, ID)},
    ]
    stats, tel, *_ = _run(_network(nodes, edges))
    assert stats["success"]
    dev = tel["relief"]["devices"]["rd"]
    assert abs(dev["inlet_at_opening_bara"] - 5.0) < 0.01
    lam_expected = (5.0 - 1.01325) / (10.01325 - 1.01325)
    assert abs(dev["opening_ramp_pct"] / 100.0 - lam_expected) < 0.002
    # The header itself holds 10 bar(a) only at λ = 1; the peak is the source at full pressure
    assert tel["relief"]["peak"]["available"]


def test_no_enabled_driver_reports_peak_unavailable():
    psv = PressureSafetyValve("PSV-1", set_pressure_barg=barg(4.0), cv=15.0, action_mode="pop_action")
    net = _blocked_outlet_pump(psv)
    net.nodes["pump"].relief_ramp_enabled = False
    stats, tel, _, _, tel_peak = _run(net)
    peak = tel["relief"]["peak"]
    assert stats["success"]
    assert peak["available"] is False and "Ramp during relief analysis" in peak["reason"]
    assert tel["kpis"]["peak_pressure_bara"] is None and tel_peak is None


def test_no_opening_peak_equals_relieved():
    psv = PressureSafetyValve("PSV-1", set_pressure_barg=barg(50.0), cv=15.0, action_mode="pop_action")
    net = _blocked_outlet_pump(psv)
    stats, tel, _, _, tel_peak = _run(net)
    peak = tel["relief"]["peak"]
    assert peak["available"] and peak["source"] == "relieved" and tel_peak is None
    assert peak["pressure_bara"] == tel["kpis"]["relieved_pressure_bara"]
    assert tel["relief"]["devices"]["psv"]["opening_order"] is None


def test_staggered_devices_open_in_order():
    """An undersized low-set PSV cannot hold the pressure, so the second device opens too."""
    nodes = {
        "t1": Tank("Supply", fluid_level=2.0),
        "pump": CentrifugalPump("Pump", flow_rated=0.004, head_rated=water_head(800000.0)),
        "psv1": PressureSafetyValve("PSV-1", set_pressure_barg=barg(4.0), cv=0.3, action_mode="pop_action"),
        "psv2": PressureSafetyValve("PSV-2", set_pressure_barg=barg(6.0), cv=20.0, action_mode="pop_action"),
        "t2": Tank("Drain 1", fluid_level=0.0),
        "t3": Tank("Drain 2", fluid_level=0.0),
    }
    edges = [
        {"id": "e1", "source": "t1", "target": "pump", "pipe": Pipe("p1", 5.0, ID)},
        {"id": "e2", "source": "pump", "target": "psv1", "pipe": Pipe("p2", 5.0, ID)},
        {"id": "e3", "source": "pump", "target": "psv2", "pipe": Pipe("p3", 5.0, ID)},
        {"id": "e4", "source": "psv1", "target": "t2", "pipe": Pipe("p4", 5.0, ID)},
        {"id": "e5", "source": "psv2", "target": "t3", "pipe": Pipe("p5", 5.0, ID)},
    ]
    stats, tel, *_ = _run(_network(nodes, edges))
    assert stats["success"]
    d1, d2 = tel["relief"]["devices"]["psv1"], tel["relief"]["devices"]["psv2"]
    assert d1["opening_order"] == 1 and d2["opening_order"] == 2
    assert abs(d1["inlet_at_opening_bara"] - 4.0) < 0.01
    assert abs(d2["inlet_at_opening_bara"] - 6.0) < 0.01
    assert d1["opening_ramp_pct"] < d2["opening_ramp_pct"]
    peak = tel["relief"]["peak"]
    assert peak["available"] and peak["pressure_bara"] >= 6.0 - 0.02
