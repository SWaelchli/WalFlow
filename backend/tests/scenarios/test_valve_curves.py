"""The valve chart draws the telemetry `valve_curves` of the valve's own calculate_delta_p (F_R, valve
style, solved fluid), not a formula of its own. Checks the curve builder against the valve, the opening
argument it relies on, and a solved network whose operating point lies on the curve."""
import contextlib
import io

from networks import neutral_graph
import pytest
from hypothesis import given, strategies as st


from strategies import build, fluid_states, log_uniform
from services.simulation_service import (VALVE_CURVE_MIN_FLOW, VALVE_CURVE_POINTS, extract_telemetry, valve_curves,
                                         valve_flow_at_dp)
from simulation.equipment.base_node import Q_DEAD_LEG
from simulation.graph_parser import GraphParser
from simulation.schemas import ReactFlowGraph
from simulation.solver import NetworkSolver

CURVE_TYPES = ["linear_control_valve", "linear_regulator", "remote_control_valve"]


def _valve(node_type, state, flow, opening_pct, cv=1.0, **data):
    """Valve as the parser builds it, with a solved-looking inlet port."""
    fluid, temp_k, rho, mu = state
    valve = build(node_type, {"max_cv": cv, **data}, fluid)
    valve.opening_pct = opening_pct
    valve.inlets[0].flow_rate, valve.inlets[0].density, valve.inlets[0].viscosity = flow, rho, mu
    valve.outlets[0].density, valve.outlets[0].viscosity = rho, mu
    return valve


@pytest.mark.parametrize("node_type", CURVE_TYPES)
@given(state=fluid_states(), flow=st.one_of(st.just(0.0), st.sampled_from([-1, 1]).flatmap(
           lambda s: log_uniform(1e-6, 0.05).map(lambda q: s * q))),
       opening=st.floats(5.0, 100.0), cv=log_uniform(0.01, 50.0), locked=st.booleans())
def test_curve_points_are_the_valves_own_delta_p_over_the_documented_range(node_type, state, flow, opening, cv,
                                                                           locked):
    valve = _valve(node_type, state, flow, opening, cv)
    if node_type != "linear_control_valve":
        valve.locked_up = locked  # a closed PRV holding its setpoint has no operating dp: drawn like no flow
    rho, mu = state[2], state[3]
    curves = valve_curves(valve)
    flowing = abs(flow) > Q_DEAD_LEG and not (locked and node_type != "linear_control_valve")
    flows = curves["flow_m3s"]

    assert len(flows) == len(curves["dp_current_pa"]) == len(curves["dp_full_open_pa"])
    assert VALVE_CURVE_POINTS <= len(flows) <= VALVE_CURVE_POINTS + 2  # Q_op and Q_full_open may add a point
    assert flows[0] == 0.0
    assert flows == sorted(flows)
    assert curves["cv_max"] == cv
    for q, dp_cur, dp_full in zip(flows, curves["dp_current_pa"], curves["dp_full_open_pa"]):
        assert dp_cur == valve.calculate_delta_p(q, rho, mu)
        valve.opening_pct = 100.0
        expected_full = valve.calculate_delta_p(q, rho, mu)
        valve.opening_pct = opening
        assert dp_full == expected_full
    assert valve.opening_pct == opening  # drawing the chart must not move the valve

    if not flowing:
        assert flows[-1] == pytest.approx(VALVE_CURVE_MIN_FLOW, rel=1e-12)
        assert curves["dp_op_pa"] is None and curves["flow_full_open_m3s"] is None
        assert curves["opening_pct"] == curves["cv"] == curves["flow_at_dp_op_m3s"] == []
        return

    q_op, q_full, dp_op = abs(flow), curves["flow_full_open_m3s"], curves["dp_op_pa"]
    assert dp_op == valve.calculate_delta_p(q_op, rho, mu)
    assert q_full >= q_op * (1 - 1e-9)  # a fully open valve passes at least as much at the same dp
    assert flows[-1] == pytest.approx(max(2.0 * q_op, 1.25 * q_full), rel=1e-12)
    assert q_op in flows and q_full in flows
    assert valve.calculate_delta_p(q_full, rho, mu, opening_pct=100.0) == pytest.approx(dp_op, rel=1e-6)

    # Flow over Cv at the operating dp: the operating point (Cv_op, Q_op) lies on it, and it rises with Cv
    openings, cvs, qs = curves["opening_pct"], curves["cv"], curves["flow_at_dp_op_m3s"]
    assert len(openings) == len(cvs) == len(qs) >= VALVE_CURVE_POINTS
    assert openings[0] == 0.0 and qs[0] == 0.0 and openings[-1] == 100.0
    assert openings == sorted(openings)
    assert cvs == pytest.approx([cv * o / 100.0 for o in openings], rel=1e-12)
    assert qs[openings.index(pytest.approx(opening, abs=1e-9))] == q_op
    assert qs[-1] == pytest.approx(q_full, rel=1e-6)
    assert all(a <= b * (1 + 1e-9) for a, b in zip(qs, qs[1:]))


@pytest.mark.parametrize("node_type", CURVE_TYPES)
@given(state=fluid_states(), dp=log_uniform(1e2, 1e7), opening=st.floats(0.5, 100.0), cv=log_uniform(0.01, 50.0))
def test_flow_at_dp_is_the_inverse_of_the_valves_delta_p(node_type, state, dp, opening, cv):
    """Viscous fluids and low openings put the root deep in the F_R region, where a bracket that is too
    tight or a one-sided F_R would return a flow the valve does not give that dp at."""
    valve = _valve(node_type, state, 0.0, opening, cv)
    rho, mu = state[2], state[3]
    q = valve_flow_at_dp(valve, dp, rho, mu, opening)
    assert q > 0.0
    assert valve.calculate_delta_p(q, rho, mu, opening_pct=opening) == pytest.approx(dp, rel=1e-6)
    assert valve_flow_at_dp(valve, 0.0, rho, mu, opening) == 0.0
    assert valve_flow_at_dp(valve, -dp, rho, mu, opening) == 0.0
    assert valve_flow_at_dp(valve, dp, rho, mu, 0.0) == 0.0


@pytest.mark.parametrize("failure", ["nan_delta_p", "never_reaches_target"])
@pytest.mark.parametrize("node_type", CURVE_TYPES)
def test_unsolvable_inverse_raises_in_flow_at_dp_and_draws_the_no_flow_chart(node_type, failure, monkeypatch):
    """A non-finite dp or a valve whose dp never reaches the target must not raise out of the telemetry."""
    water = ("water", 293.15, 998.0, 1.0e-3)
    valve = _valve(node_type, water, 1e-3, 50.0)
    rho, mu = water[2], water[3]
    for bad_dp in (float("nan"), float("inf")):
        with pytest.raises(ValueError):
            valve_flow_at_dp(valve, bad_dp, rho, mu, 100.0)

    if failure == "nan_delta_p":
        monkeypatch.setattr(valve, "calculate_delta_p", lambda q, rho, mu, opening_pct=None: float("nan"))
    else:  # the operating dp is 1e4 Pa, but an explicit opening (the inverse) never gets there
        monkeypatch.setattr(valve, "calculate_delta_p",
                            lambda q, rho, mu, opening_pct=None: 1e4 if opening_pct is None else 1.0)
    with pytest.raises(ValueError):
        valve_flow_at_dp(valve, 1e4, rho, mu, 100.0)

    curves = valve_curves(valve)  # must not raise
    assert curves["dp_op_pa"] is None and curves["flow_full_open_m3s"] is None
    assert curves["opening_pct"] == curves["cv"] == curves["flow_at_dp_op_m3s"] == []
    assert curves["flow_m3s"][-1] == pytest.approx(VALVE_CURVE_MIN_FLOW, rel=1e-12)
    assert len(curves["dp_current_pa"]) == len(curves["dp_full_open_pa"]) == len(curves["flow_m3s"])


@pytest.mark.parametrize("node_type", CURVE_TYPES)
@given(state=fluid_states(), flow=log_uniform(1e-6, 0.05), opening=st.floats(5.0, 100.0), other=st.floats(0.0, 100.0))
def test_opening_argument_equals_setting_the_opening_and_leaves_it_alone(node_type, state, flow, opening, other):
    """The curve at full opening needs delta_p at another opening without moving the valve."""
    rho, mu = state[2], state[3]
    valve = _valve(node_type, state, flow, other)
    by_argument = valve.calculate_delta_p(flow, rho, mu, opening_pct=opening)
    assert valve.opening_pct == other
    assert valve.calculate_delta_p(flow, rho, mu, opening_pct=None) == valve.calculate_delta_p(flow, rho, mu)
    valve.opening_pct = opening
    assert by_argument == valve.calculate_delta_p(flow, rho, mu)


@pytest.mark.parametrize("node_type", CURVE_TYPES)
def test_valve_style_shows_in_the_curve_at_low_reynolds_and_vanishes_at_high(node_type):
    """Two valves differing only in F_d: the viscous (F_R) region separates them, turbulent flow does not.
    The old browser formula drew the same curve for both."""
    oil, water = ("iso_vg_46", 293.15), ("water", 293.15)

    def dp_at(fluid, flow, fd):
        from strategies import FluidProperties
        rho, mu = FluidProperties.get_density(fluid[0], fluid[1]), FluidProperties.get_viscosity(*fluid)
        valve = _valve(node_type, (*fluid, rho, mu), flow, 100.0, cv=1.0, fl=0.9, fd=fd)
        return valve_curves(valve)["dp_current_pa"][30]

    low_q = 1e-5
    assert dp_at(oil, low_q, 0.46) != pytest.approx(dp_at(oil, low_q, 0.09), rel=0.01)
    high_q = 0.02
    assert dp_at(water, high_q, 0.46) == pytest.approx(dp_at(water, high_q, 0.09), rel=1e-6)


# --- telemetry of a solved network -----------------------------------------------------------------

def _solved(node_type, opening_pct=40.0):
    """Tank (5 m) -> pipe -> valve -> pipe -> tank, solved; returns the telemetry and the valve."""
    nodes = [{"id": "t1", "type": "tank", "position": {"x": 0, "y": 0}, "data": {"label": "T1", "level_m": 5.0}},
             {"id": "v", "type": node_type, "position": {"x": 1, "y": 0},
              "data": {"label": "V", "max_cv": 20.0, "opening_pct": opening_pct}},
             {"id": "t2", "type": "tank", "position": {"x": 2, "y": 0}, "data": {"label": "T2", "level_m": 1.0}}]
    edges = [{"id": f"e{i}", "source": s, "target": t, "sourceHandle": "outlet-0", "targetHandle": "inlet-0",
              "data": {"length_m": 5.0, "diameter_m": 0.05}} for i, (s, t) in enumerate([("t1", "v"), ("v", "t2")])]
    NetworkSolver.clear_warm_start_cache()
    with contextlib.redirect_stdout(io.StringIO()):
        network = GraphParser.parse_graph(neutral_graph(nodes=nodes, edges=edges))
        stats = NetworkSolver(network).solve()
    assert stats["success"], stats.get("error")
    return extract_telemetry(network), network


@pytest.mark.parametrize("node_type", ["linear_control_valve", "remote_control_valve"])
def test_solved_operating_point_lies_on_the_current_curve(node_type):
    telemetry, network = _solved(node_type)
    valve = network.nodes["v"]
    curves = telemetry["nodes"]["v"]["valve_curves"]
    q, rho, mu = valve.inlets[0].flow_rate, valve.inlets[0].density, valve.inlets[0].viscosity
    dp_solved = valve.inlets[0].pressure - valve.outlets[0].pressure
    assert q > 0 and dp_solved > 0
    assert valve.calculate_delta_p(q, rho, mu) == pytest.approx(dp_solved, rel=1e-6)

    # The shipped points bracket the operating point: linear interpolation lands near it
    flows, dps = curves["flow_m3s"], curves["dp_current_pa"]
    assert flows[-1] == pytest.approx(max(2.0 * q, 1.25 * curves["flow_full_open_m3s"]))
    assert curves["dp_op_pa"] == pytest.approx(dp_solved, rel=1e-6)
    i = max(k for k, f in enumerate(flows) if f <= q)
    interp = dps[i] if q == flows[i] else dps[i] + (dps[i + 1] - dps[i]) * (q - flows[i]) / (flows[i + 1] - flows[i])
    assert interp == pytest.approx(dp_solved, rel=2e-3)
    assert all(a <= b for a, b in zip(curves["dp_full_open_pa"], curves["dp_current_pa"]))  # full open drops least


def test_only_the_three_valve_types_carry_curves():
    telemetry, _ = _solved("linear_control_valve")
    assert "valve_curves" in telemetry["nodes"]["v"]
    assert "valve_curves" not in telemetry["nodes"]["t1"]
