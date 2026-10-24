"""Tabulated seawater / glycol-water properties instead of single-point Vogel fits and constant cp."""
import pytest


import pytest

from simulation.fluid_utils import FluidProperties as FP

GLYCOLS = ["glycol_30", "glycol_50", "propylene_glycol_50"]
AQUEOUS = ["seawater"] + GLYCOLS


def k(t_c):
    return t_c + 273.15


def test_seawater_matches_sharqawy_anchor_points():
    # Sharqawy et al. (2010), S = 35 g/kg, at 25 and 50 °C (not table nodes -> exercises interpolation)
    assert FP.get_density("seawater", k(25)) == pytest.approx(1023.3, rel=2e-3)
    assert FP.get_viscosity("seawater", k(25)) == pytest.approx(0.96e-3, rel=0.05)
    assert FP.get_viscosity("seawater", k(50)) == pytest.approx(0.61e-3, rel=0.05)
    assert FP.get_specific_heat("seawater", k(25)) == pytest.approx(3993.0, rel=3e-3)


def test_seawater_hot_viscosity_no_longer_overpredicted():
    # old Vogel fit gave +44 % at 60 °C and +63 % at 80 °C
    assert FP.get_viscosity("seawater", k(60)) == pytest.approx(0.52e-3, rel=0.05)
    assert FP.get_viscosity("seawater", k(80)) == pytest.approx(0.41e-3, rel=0.06)


def test_eg50_specific_heat_varies_with_temperature():
    cold, warm, hot = (FP.get_specific_heat("glycol_50", k(t)) for t in (-20, 20, 80))
    assert warm == pytest.approx(3283.0, rel=0.02)
    assert hot / cold > 1.12  # the constant 3300 J/kgK was +9 % / -8 % off at the ends


def test_pg50_cold_viscosity_is_high():
    # old fit: -22 to -35 % below 0 °C -> cold start dP under-predicted
    assert FP.get_viscosity("propylene_glycol_50", k(-20)) > 0.07
    assert FP.get_viscosity("propylene_glycol_50", k(0)) == pytest.approx(0.020, rel=0.1)


def test_pg50_vapor_pressure_follows_raoult():
    n_pg, n_w = 50.0 / 76.09, 50.0 / 18.015
    x_w = n_w / (n_w + n_pg)
    ratio = FP.get_vapor_pressure("propylene_glycol_50", k(60)) / FP.get_vapor_pressure("water", k(60))
    assert ratio == pytest.approx(x_w, abs=0.02)


@pytest.mark.parametrize("fluid", AQUEOUS)
def test_viscosity_decreases_and_density_decreases_with_temperature(fluid):
    temps = [k(t) for t in (0, 10, 20, 30, 40, 50, 60, 70, 80)]
    mu = [FP.get_viscosity(fluid, t) for t in temps]
    rho = [FP.get_density(fluid, t) for t in temps]
    assert all(a > b for a, b in zip(mu, mu[1:]))
    assert all(a > b for a, b in zip(rho, rho[1:]))


@pytest.mark.parametrize("fluid", AQUEOUS)
def test_specific_heat_is_below_water_and_positive(fluid):
    for t in (0, 20, 60, 80):
        assert 2800.0 < FP.get_specific_heat(fluid, k(t)) < 4300.0
