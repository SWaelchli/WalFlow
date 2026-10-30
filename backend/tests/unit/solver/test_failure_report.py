"""A failed solve names the component to select and keeps the raw solver text apart from the message."""
import pytest

from networks import oil_cooler_circuit_with_closed_prv
from physics_refs import solve
from simulation.equipment.linear_control_valve import LinearControlValve
from simulation.equipment.pipe import Pipe
from simulation.equipment.pressure_boundary import PressureBoundary
from simulation.equipment.tank import Tank

ID = 0.0266


def _network():
    nodes = {
        "src": PressureBoundary("Supply", set_pressure=5.0e5),
        "cv": LinearControlValve("Throttle", max_cv=5.0, opening_pct=50.0),
        "t": Tank("Sink", fluid_level=0.0),
    }
    edges = [
        {"id": "e1", "label": "Feed pipe", "source": "src", "target": "cv", "pipe": Pipe("Feed pipe", 2, ID)},
        {"id": "e2", "label": "Return pipe", "source": "cv", "target": "t", "pipe": Pipe("Return pipe", 2, ID)},
    ]
    return nodes, edges


def _raise(*args, **kwargs):
    raise ValueError("math domain error")


@pytest.mark.parametrize("target, method, expected", [
    pytest.param("cv", "calculate_delta_p", {"type": "Node", "id": None, "name": "Throttle"}, id="node-residual"),
    pytest.param("cv", "calculate", {"type": "Node", "id": None, "name": "Throttle"}, id="node-property-update"),
    pytest.param("pipe", "stagnation_delta_p", {"type": "Connection", "id": "e2", "name": "Return pipe"},
                 id="pipe-residual"),
    pytest.param("pipe", "calculate", {"type": "Connection", "id": "e2", "name": "Return pipe"},
                 id="pipe-property-update"),
])
def test_component_that_cannot_be_evaluated_is_named_without_python_text(monkeypatch, target, method, expected):
    nodes, edges = _network()
    part = nodes["cv"] if target == "cv" else edges[1]["pipe"]
    monkeypatch.setattr(part, method, _raise)
    stats = solve(nodes, edges)
    assert stats["success"] is False
    assert stats["error_kind"] == "out_of_range"
    if target == "cv":    # a node is addressed by its canvas id
        expected = {**expected, "id": part.id}
    assert stats["error_target"] == expected
    assert expected["name"] in stats["error"]
    assert "math domain" not in stats["error"] and "ValueError" not in stats["error"]
    assert "math domain error" in stats["error_detail"]


def test_plain_value_error_outside_a_component_is_generic_not_converged(monkeypatch):
    from simulation.solver import NetworkSolver
    monkeypatch.setattr(NetworkSolver, "_solve_mixing", lambda *a, **k: _raise_boom())
    nodes, edges = _network()
    stats = solve(nodes, edges)
    assert stats["success"] is False
    assert stats["error_kind"] == "not_converged"
    assert stats["error_target"] is None
    assert stats["error"] == "The solver did not converge. Check the inputs and the boundary pressures."
    assert "boom" in stats["error_detail"]


def _raise_boom():
    raise ValueError("boom")


def test_not_converged_message_is_short_and_keeps_the_raw_text_in_the_detail():
    _, stats = oil_cooler_circuit_with_closed_prv(inner_iterations=1)
    assert stats["success"] is False
    assert stats["error_kind"] == "not_converged"
    assert stats["error"].startswith("The solver did not converge")
    assert stats["error_target"]["type"] in ("Node", "Connection") and stats["error_target"]["name"] in stats["error"]
    assert "message=" not in stats["error"] and "max_residual" not in stats["error"]
    assert "max_residual" in stats["error_detail"]
