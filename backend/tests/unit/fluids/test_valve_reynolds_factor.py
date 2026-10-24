"""IEC 60534-2-1:2011 Annex A Reynolds number factor F_R of control valves: reference values for
Eq. (A.6) / (A.7) with n from (A.8a) / (A.8b), and the laws F_R keeps over all valve data."""
import math

import pytest
from hypothesis import example, given, strategies as st


from physics_refs import iec_flow_for_reynolds
from strategies import log_uniform
from simulation.fluid_utils import FluidProperties, _iec_fr_held, _iec_fr_knee

NU = 1e-5  # m²/s, any value: the flow is solved for the wanted Re_V
D = 0.05248  # line size 52.48 mm
FL, FD = 0.9, 0.46

# (C = C_rated, label) at d = 52.48 mm, C/d²: 0.0363 full-size trim n = 1.623 (A.8a), 0.00363 reduced trim
# n = 4.000 (A.8b), 0.0450 full-size trim n = 1.056, where (A.7) lies below (A.6) at Re_V = 10.
# Expected F_R computed by hand from the standard, not by the implementation.
FR_TABLE = [
    pytest.param(100.0, 1.0, 0.03680657258161895, id="full-size-Re1"),
    pytest.param(100.0, 9.99, 0.11633439136475414, id="full-size-Re9.99-A6"),
    pytest.param(100.0, 10.0, 0.11639260222221962, id="full-size-Re10-continuous"),
    pytest.param(100.0, 100.0, 0.3680657258161895, id="full-size-Re100"),
    pytest.param(100.0, 1000.0, 0.722643770378435, id="full-size-Re1000-A7"),
    pytest.param(100.0, 1e4, 1.0, id="full-size-Re10000"),
    pytest.param(100.0, 2e4, 1.0, id="full-size-Re20000-clamped"),
    pytest.param(10.0, 1.0, 0.057778976693292634, id="reduced-trim-Re1"),
    pytest.param(10.0, 9.99, 0.18262178779040383, id="reduced-trim-Re9.99-A6"),
    pytest.param(10.0, 10.0, 0.18271316722458877, id="reduced-trim-Re10"),
    pytest.param(10.0, 100.0, 0.5572631339282121, id="reduced-trim-Re100-A7"),
    pytest.param(10.0, 1000.0, 0.7786315669641061, id="reduced-trim-Re1000"),
    pytest.param(10.0, 1e4, 1.0, id="reduced-trim-Re10000"),
    # Documented deviation (linear_control_valve.md section 3.3): (A.7) starts below (A.6) at Re_V = 10 for
    # C/d² around 0.045, where the standard's F_R jumps down (0.0938 -> 0.0734). The model holds the (A.6)
    # value at Re_V = 10 (F_lam10 = 0.026/F_L*sqrt(10 n), n = 1.0557) until (A.7) rises past it. Taken at
    # 10.0001: the inverse flow lands a rounding error below 10 exactly.
    pytest.param(124.0, 9.99, 0.09381805755222108, id="held-below-Re10-A6"),
    pytest.param(124.0, 10.0001, 0.0938650017921126, id="held-at-Re10-not-A7"),
    pytest.param(124.0, 10.5, 0.0938650017921126, id="held-Re10.5-inside-band"),
    # Growth cap: a = 0.33*sqrt(F_L)/n^0.25 = 0.30885, held branch ends at F_s = F_lam10 = 0.0938650,
    # Re_s = 1e4*10^((F_s - 1)/a) = 11.64415. Capped: F_R = F_s*(Re_V/Re_s)^0.75 (the standard's (A.7) would
    # give 0.0979027 at 12 and 0.118579 at 14, rising faster than Re_V^0.75 and so lowering the drop).
    # The cap ends where it meets the laminar term 0.026/F_L*sqrt(n Re) (Re_V = 15.9), after that the
    # laminar term (A.6) is the smaller (0.1327452 at 20; (A.7) is 0.166421).
    pytest.param(124.0, 12.0, 0.09600828238077454, id="capped-Re12"),
    pytest.param(124.0, 14.0, 0.10777518879861699, id="capped-Re14"),
    pytest.param(124.0, 20.0, 0.1327451585665805, id="after-cap-Re20-A6-term"),
    pytest.param(124.0, 1000.0, 0.69114917378083, id="jump-Re1000"),
]


@pytest.mark.parametrize("cv,re_v,expected", FR_TABLE)
def test_iec_fr_matches_annex_a_reference(cv, re_v, expected):
    q = iec_flow_for_reynolds(re_v, NU, cv, FL, FD, D)
    assert FluidProperties.get_iec_valve_reynolds(q, NU, cv, FL, FD, D) == pytest.approx(re_v, rel=1e-9)
    assert FluidProperties.get_iec_valve_fr(q, NU, cv, cv, FL, FD, D) == pytest.approx(expected, rel=1e-9)


def test_iec_fr_uses_rated_cv_for_the_trim_exponent_and_current_cv_for_re():
    # Same current Cv = 10 and Re_V; rated Cv 100 (n = 1.623) gives a lower F_R than rated 10 (n = 4.0)
    q = iec_flow_for_reynolds(100.0, NU, 10.0, FL, FD, D)
    reduced_open = FluidProperties.get_iec_valve_fr(q, NU, 10.0, 10.0, FL, FD, D)
    throttled_big_valve = FluidProperties.get_iec_valve_fr(q, NU, 10.0, 100.0, FL, FD, D)
    assert reduced_open == pytest.approx(0.5572631339282121, rel=1e-9)
    # n = 1.623 from the rated Cv: (A.6)-type limit 0.026/F_L*sqrt(n*Re) = 0.3681 is the smaller of the two
    assert throttled_big_valve == pytest.approx(0.3680657258161895, rel=1e-9)


# --- laws -------------------------------------------------------------------------------------------

@st.composite
def valve_states(draw):
    """(current Cv, rated Cv, F_L, F_d, line size [m], nu) over where a control valve is used."""
    d = draw(log_uniform(0.01, 0.4))
    # C/d² up to 0.1, the largest full-size trim in practice. Far above it (A.8a) gives n < 0.12 and F_R
    # stays below 1 even at Re_V = 1e7: outside what the standard covers.
    cv_rated = min(draw(log_uniform(0.01, 500.0)), 0.1 * (d * 1000.0) ** 2)
    cv = cv_rated * draw(st.floats(0.001, 1.0))
    return cv, cv_rated, draw(st.floats(0.3, 1.0)), draw(st.floats(0.1, 1.0)), d, draw(log_uniform(1e-7, 1e-2))


def _fr(state, re_v):
    cv, cv_rated, fl, fd, d, nu = state
    return FluidProperties.get_iec_valve_fr(iec_flow_for_reynolds(re_v, nu, cv, fl, fd, d), nu, cv, cv_rated, fl, fd, d)


@given(state=valve_states(), re_v=log_uniform(1e-4, 1e6))
def test_iec_fr_is_positive_and_at_most_one(state, re_v):
    assert 0.0 < _fr(state, re_v) <= 1.0


@given(state=valve_states(), re_v=log_uniform(1e4, 1e7))
@example(state=(100.0, 100.0, 0.9, 0.46, 0.05248, 1e-6), re_v=1e4)
def test_iec_fr_is_one_from_re_10000(state, re_v):
    """The standard's fully turbulent limit; also the clamp of (A.7) above 10000."""
    assert _fr(state, re_v) == pytest.approx(1.0, abs=1e-12)


@given(state=valve_states(), a=log_uniform(1e-4, 1e6), b=log_uniform(1e-4, 1e6))
@example(state=(124.0, 124.0, 0.9, 0.46, 0.05248, 1e-5), a=9.9999, b=10.0001)
@example(state=(124.0, 124.0, 0.9, 0.46, 0.05248, 1e-5), a=9.9999999, b=10.5)
def test_iec_fr_does_not_fall_with_re_anywhere(state, a, b):
    """F_R never falls as Re_V rises, also across Re_V = 10. The standard's F_R jumps down there for some
    valves (A.6 above A.7 at 10); the model deliberately holds the value (documented deviation,
    linear_control_valve.md section 3.3), so the pressure drop has no flow gap."""
    lo, hi = sorted([a, b])
    assert _fr(state, lo) <= _fr(state, hi) * (1.0 + 1e-9)


@given(state=valve_states(), eps=st.floats(1e-9, 1e-6))
@example(state=(124.0, 124.0, 0.9, 0.46, 0.05248, 1e-5), eps=1e-7)
def test_iec_fr_is_continuous_at_re_10(state, eps):
    """No jump at the switch from (A.6) to (A.7), including the valves where the standard jumps."""
    below, above = _fr(state, 10.0 * (1.0 - eps)), _fr(state, 10.0 * (1.0 + eps))
    assert above == pytest.approx(below, rel=1e-4)


# --- growth cap ------------------------------------------------------------------------------

@st.composite
def cap_valve_states(draw):
    """Like valve_states, with F_L in [0.5, 0.98] and C/d² biased to where n <~ 1.2 (the capped valves)."""
    d = draw(log_uniform(0.01, 0.4))
    cv_rated = min(draw(log_uniform(0.01, 500.0)), 0.1 * (d * 1000.0) ** 2)
    cv = cv_rated * draw(st.floats(0.001, 1.0))
    return cv, cv_rated, draw(st.floats(0.5, 0.98)), draw(st.floats(0.1, 1.0)), d, draw(log_uniform(1e-7, 1e-2))


def _n(cv_rated, d):
    """Trim exponent n, Eq. (A.8a) / (A.8b)."""
    cd2 = cv_rated / (d * 1000.0) ** 2
    return 2.14e-3 / cd2 ** 2 if cd2 >= 0.016 else 1.0 + 127.0 * cd2 ** (2.0 / 3.0)


@given(state=cap_valve_states(), re_v=log_uniform(1.0, 1e5), ratio=st.floats(1.0005, 1.05))
@example(state=(124.0, 124.0, 0.9, 0.46, 0.05248, 1e-5), re_v=11.64, ratio=1.02)
@example(state=(124.0, 124.0, 0.9, 0.46, 0.05248, 1e-5), re_v=12.0, ratio=1.05)
@example(state=(124.0, 124.0, 0.9, 0.46, 0.05248, 1e-5), re_v=15.5, ratio=1.05)
def test_valve_pressure_drop_rises_at_least_as_sqrt_of_flow(state, re_v, ratio):
    """Δp ∝ (Q/(Cv F_R))² must never fall with rising Q: d lnΔp/d lnQ >= 0.5 (F_R grows at most as Re_V^0.75).
    Without the cap the drop fell just after (A.7) takes over for valves very small/large for the line (n <~ 1.2),
    a negative resistance the network solver cannot converge on."""
    cv = state[0]
    q1 = iec_flow_for_reynolds(re_v, state[5], cv, state[2], state[3], state[4])
    q2 = q1 * ratio

    def dp(q):
        return (q / (cv * FluidProperties.get_iec_valve_fr(q, state[5], cv, state[1], state[2], state[3], state[4]))) ** 2

    slope = math.log(dp(q2) / dp(q1)) / math.log(ratio)
    assert dp(q2) >= dp(q1)
    assert slope >= 0.5 - 1e-6


@given(state=cap_valve_states(), re_v=log_uniform(1e-2, 1e6))
@example(state=(124.0, 124.0, 0.9, 0.46, 0.05248, 1e-5), re_v=12.0)
def test_iec_fr_cap_only_lowers_and_only_for_valves_with_a_knee(state, re_v):
    """F_R never exceeds the held (no-jump) value; it equals it for valves without a knee."""
    cv, cv_rated, fl, fd, d, nu = state
    n = _n(cv_rated, d)
    held = _iec_fr_held(FluidProperties.get_iec_valve_reynolds(iec_flow_for_reynolds(re_v, nu, cv, fl, fd, d), nu, cv, fl, fd, d), n, fl)
    fr = _fr(state, re_v)
    assert fr <= max(1e-9, held) * (1.0 + 1e-12)
    if _iec_fr_knee(n, fl) is None:
        assert fr == pytest.approx(max(1e-9, held), rel=1e-12)
