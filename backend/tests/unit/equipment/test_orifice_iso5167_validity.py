"""ISO 5167 orifice uses the true beta and reports when it is outside the standard's limits."""
import pytest


import pytest

from simulation.equipment.orifice import Orifice


def _ori(d_orifice, d_pipe=0.05):
    return Orifice("O", pipe_diameter=d_pipe, orifice_diameter=d_orifice, standard="iso_5167")


def test_in_range_geometry_is_valid():
    assert _ori(0.025).iso_validity_issues(re_pipe=1e5) == []


@pytest.mark.parametrize("d_orifice, text", [(0.045, "beta"), (0.003, "beta"), (0.010, "12.5 mm")])
def test_out_of_range_geometry_is_reported(d_orifice, text):
    issues = _ori(d_orifice).iso_validity_issues(re_pipe=1e5)
    assert any(text in i for i in issues)


def test_low_reynolds_and_pipe_size_are_reported():
    issues = _ori(0.025, d_pipe=0.04).iso_validity_issues(re_pipe=1000.0)
    assert any("Re_D" in i for i in issues) and any("pipe D" in i for i in issues)


def test_large_beta_is_not_clamped():
    rho, mu, q = 998.0, 1e-3, 0.004
    dp_075 = _ori(0.0375).calculate_delta_p(q, rho, mu)    # beta 0.75
    dp_090 = _ori(0.045).calculate_delta_p(q, rho, mu)     # beta 0.90: bigger hole -> smaller loss
    dp_096 = _ori(0.048).calculate_delta_p(q, rho, mu)
    assert dp_075 > dp_090 > dp_096 > 0.0


