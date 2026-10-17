"""F1-10: a circuit without a pressure reference is an error with a message, not a silent success."""
import pytest

pytestmark = pytest.mark.audit("F1-10")

from physics_refs import solve
from simulation.equipment.centrifugal_pump import CentrifugalPump
from simulation.equipment.linear_control_valve import LinearControlValve
from simulation.equipment.pipe import Pipe
from simulation.equipment.tank import Tank

ID = 0.05


def test_closed_loop_without_tank_is_reported():
    nodes = {
        "pump": CentrifugalPump("Loop Pump", flow_rated=0.002, head_rated=30.0),
        "valve": LinearControlValve("Loop Valve", max_cv=10.0),
    }
    edges = [
        {"source": "pump", "target": "valve", "pipe": Pipe("p1", 5, ID)},
        {"source": "valve", "target": "pump", "pipe": Pipe("p2", 5, ID)},
    ]
    stats = solve(nodes, edges)
    assert stats["success"] is False
    assert "No pressure reference" in stats["error"]
    assert "Loop Pump" in stats["error"] and "Loop Valve" in stats["error"]
    assert "no tank, pressure source or flow source" in stats["error"]


def test_same_loop_with_a_tank_solves():
    nodes = {
        "t": Tank("Header Tank", fluid_level=2.0),
        "pump": CentrifugalPump("Loop Pump", flow_rated=0.002, head_rated=30.0),
        "valve": LinearControlValve("Loop Valve", max_cv=10.0),
    }
    edges = [
        {"source": "t", "target": "pump", "pipe": Pipe("p0", 1, ID)},
        {"source": "pump", "target": "valve", "pipe": Pipe("p1", 5, ID)},
        {"source": "valve", "target": "t", "pipe": Pipe("p2", 5, ID)},
    ]
    stats = solve(nodes, edges)
    assert stats["success"] and nodes["pump"].inlets[0].flow_rate > 0


def test_an_unconnected_component_is_not_an_error():
    # A valve dropped on the canvas but not yet wired up must not block the rest of the diagram
    nodes = {
        "t1": Tank("A", fluid_level=3.0),
        "t2": Tank("B", fluid_level=0.0),
        "loose": LinearControlValve("Loose Valve", max_cv=10.0),
    }
    stats = solve(nodes, [{"source": "t1", "target": "t2", "pipe": Pipe("p", 5, ID)}])
    assert stats["success"]


def test_pump_switched_off_between_a_tank_and_a_dead_end_is_not_an_island():
    pump = CentrifugalPump("Off Pump", flow_rated=0.002, head_rated=30.0)
    pump.active = False
    nodes = {
        "t": Tank("Header Tank", fluid_level=2.0),
        "pump": pump,
        "valve": LinearControlValve("Downstream Valve", max_cv=10.0),
        "t2": Tank("Sink", fluid_level=0.0),
    }
    edges = [
        {"source": "t", "target": "pump", "pipe": Pipe("p0", 1, ID)},
        {"source": "pump", "target": "valve", "pipe": Pipe("p1", 5, ID)},
        {"source": "valve", "target": "t2", "pipe": Pipe("p2", 5, ID)},
    ]
    assert solve(nodes, edges)["success"]


def test_island_error_is_passed_to_the_user_by_the_relief_wrapper():
    from routers.simulation import extract_telemetry
    from simulation.schemas import HydraulicNetwork, GlobalSettings
    from simulation.solver import NetworkSolver, run_sequential_relief_simulation

    nodes = {
        "pump": CentrifugalPump("Loop Pump", flow_rated=0.002, head_rated=30.0),
        "valve": LinearControlValve("Loop Valve", max_cv=10.0),
    }
    gs = GlobalSettings()
    for n in nodes.values():
        n.global_settings = gs
    pipes = [Pipe("p1", 5, ID), Pipe("p2", 5, ID)]
    for p in pipes:
        p.global_settings = gs
    edges = [{"id": "e1", "source": "pump", "target": "valve", "pipe": pipes[0]}, {"id": "e2", "source": "valve", "target": "pump", "pipe": pipes[1]}]
    network = HydraulicNetwork(nodes=nodes, edges=edges)
    stats, *_ = run_sequential_relief_simulation(network, NetworkSolver(network), extract_telemetry)
    assert stats["success"] is False and stats["error_kind"] == "no_pressure_reference"
