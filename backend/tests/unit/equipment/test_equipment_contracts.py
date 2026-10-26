"""Contracts every equipment model keeps, checked over generated parameters, fluids and flows.

These replace per-component copies of the same checks: a new two-port resistance or pump is covered by
adding its node data strategy to helpers/strategies.py. Component-specific numbers (calibration points,
standards, worked examples) stay in the component's own reference tests.

Analytic derivatives are only checked where the solver uses them (pipes and pumps); every other
component is differentiated numerically by the solver, so its calculate_dp_derivative is not a contract.
"""
import math
import os
import re

import pytest
from hypothesis import given, strategies as st

from strategies import PUMP_DATA, TWO_PORT_TYPES, build, flow_ratios, flows, pumps, two_ports
from walflow_paths import FRONTEND_SRC
from simulation.equipment.base_node import HydraulicNode

# Canvas node types that are drawings or instruments, not hydraulic equipment
NON_HYDRAULIC = {"text_bubble", "instrument"}
# Smallest node data the parser accepts for types without a usable default (datasheet values)
REQUIRED_DATA = {
    "centrifugal_pump": {"head_rated_m": 30.0}, "pump": {"head_rated_m": 30.0},
    "pressure_safety_valve": {"set_pressure_barg": 10.0}, "psv": {"set_pressure_barg": 10.0},
    "rupture_disc": {"burst_pressure_barg": 10.0},
}

two_port_types = pytest.mark.parametrize("node_type", TWO_PORT_TYPES)
pump_types = pytest.mark.parametrize("node_type", sorted(PUMP_DATA))


def public_state(node):
    """Attributes a caller can see; private ones may hold lazy caches."""
    return {k: v for k, v in vars(node).items() if not k.startswith("_")}


def assert_slope_between_one_sided_differences(f, x, slope, what):
    """The analytic slope lies between the left and right difference quotients (equal where f is smooth,
    either side's value or between them at a kink such as Q = 0 or a regime switch)."""
    h = max(1e-12, 1e-6 * abs(x))
    f0 = f(x)
    left, right = (f0 - f(x - h)) / h, (f(x + h) - f0) / h
    lo, hi = min(left, right), max(left, right)
    # Relative tolerance for the curvature over h, plus the round-off of the difference quotients
    tol = 1e-3 * max(abs(lo), abs(hi)) + 1e-12 * max(abs(f0), 1.0) / h
    assert lo - tol <= slope <= hi + tol, f"{what}: slope {slope:.6g} outside [{left:.6g}, {right:.6g}] at {x:.6g}"


# --- every canvas type has a model ---------------------------------------------------------------

def canvas_node_types():
    """Keys of `nodeTypes` in App.jsx: everything a user can place on the canvas."""
    with open(os.path.join(FRONTEND_SRC, "App.jsx"), encoding="utf-8") as f:
        block = re.search(r"const nodeTypes = \{(.*?)\};", f.read(), re.S).group(1)
    return sorted(set(re.findall(r"^\s*(\w+):", block, re.M)) - NON_HYDRAULIC)


@pytest.mark.parametrize("node_type", canvas_node_types())
def test_every_canvas_type_builds_a_specific_model(node_type):
    """A canvas type the parser does not know silently becomes a bare HydraulicNode (no physics)."""
    node = build(node_type, REQUIRED_DATA.get(node_type, {}))
    assert type(node) is not HydraulicNode, f"'{node_type}' has no equipment model in GraphParser._build_node"


# --- two-port resistances ------------------------------------------------------------------------

@two_port_types
@given(data=st.data(), q=flows())
def test_resistance_is_finite_and_at_rest_without_flow(node_type, data, q):
    node, (_, _, rho, mu) = data.draw(two_ports(node_type))
    assert node.calculate_delta_p(0.0, rho, mu) == pytest.approx(0.0, abs=1e-6)
    assert math.isfinite(node.calculate_delta_p(q, rho, mu))


@two_port_types
@given(data=st.data(), q=flows())
def test_resistance_opposes_the_flow(node_type, data, q):
    """Second law: a passive element loses total pressure in the direction of flow. The solve's drop is the loss
    only: the reducer's reversible Bernoulli shift is a static-pressure effect, not part of it."""
    node, (_, _, rho, mu) = data.draw(two_ports(node_type))
    assert node.calculate_delta_p(q, rho, mu) * q >= 0.0


@two_port_types
@given(data=st.data(), q=flows(), factor=st.floats(1.001, 3.0))
def test_resistance_loss_rises_with_flow(node_type, data, q, factor):
    """More flow in the same direction never loses less total pressure (one operating point per drop)."""
    node, (_, _, rho, mu) = data.draw(two_ports(node_type))
    smaller, larger = sorted([q, q * factor])
    assert node.calculate_delta_p(larger, rho, mu) >= node.calculate_delta_p(smaller, rho, mu)


@two_port_types
@given(data=st.data(), q=flows())
def test_resistance_evaluation_has_no_side_effects(node_type, data, q):
    """The solver evaluates dP many times per iteration (finite differences, line search): an evaluation
    must neither change the node nor depend on the previous one. One warm-up call allows lazy caches."""
    node, (_, _, rho, mu) = data.draw(two_ports(node_type))
    node.calculate_delta_p(-q, rho, mu)
    state = public_state(node)
    first = node.calculate_delta_p(q, rho, mu)
    node.calculate_delta_p(-2.0 * q, rho, mu)
    assert node.calculate_delta_p(q, rho, mu) == first
    assert public_state(node) == state


@given(data=st.data(), q=flows())
def test_pipe_derivative_matches_its_pressure_drop(data, q):
    pipe, (_, _, rho, mu) = data.draw(two_ports("pipe"))
    assert_slope_between_one_sided_differences(
        lambda x: pipe.calculate_delta_p(x, rho, mu), q, pipe.calculate_dp_derivative(q, rho, mu), "pipe")


# --- pumps ---------------------------------------------------------------------------------------

@pump_types
@given(data=st.data(), ratio=flow_ratios(), factor=st.floats(1.001, 3.0))
def test_pump_rise_falls_with_flow(node_type, data, ratio, factor):
    """Running or stopped, a pump never raises the pressure more at a higher flow."""
    pump, (_, _, rho, mu) = data.draw(pumps(node_type))
    smaller, larger = sorted([ratio * pump.flow_rated, ratio * factor * pump.flow_rated])
    assert pump.calculate_delta_p(larger, rho, mu) <= pump.calculate_delta_p(smaller, rho, mu)


@pump_types
@given(data=st.data(), ratio=flow_ratios())
def test_running_pump_raises_pressure_at_shutoff_and_stopped_pump_resists(node_type, data, ratio):
    pump, (_, _, rho, mu) = data.draw(pumps(node_type))
    q = ratio * pump.flow_rated
    if pump.active:
        assert pump.calculate_delta_p(0.0, rho, mu) > 0.0
    else:
        assert pump.calculate_delta_p(q, rho, mu) * q <= 0.0


@given(data=st.data(), ratio=flow_ratios())
def test_centrifugal_pump_derivative_matches_its_curve(data, ratio):
    pump, (_, _, rho, mu) = data.draw(pumps("centrifugal_pump"))
    q = ratio * pump.flow_rated
    assert_slope_between_one_sided_differences(
        lambda x: pump.calculate_delta_p(x, rho, mu), q, pump.calculate_dp_derivative(q, rho, mu), "pump")


@given(data=st.data(), ratio=flow_ratios(), p_in_share=st.floats(0.01, 0.999))
def test_volumetric_pump_outlet_derivatives_match_its_outlet_pressure(data, ratio, p_in_share):
    """outlet_derivatives feeds the Jacobian with d p_out / d p_in and d p_out / d Q of
    p_out = p_in + dP(Q, p_in), including the discharge pressure limit (inlet drawn below it)."""
    pump, (_, _, rho, mu) = data.draw(pumps("volumetric_pump"))
    q, p_in = ratio * pump.flow_rated, p_in_share * pump.max_discharge_pressure
    d_pin, d_q = pump.outlet_derivatives(q, p_in, rho, mu)

    def p_out(q_, p_in_):
        return p_in_ + pump.calculate_delta_p(q_, rho, mu, p_in_pa=p_in_)

    assert_slope_between_one_sided_differences(lambda x: p_out(x, p_in), q, d_q, "d p_out / d Q")
    assert_slope_between_one_sided_differences(lambda x: p_out(q, x), p_in, d_pin, "d p_out / d p_in")
