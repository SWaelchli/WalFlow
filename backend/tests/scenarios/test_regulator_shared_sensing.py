"""Parallel remote control valves that hold the same point: one pressure, no unique opening each."""
import pytest

from networks import parallel_remote_valves
from physics_refs import solve


def _parallel(set_a, set_b, backpressure=False, **kwargs):
    nodes, edges = parallel_remote_valves(set_a, set_b, backpressure=backpressure, **kwargs)
    stats = solve(nodes, edges)
    assert stats["success"] and stats["controls_converged"]
    header_p = (nodes["sp"].inlets[0] if backpressure else nodes["mx"].outlets[0]).pressure / 1e5
    return nodes, stats, header_p


def _flow(node):
    return node.inlets[0].flow_rate * 60000.0


def _saturated(stats):
    return [(s["name"], s["state"]) for s in stats["saturated_controllers"]]


@pytest.mark.parametrize("set_bar, backpressure, consumer, flow_follows_friction", [
    # A shorter branch used to get less flow than a longer one, depending on the consumer opening
    pytest.param(5.0, False, 30.0, True, id="prv-consumer-30"),
    pytest.param(5.0, False, 100.0, True, id="prv-consumer-100"),
    pytest.param(7.0, True, 100.0, False, id="bpr"),
])
def test_equal_setpoints_share_control_at_one_opening(set_bar, backpressure, consumer, flow_follows_friction):
    nodes, stats, header = _parallel(set_bar, set_bar, len_a=1.0, len_b=10.0, backpressure=backpressure, consumer=consumer)
    assert header == pytest.approx(set_bar, abs=1e-3)
    assert nodes["a"].opening_pct == pytest.approx(nodes["b"].opening_pct, rel=1e-9)
    if flow_follows_friction:
        assert _flow(nodes["a"]) > _flow(nodes["b"])          # same opening, less pipe friction
    assert not stats["saturated_controllers"]


@pytest.mark.parametrize("consumer", [30.0, 100.0])
def test_equal_setpoints_split_in_proportion_to_cv(consumer):
    # Same opening and same pressure drop: flow scales with Cv (Q = Cv * sqrt(dP / SG))
    nodes, _, header = _parallel(5.0, 5.0, cv_a=5.0, cv_b=10.0, consumer=consumer)
    assert header == pytest.approx(5.0, abs=1e-3)
    assert _flow(nodes["b"]) / _flow(nodes["a"]) == pytest.approx(2.0, rel=0.02)


@pytest.mark.parametrize("set_a, set_b, regulating, closed", [(5.0, 5.1, "b", "a"), (5.1, 5.0, "a", "b")])
def test_prv_with_the_higher_setpoint_regulates_the_other_closes(set_a, set_b, regulating, closed):
    # Used to stop after 100 iterations with the header between both setpoints
    nodes, stats, header = _parallel(set_a, set_b)
    assert header == pytest.approx(max(set_a, set_b), abs=1e-3)
    assert _saturated(stats) == [(nodes[closed].name, "closed")]
    assert _flow(nodes[closed]) < 0.1
    assert stats["outer_iterations"] <= 25


@pytest.mark.parametrize("set_b, shared", [
    # 4 Pa apart: one opening holds the header within the 10 Pa tolerance of both setpoints
    pytest.param(5.00004, True, id="closer-than-half-the-tolerance-share-the-mean"),
    # 9 Pa apart: separate tiers, the higher setpoint regulates
    pytest.param(5.00009, False, id="just-beyond-half-the-tolerance-converge"),
])
def test_setpoints_near_the_tolerance_share_control_or_converge(set_b, shared):
    nodes, stats, header = _parallel(5.0, set_b)
    if shared:
        assert abs(header - 5.0) < 1e-4 and abs(header - set_b) < 1e-4
        assert nodes["a"].opening_pct == pytest.approx(nodes["b"].opening_pct, rel=1e-9)
    else:
        assert header == pytest.approx(set_b, abs=1e-4)
    assert stats["outer_iterations"] <= 25


def test_lower_prv_takes_over_when_the_higher_one_is_wide_open():
    # A (5.1 bar) is too small to reach its setpoint: it runs wide open and B holds 5.0 bar
    nodes, stats, header = _parallel(5.1, 5.0, cv_a=0.5, consumer=100.0)
    assert header == pytest.approx(5.0, abs=1e-3)
    assert nodes["a"].opening_pct == pytest.approx(100.0)
    assert 0.05 < nodes["b"].opening_pct < 100.0
    assert _saturated(stats) == [("A", "wide_open")]


def test_bpr_with_the_lower_setpoint_regulates_the_other_closes():
    nodes, stats, header = _parallel(7.1, 7.0, backpressure=True, consumer=100.0)
    assert header == pytest.approx(7.0, abs=1e-3)
    assert _saturated(stats) == [("A", "closed")]
    assert _flow(nodes["a"]) < 0.1
