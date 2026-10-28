"""Linear control valve, remote control valve and 3-way TCV paths use the IEC 60534-2-1 Annex A Reynolds
number factor: laws of their pressure drop in the laminar region and in both flow directions,
and the F_L / F_d / line size inputs the parser feeds them."""
from networks import neutral_graph
import pytest
from hypothesis import assume, given, strategies as st


from physics_refs import iec_flow_for_reynolds
from strategies import build, fluid_states, log_uniform
from simulation.graph_parser import GraphParser, ModelInputError
from simulation.schemas import ReactFlowGraph

VALVE_TYPES = ["linear_control_valve", "remote_control_valve", "three_way_tcv"]
VALVE_DATA = {
    "linear_control_valve": st.fixed_dictionaries({"max_cv": log_uniform(0.01, 50.0)}),
    "remote_control_valve": st.fixed_dictionaries({"max_cv": log_uniform(0.01, 50.0)}),
    "three_way_tcv": st.fixed_dictionaries({"max_cv": log_uniform(0.01, 50.0)}),
}


@st.composite
def valves(draw, node_type):
    """(valve, dp(q, rho, mu), current Cv, fluid state): the TCV is evaluated on its cold path."""
    state = draw(fluid_states())
    data = {**draw(VALVE_DATA[node_type]), "fl": draw(st.floats(0.3, 1.0)), "fd": draw(st.floats(0.1, 1.0))}
    valve = build(node_type, data, state[0])
    valve.pipe_diameter = draw(log_uniform(0.01, 0.3))
    opening = draw(st.floats(0.05, 1.0))
    if node_type == "three_way_tcv":
        valve.mix_ratio = 1.0 - opening  # cold path (port 1) opening = 1 - mix ratio
        return valve, (lambda q, rho, mu: valve.calculate_path_dp(q, rho, 1, mu)), valve.max_cv * opening, state
    valve.opening_pct = 100.0 * opening
    return valve, valve.calculate_delta_p, valve.max_cv * opening, state


@pytest.mark.parametrize("node_type", VALVE_TYPES)
@given(data=st.data(), q=log_uniform(1e-7, 0.05))
def test_valve_drop_is_odd_in_flow_and_zero_at_rest(node_type, data, q):
    _, dp, _, (_, _, rho, mu) = data.draw(valves(node_type))
    assert dp(0.0, rho, mu) == 0.0
    assert dp(-q, rho, mu) == -dp(q, rho, mu)


@pytest.mark.parametrize("node_type", VALVE_TYPES)
@given(data=st.data(), re_v=log_uniform(1e-3, 4.0))
def test_valve_drop_is_linear_in_flow_in_the_laminar_region(node_type, data, re_v):
    """F_R ~ sqrt(Re_V) below Re_V = 10 turns the Cv law into dp ~ Q; a clamp or floor on F_R that bites
    there bends it. Re_V <= 4 so that 2 Q stays in (A.6) too."""
    valve, dp, cv, (_, _, rho, mu) = data.draw(valves(node_type))
    q = iec_flow_for_reynolds(re_v, mu / rho, cv, valve.fl, valve.fd, valve.pipe_diameter)
    assume(q > 1e-9)  # the TCV path has no drop below 1e-10 m³/s (documented cut-off)
    assert dp(2.0 * q, rho, mu) == pytest.approx(2.0 * dp(q, rho, mu), rel=1e-9)


# --- parser inputs ---------------------------------------------------------------------------------

def _graph(node_type, node_data=None, d_in=0.05, d_out=0.08):
    """Tank -> valve -> tank (a TCV gets its second inlet from a third tank)."""
    nodes = [{"id": "t1", "type": "tank", "position": {"x": 0, "y": 0}, "data": {"label": "T1", "level_m": 1.0}},
             {"id": "v", "type": node_type, "position": {"x": 1, "y": 0}, "data": {"label": "V", **(node_data or {})}},
             {"id": "t2", "type": "tank", "position": {"x": 2, "y": 0}, "data": {"label": "T2", "level_m": 1.0}}]
    edges = [{"id": "e1", "source": "t1", "target": "v", "sourceHandle": "outlet-0", "targetHandle": "inlet-0",
              "data": {"length_m": 1.0, "diameter_m": d_in}},
             {"id": "e2", "source": "v", "target": "t2", "sourceHandle": "outlet-0", "targetHandle": "inlet-0",
              "data": {"length_m": 1.0, "diameter_m": d_out}}]
    return neutral_graph(nodes=nodes, edges=edges)


@pytest.mark.parametrize("node_type", VALVE_TYPES)
def test_fl_fd_and_line_size_come_from_the_node_data_and_the_connected_pipe(node_type):
    network = GraphParser.parse_graph(_graph(node_type, {"fl": 0.7, "fd": 0.3}))
    assert (network.nodes["v"].fl, network.nodes["v"].fd) == (0.7, 0.3)
    assert network.nodes["v"].pipe_diameter == 0.05  # upstream pipe first

    network = GraphParser.parse_graph(_graph(node_type))
    assert (network.nodes["v"].fl, network.nodes["v"].fd) == (0.9, 0.46)  # Table D.2 globe, contoured plug


@pytest.mark.parametrize("node_type", VALVE_TYPES)
def test_line_size_falls_back_to_the_outlet_pipe_without_an_inlet_pipe(node_type):
    graph = _graph(node_type)
    graph.edges = [e for e in graph.edges if e.id == "e2"]
    graph.nodes = [n for n in graph.nodes if n.id != "t1"]
    assert GraphParser.parse_graph(graph).nodes["v"].pipe_diameter == 0.08


@pytest.mark.parametrize("node_type", VALVE_TYPES)
@pytest.mark.parametrize("field,value,match", [
    ("fl", 0, "F_L"), ("fl", -0.5, "F_L"), ("fl", 1.01, "F_L"), ("fd", 0, "F_d"), ("fd", -0.1, "F_d"),
])
def test_invalid_fl_or_fd_is_a_model_input_error(node_type, field, value, match):
    with pytest.raises(ModelInputError, match=match):
        GraphParser.parse_graph(_graph(node_type, {field: value}))


@pytest.mark.parametrize("node_type", VALVE_TYPES)
def test_fl_of_exactly_one_is_accepted(node_type):
    assert GraphParser.parse_graph(_graph(node_type, {"fl": 1.0})).nodes["v"].fl == 1.0
