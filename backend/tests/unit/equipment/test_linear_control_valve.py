"""Linear control valve: closed below the 0.1 % minimum opening (D-11)."""

import pytest

from simulation.equipment.linear_control_valve import LinearControlValve

RHO, MU, Q = 998.0, 0.001, 1e-4  # water, 6 L/min


def _dp(opening_pct, flow_rate):
    return LinearControlValve("LCV", max_cv=5.0, opening_pct=opening_pct).calculate_delta_p(flow_rate, RHO, MU)


@pytest.mark.audit("D-11")
@pytest.mark.parametrize("opening_pct", [0.0, 0.05, 0.0999])
def test_d11_opening_below_minimum_is_closed(opening_pct):
    valve = LinearControlValve("LCV", max_cv=5.0, opening_pct=opening_pct)
    assert valve.calculate_delta_p(Q, RHO, MU) == pytest.approx(1e12 * Q)
    assert valve.calculate_dp_derivative(Q, RHO, MU) == pytest.approx(1e12)


@pytest.mark.audit("D-11")
def test_d11_minimum_opening_follows_the_cv_law():
    # 0.1 % is the smallest Cv-controlled opening: quadratic drop, slope 2 dP/Q instead of the closed stiffness
    valve = LinearControlValve("LCV", max_cv=5.0, opening_pct=0.1)
    dp_min = valve.calculate_delta_p(Q, RHO, MU)
    assert dp_min == pytest.approx(_dp(0.1, 2 * Q) / 4, rel=0.05)
    assert valve.calculate_dp_derivative(Q, RHO, MU) == pytest.approx(2 * dp_min / Q)
