"""F1-30: water density, saturation pressure and cp against IAPWS reference values."""
import pytest

pytestmark = pytest.mark.audit("F1-30")

import pytest

from simulation.fluid_utils import FluidProperties

K = 273.15

# IAPWS-95 / IAPWS-IF97 saturated liquid water: (t °C, density kg/m³, Psat Pa, cp J/(kg·K))
IAPWS = [
    (0.0, 999.84, 611.2, 4219.9),
    (20.0, 998.21, 2339.2, 4184.4),
    (50.0, 988.04, 12352.0, 4181.5),
    (80.0, 971.79, 47414.0, 4197.0),
    (100.0, 958.35, 101418.0, 4216.0),
    (150.0, 916.75, 476160.0, 4310.0),
]


@pytest.mark.parametrize("t_c, rho, psat, cp", IAPWS)
def test_f1_30_water_properties_match_iapws(t_c, rho, psat, cp):
    assert FluidProperties.get_density("water", t_c + K) == pytest.approx(rho, rel=0.0005)
    assert FluidProperties.get_vapor_pressure("water", t_c + K) == pytest.approx(psat, rel=0.003)
    assert FluidProperties.get_specific_heat("water", t_c + K) == pytest.approx(cp, rel=0.002)


def test_f1_30_vapor_pressure_has_no_step_at_100c():
    below = FluidProperties.get_vapor_pressure("water", 100.0 - 1e-3 + K)
    above = FluidProperties.get_vapor_pressure("water", 100.0 + 1e-3 + K)
    slope = 3.6e3  # Pa/K near 100 °C
    assert above - below == pytest.approx(slope * 2e-3, rel=0.2)


def test_f1_30_enthalpy_round_trip_with_variable_cp():
    h = FluidProperties.get_enthalpy("water", 90.0 + K)
    assert FluidProperties.get_temperature_from_enthalpy("water", h) == pytest.approx(90.0 + K, abs=1e-6)
