"""F1-19: the filter datasheet dP is reproduced in the reference fluid, not only in water."""
import pytest

pytestmark = pytest.mark.audit("F1-19")

import pytest

from simulation.equipment.filter import Filter
from simulation.fluid_utils import FluidProperties as FP
from simulation.schemas import GlobalSettings


def _filter(fluid, dp_clean=0.15, **kw):
    f = Filter("F", dp_clean_bar=dp_clean, dp_terminal_bar=1.0, flow_ref_lmin=100.0, **kw)
    f.global_settings = GlobalSettings(fluid_type=fluid)
    return f


def _dp(f, t_k, fluid):
    q = f.flow_ref
    return f.calculate_delta_p(q, FP.get_density(fluid, t_k), FP.get_viscosity(fluid, t_k))


def test_f1_19_water_20c_reproduces_datasheet():
    f = _filter("water")
    assert _dp(f, 293.15, "water") == pytest.approx(0.15e5, rel=1e-9)


@pytest.mark.parametrize("dp_clean", [0.15, 0.5])
def test_f1_19_oil_40c_reproduces_datasheet(dp_clean):
    # audit: model gave 157 % / 125 % of the entered dP for VG46 at 40 °C
    f = _filter("iso_vg_46", dp_clean)
    assert _dp(f, 313.15, "iso_vg_46") == pytest.approx(dp_clean * 1e5, rel=1e-9)


def test_f1_19_cold_oil_has_higher_dp_but_not_by_480_percent():
    f = _filter("iso_vg_46")
    ratio = _dp(f, 283.15, "iso_vg_46") / 0.15e5
    assert 1.5 < ratio < 6.0          # viscosity-driven rise (audit: 4.8x with the water-referenced K)


def test_f1_19_explicit_reference_viscosity():
    f = _filter("iso_vg_46", ref_viscosity_mpas=100.0)
    t_k = 293.15   # viscosity at this temperature differs from the datasheet's 100 mPa*s
    mu = FP.get_viscosity("iso_vg_46", t_k)
    q, rho = f.flow_ref, FP.get_density("iso_vg_46", t_k)
    assert mu > 100e-3 * 0.5   # sanity
    # at exactly the reference viscosity and density the datasheet dP comes out
    rho_ref = FP.get_density("iso_vg_46", 313.15)
    assert f.calculate_delta_p(q, rho_ref, 0.1) == pytest.approx(0.15e5, rel=1e-9)


def test_f1_19_derivative_consistent():
    f = _filter("iso_vg_46")
    rho, mu = 860.0, 0.03
    q = 0.001
    h = 1e-7
    num = (f.calculate_delta_p(q + h, rho, mu) - f.calculate_delta_p(q - h, rho, mu)) / (2 * h)
    assert f.calculate_dp_derivative(q, rho, mu) == pytest.approx(num, rel=1e-4)
