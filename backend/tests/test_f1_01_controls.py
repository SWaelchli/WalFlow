"""F1-01: pressure controllers settle on their setpoints, whatever the settings or the click history."""
import pytest

from physics_refs import node_named, solve, solve_example
from simulation.equipment.filter import Filter
from simulation.equipment.linear_regulator import LinearRegulator
from simulation.equipment.orifice import Orifice
from simulation.equipment.pipe import Pipe
from simulation.equipment.tank import Tank
from simulation.equipment.volumetric_pump import VolumetricPump
from simulation.solver import NetworkSolver

API682 = "Example_API_682_Seal_Flush"
ID = 0.0266


def _controllers(net):
    return node_named(net, "Seal Supply PRV (10 bar)"), node_named(net, "Seal Return BPR (8 bar)")


def test_api_682_prv_and_bpr_hold_both_setpoints():
    net, stats = solve_example(API682)
    prv, bpr = _controllers(net)
    assert stats["success"] and stats["controls_converged"] and not stats["saturated_controllers"]
    # audit: PRV out 8.83 / 3.59 / 9.75 / 10.06 bar and BPR in 6.57 / 8.54 / 7.93 / 7.86 bar, depending on settings
    assert prv.outlets[0].pressure / 1e5 == pytest.approx(10.0, abs=2e-3)
    assert bpr.inlets[0].pressure / 1e5 == pytest.approx(8.0, abs=2e-3)
    assert 0.0 < prv.opening_pct < 100.0 and 0.0 < bpr.opening_pct < 100.0


@pytest.mark.parametrize("settings", [
    {"damping_factor": 0.02, "control_iterations": 3000},
    {"damping_factor": 0.5},
    {"control_iterations": 30},
    {"warm_start": False},
])
def test_result_does_not_depend_on_damping_iteration_limit_or_warm_start(settings):
    ref_net, _ = solve_example(API682)
    net, stats = solve_example(API682, **settings)
    assert stats["controls_converged"]
    for name in ("Seal Supply PRV (10 bar)", "Seal Return BPR (8 bar)"):
        assert node_named(net, name).opening_pct == pytest.approx(node_named(ref_net, name).opening_pct, rel=1e-3)


@pytest.mark.parametrize("example,case", [(API682, None), ("Example_Pressure_Regulation", None), ("Example_API_614_LOS", "Case 1")])
def test_first_and_second_run_agree(example, case):
    """F1-14: the answer may not depend on what was solved before (warm-start cache)."""
    NetworkSolver.clear_warm_start_cache()
    net1, s1 = solve_example(example, case)
    net2, s2 = solve_example(example, case)              # now starts from the cached solution
    assert s1["warm_start_status"] == "Cold Start" and s2["warm_start_status"] != "Cold Start"
    for nid, n1 in net1.nodes.items():
        n2 = net2.nodes[nid]
        if hasattr(n1, "opening_pct") and n1.node_type in ("linear_regulator", "remote_control_valve"):
            assert n2.opening_pct == pytest.approx(n1.opening_pct, rel=1e-3, abs=1e-3)
        if n1.outlets:
            assert n2.outlets[0].pressure == pytest.approx(n1.outlets[0].pressure, rel=1e-4, abs=5.0)


def test_pd_pump_fixes_the_flow_so_the_prv_cannot_regulate():
    """The audit's original (over-constrained) API 682: PD pump flow is fixed, the BPR sets the pressure,
    so the PRV is wide open and the solver says so instead of oscillating."""
    nodes = {
        "t1": Tank("Reservoir", fluid_level=1.5),
        "pump": VolumetricPump("PD Pump", flow_rated=35.0 / 60000.0, motor_power=3000.0, efficiency=0.85),
        "prv": LinearRegulator("PRV", max_cv=6.0, set_pressure=10.0e5, backpressure=False),
        "ori": Orifice("Seal restriction", pipe_diameter=ID, orifice_diameter=0.008),
        "bpr": LinearRegulator("BPR", max_cv=6.0, set_pressure=8.0e5, backpressure=True),
        "t2": Tank("Return", fluid_level=1.5),
    }
    edges = [
        {"source": "t1", "target": "pump", "pipe": Pipe("p1", 2, ID)},
        {"source": "pump", "target": "prv", "pipe": Pipe("p2", 2, ID)},
        {"source": "prv", "target": "ori", "pipe": Pipe("p3", 2, ID)},
        {"source": "ori", "target": "bpr", "pipe": Pipe("p4", 2, ID)},
        {"source": "bpr", "target": "t2", "pipe": Pipe("p5", 2, ID)},
    ]
    stats = solve(nodes, edges)
    assert stats["success"] and stats["controls_converged"]
    assert [(s["name"], s["state"]) for s in stats["saturated_controllers"]] == [("PRV", "wide_open")]
    assert nodes["bpr"].inlets[0].pressure / 1e5 == pytest.approx(8.0, abs=2e-3)
    assert nodes["prv"].outlets[0].pressure / 1e5 < 10.0


def test_iteration_limit_is_reported_not_hidden():
    net, stats = solve_example("Example_Pressure_Regulation", control_iterations=2)
    assert stats["success"]
    assert stats["controls_converged"] is False
    assert stats["outer_iterations"] == 2


def test_wrong_acting_remote_valve_runs_to_an_end_stop_and_says_why():
    """Downstream-mode RCV sensing a point upstream of itself: opening lowers the sensed pressure, so the
    loop runs wide open like a real wrong-acting controller; the report flags it instead of looking normal."""
    from simulation.equipment.pressure_source import PressureSource
    from simulation.equipment.remote_control_valve import RemoteControlValve
    nodes = {
        "src": PressureSource("Supply", source_pressure=6e5),
        "ori": Orifice("Upstream restriction", pipe_diameter=ID, orifice_diameter=0.01),
        "rcv": RemoteControlValve("RCV", max_cv=5.0, set_pressure=5.0e5, backpressure=False),
        "t": Tank("Sink", fluid_level=0.0),
    }
    nodes["rcv"].remote_sensing_config = {"node_id": "ori", "port_type": "outlet", "port_idx": 0}
    edges = [
        {"source": "src", "target": "ori", "pipe": Pipe("p1", 1, ID)},
        {"source": "ori", "target": "rcv", "pipe": Pipe("p2", 1, ID)},
        {"source": "rcv", "target": "t", "pipe": Pipe("p3", 1, ID)},
    ]
    stats = solve(nodes, edges)
    [sat] = stats["saturated_controllers"]
    assert sat["name"] == "RCV" and sat["state"] == "wide_open" and sat["reverse_acting"] is True
