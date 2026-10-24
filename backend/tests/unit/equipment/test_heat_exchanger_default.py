"""A heat exchanger without an explicit rated ΔP uses the 0.5 bar default the inspector shows."""
import pytest


from simulation.graph_parser import GraphParser
from simulation.schemas import ReactFlowGraph


def _hx(data):
    graph = ReactFlowGraph(nodes=[{"id": "hx", "type": "heat_exchanger", "position": {"x": 0, "y": 0}, "data": data}], edges=[])
    return GraphParser.parse_graph(graph).nodes["hx"]


def test_missing_rated_dp_is_half_a_bar_at_rated_flow():
    hx = _hx({"rated_flow_lmin": 500.0})
    assert hx.rated_dp_bar == 0.5
    q_rated = 500.0 / 60000.0
    # Reference state: water at the 50 °C default design inlet temperature
    rho, mu = FluidProperties.get_density("water", 323.15), FluidProperties.get_viscosity("water", 323.15)
    assert hx.calculate_delta_p(q_rated, rho, mu) == pytest.approx(0.5e5, rel=1e-3)  # Pa at rated flow


def test_explicit_rated_dp_is_kept():
    assert _hx({"rated_dp_bar": 1.2}).rated_dp_bar == 1.2


# The rated ΔP is reproduced in the system fluid at the design inlet temperature,
# and the rated UA does not drift with the operating temperature.
import math

from simulation.equipment.heat_exchanger import HeatExchanger
from simulation.fluid_utils import FluidProperties
from simulation.schemas import GlobalSettings


def _hx_in(fluid, **kw):
    hx = HeatExchanger("hx", **kw)
    hx.global_settings = GlobalSettings(fluid_type=fluid)
    return hx


@pytest.mark.parametrize("fluid", ["water", "iso_vg_46"])
def test_rated_dp_is_reproduced_at_the_design_inlet_temperature(fluid):
    hx = _hx_in(fluid, rated_flow_lmin=500.0, rated_dp_bar=0.5, design_inlet_temp_c=50.0)
    t = 323.15
    rho, mu = FluidProperties.get_density(fluid, t), FluidProperties.get_viscosity(fluid, t)
    assert hx.calculate_delta_p(500.0 / 60000.0, rho, mu) == pytest.approx(0.5e5, rel=1e-3)


def test_rated_ua_uses_the_design_inlet_state_not_the_operating_temperature():
    fluid = "iso_vg_46"
    hx = _hx_in(fluid, rated_cooling_kw=30.0, rated_flow_lmin=100.0, design_inlet_temp_c=50.0, medium_temp_c=10.0)
    # Operate at rated flow but 80 °C inlet
    t_op = 353.15
    q = 100.0 / 60000.0
    rho_op, cp_op = FluidProperties.get_density(fluid, t_op), FluidProperties.get_specific_heat(fluid, t_op)
    hx.inlets[0].flow_rate = q
    hx.outlets[0].flow_rate = q
    hx.inlets[0].temperature = t_op
    hx.inlets[0].density = rho_op
    hx.calculate_temperature()

    # Independent rating at the design inlet state
    t_d, tm = 323.15, 283.15
    m_r = q * FluidProperties.get_density(fluid, t_d)
    cp_d = FluidProperties.get_specific_heat(fluid, t_d)
    t_out_d = t_d - 30e3 / (m_r * cp_d)
    ua = -math.log(1.0 - (t_d - t_out_d) / (t_d - tm)) * m_r * cp_d
    ntu = ua / (q * rho_op * cp_op)
    expected = t_op - (1.0 - math.exp(-ntu)) * (t_op - tm)
    assert hx.outlets[0].temperature == pytest.approx(expected, abs=0.01)
