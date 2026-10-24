"""The 3-way TCV mixes its streams by the enthalpy balance with cp(T), not by the
mass-weighted temperature, and adds the throttling heat as enthalpy."""
from types import SimpleNamespace

import numpy as np
import pytest
from scipy.optimize import brentq

from simulation.equipment.three_way_tcv import ThreeWayTCV
from simulation.fluid_utils import FluidProperties



def _h(fluid, t_k):
    """Independent enthalpy: trapezoidal integral of cp from 0 degC."""
    ts = np.linspace(273.15, t_k, 4001)
    cp = np.array([FluidProperties.get_specific_heat(fluid, t) for t in ts])
    return float(np.sum(0.5 * (cp[1:] + cp[:-1]) * np.diff(ts)))


def _tcv(fluid, q0, q1, t0=353.15, t1=293.15):
    tcv = ThreeWayTCV("TCV", max_cv=50.0, set_temperature=323.15, hot_port_idx=0)
    tcv.global_settings = SimpleNamespace(fluid_type=fluid)
    tcv.mix_ratio = 0.5
    for port, q, t in ((tcv.inlets[0], q0, t0), (tcv.inlets[1], q1, t1)):
        port.flow_rate, port.temperature = q, t
        port.density = FluidProperties.get_density(fluid, t)
        port.viscosity = FluidProperties.get_viscosity(fluid, t)
    tcv.outlets[0].flow_rate = q0 + q1
    tcv.outlets[0].pressure = 2e5
    return tcv


def _reference(tcv, fluid):
    """sum(m h) + sum(Q dP) = m_tot h_mix, solved for T."""
    m = [p.flow_rate * p.density for p in tcv.inlets]
    heat = sum(p.flow_rate * tcv.calculate_path_dp(p.flow_rate, p.density, i, p.viscosity)
               for i, p in enumerate(tcv.inlets))
    h_mix = (sum(mk * _h(fluid, p.temperature) for mk, p in zip(m, tcv.inlets)) + heat) / sum(m)
    return brentq(lambda t: _h(fluid, t) - h_mix, 250.0, 450.0)


@pytest.mark.parametrize("fluid", ["water", "glycol_50", "iso_vg_46"])
def test_mixed_temperature_follows_the_enthalpy_balance(fluid):
    # Equal mass flows at 80 and 20 degC, low flow: throttling heat negligible
    tcv = _tcv(fluid, 1e-4, 1e-4 * FluidProperties.get_density(fluid, 353.15) / FluidProperties.get_density(fluid, 293.15))
    tcv.calculate()
    assert tcv.outlets[0].temperature == pytest.approx(_reference(tcv, fluid), abs=0.05)


def test_oil_mix_differs_from_the_mass_weighted_mean():
    tcv = _tcv("iso_vg_46", 1e-4, 1e-4 * FluidProperties.get_density("iso_vg_46", 353.15)
               / FluidProperties.get_density("iso_vg_46", 293.15))
    tcv.calculate()
    assert tcv.outlets[0].temperature - 323.15 == pytest.approx(0.87, abs=0.1)


def test_throttling_heat_enters_as_enthalpy():
    # High flow through a small valve: several kW of throttling heat
    tcv = _tcv("iso_vg_46", 2e-3, 2e-3)
    tcv.max_cv = 5.0
    tcv.calculate()
    assert tcv.outlets[0].temperature == pytest.approx(_reference(tcv, "iso_vg_46"), abs=0.05)
