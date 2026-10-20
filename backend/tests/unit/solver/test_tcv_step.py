"""One mix ratio update of the 3-way TCV loop (NetworkSolver._tcv_step) on stub nodes: the memory of the
previous iteration must not carry over across a regime change (end stop, retreat) and must damp overshoot."""
import math
from types import SimpleNamespace

import pytest

from simulation.solver import NetworkSolver

T_HOT, T_COLD = 80.0, 20.0
SPAN = T_HOT - T_COLD


def _logit(mix):
    return math.log(mix / (1.0 - mix))


def _tcv(mix, t_out, t_set, q_hot, q_cold):
    port = lambda t, q: SimpleNamespace(temperature=t, flow_rate=q, density=1000.0)
    return SimpleNamespace(mix_ratio=mix, set_temperature=t_set, hot_port_idx=0,
                           inlets=[port(T_HOT, q_hot), port(T_COLD, q_cold)], outlets=[port(t_out, q_hot + q_cold)])


def _step(node, tm):
    return NetworkSolver._tcv_step(NetworkSolver.__new__(NetworkSolver), node, tm)


def test_valve_at_its_end_stop_stays_there_when_the_closed_port_loses_flow():
    # Setpoint below the cold inlet: the valve went to its end stop in the previous iteration ("other");
    # the nearly closed hot port then carries no forward flow. It must not retreat to the old regular point.
    node = _tcv(NetworkSolver.TCV_MIX_MIN, t_out=T_COLD, t_set=15.0, q_hot=0.0, q_cold=1e-3)
    tm = {"alpha": 1.0, "z_regular": _logit(0.3), "kind": "other", "z": _logit(0.3), "err": 10.0}
    _step(node, tm)
    assert node.mix_ratio == NetworkSolver.TCV_MIX_MIN


def test_first_regular_step_after_a_non_regular_one_uses_the_mixing_balance():
    # The previous point was not a regular step (e.g. a retreat): a secant through it spans two regimes.
    # Mass-weighted balance at w = 0.6: dT/dz = SPAN * 0.6 * 0.4.
    mix, err = 0.6, 5.0
    node = _tcv(mix, t_out=50.0 + err, t_set=50.0, q_hot=0.6e-3, q_cold=0.4e-3)
    tm = {"alpha": 1.0, "z_regular": _logit(0.3), "kind": "other", "z": _logit(0.3), "err": 2.5}
    _step(node, tm)
    expected = 1.0 / (1.0 + math.exp(-(_logit(mix) - err / (SPAN * 0.24))))
    assert node.mix_ratio == pytest.approx(expected, rel=1e-9)


@pytest.mark.parametrize("prev_err, err, alpha", [
    (0.5, -0.5, 0.5),       # sign change at the same size: overshoot, halve
    (0.5, -0.4, 0.5),       # sign change, error falls by less than half: halve
    (1.0, -0.3, 1.0),       # sign change, error falls to less than half: converging, keep
])
def test_step_factor_halves_on_an_overshoot_that_does_not_halve_the_error(prev_err, err, alpha):
    node = _tcv(0.6, t_out=50.0 + err, t_set=50.0, q_hot=0.6e-3, q_cold=0.4e-3)
    tm = {"alpha": 1.0, "z_regular": _logit(0.5), "kind": "secant", "z": _logit(0.5), "err": prev_err}
    _step(node, tm)
    assert tm["alpha"] == alpha
