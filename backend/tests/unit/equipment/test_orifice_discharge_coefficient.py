"""F1-25: sharp-orifice Cd at low Reynolds number (Wuest laminar law blended into 0.60)."""
import pytest

pytestmark = pytest.mark.audit("F1-25")

import math

import pytest

from simulation.equipment.orifice import Orifice
from simulation.fluid_utils import FluidProperties as FP


@pytest.mark.parametrize("re", [0.01, 0.1, 1.0])
def test_f1_25_laminar_limit_follows_wuest(re):
    assert FP.get_orifice_cd(re) == pytest.approx(0.2 * math.sqrt(re), rel=0.05)


def test_f1_25_turbulent_limit_and_monotonic():
    assert FP.get_orifice_cd(1e6) == pytest.approx(0.60, abs=1e-6)
    res = [10 ** (i / 4.0) for i in range(-4, 12)]   # Re 0.1 ... 1000
    cds = [FP.get_orifice_cd(r) for r in res]
    assert all(a < b for a, b in zip(cds, cds[1:]))
    assert max(cds) <= 0.60 + 1e-12


def test_f1_25_audit_table_improved():
    # old model: Cd 0.12 at Re 10, 0.32 at 100, 0.54 at 1000; reference ~0.61 (Wuest capped)
    assert FP.get_orifice_cd(10.0) > 0.4
    assert FP.get_orifice_cd(100.0) > 0.59
    assert FP.get_orifice_cd(1000.0) > 0.59


@pytest.mark.parametrize("re", [0.01, 5.0, 50.0, 300.0, 3000.0, 1e5])
def test_f1_25_slope_matches_finite_difference(re):
    h = 1e-5
    num = (math.log(FP.get_orifice_cd(re * (1 + h))) - math.log(FP.get_orifice_cd(re * (1 - h)))) / (
        math.log(1 + h) - math.log(1 - h))
    assert FP.get_orifice_cd_slope(re) == pytest.approx(num, abs=1e-5)


@pytest.mark.parametrize("q", [1e-6, 2e-5, 3e-4, 5e-3])
def test_f1_25_orifice_derivative_matches_numerical(q):
    ori = Orifice("O", pipe_diameter=0.05248, orifice_diameter=0.003, standard="classic_cd")
    rho, mu = 875.0, 0.04
    h = q * 1e-5
    num = (ori.calculate_delta_p(q + h, rho, mu) - ori.calculate_delta_p(q - h, rho, mu)) / (2 * h)
    assert ori.calculate_dp_derivative(q, rho, mu) == pytest.approx(num, rel=1e-4)


def test_f1_25_derivative_finite_at_zero_flow():
    ori = Orifice("O", pipe_diameter=0.05248, orifice_diameter=0.003, standard="classic_cd")
    d = ori.calculate_dp_derivative(0.0, 875.0, 0.04)
    assert 0.0 < d < float("inf")
