"""F1-26: ISO VG oil viscosity follows ASTM D341 (Walther) through nu40 and nu100."""
import math
import pytest

from simulation.fluid_utils import FluidProperties

GRADES = {15: 3.5, 22: 4.3, 32: 5.4, 46: 6.8, 68: 8.8, 100: 11.4, 150: 15.0, 220: 19.4}


def _nu_cst(grade, t_c):
    mu = FluidProperties.get_viscosity(f"iso_vg_{grade}", t_c + 273.15)
    return mu / FluidProperties.get_density(f"iso_vg_{grade}", t_c + 273.15) * 1e6


@pytest.mark.parametrize("grade,nu100", GRADES.items())
def test_f1_26_grade_hits_nominal_40_and_100(grade, nu100):
    assert _nu_cst(grade, 40.0) == pytest.approx(grade, rel=1e-3)
    assert _nu_cst(grade, 100.0) == pytest.approx(nu100, rel=1e-3)


@pytest.mark.parametrize("grade", [46, 68, 220])
def test_f1_26_cold_viscosity_matches_hand_walther(grade):
    # independent hand calculation: straight line in log10(log10(nu+0.7)) over log10(T)
    nu100 = GRADES[grade]
    y = lambda n: math.log10(math.log10(n + 0.7))
    x1, x2 = math.log10(313.15), math.log10(373.15)
    for t_c in (-10.0, 0.0, 20.0, 60.0):
        frac = (math.log10(t_c + 273.15) - x1) / (x2 - x1)
        expected = 10 ** (10 ** (y(grade) + frac * (y(nu100) - y(grade)))) - 0.7
        assert _nu_cst(grade, t_c) == pytest.approx(expected, rel=1e-3)


def test_f1_26_vg32_no_longer_equals_vg22_at_100c():
    assert _nu_cst(32, 100.0) > _nu_cst(22, 100.0) * 1.2


def test_f1_26_vg46_cold_viscosity_is_datasheet_order():
    # typical VG46 mineral oil datasheets: about 380-580 cSt at 0 C
    assert 380.0 < _nu_cst(46, 0.0) < 650.0
