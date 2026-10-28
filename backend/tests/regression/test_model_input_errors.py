"""Code-review fixes: HX sign, relief state restore, parser input errors."""
import pytest


import pytest

from simulation.graph_parser import GraphParser, ModelInputError
from simulation.schemas import ReactFlowGraph
from simulation.solver import run_sequential_relief_simulation




def _graph(node_type, node_data=None, edge_data=None):
    return ReactFlowGraph(**{
        "nodes": [
            {"id": "t1", "type": "tank", "position": {"x": 0, "y": 0}, "data": {"label": "T1", "level_m": 1.0}},
            {"id": "n1", "type": node_type, "position": {"x": 1, "y": 0}, "data": {"label": "N1", **(node_data or {})}},
            {"id": "t2", "type": "tank", "position": {"x": 2, "y": 0}, "data": {"label": "T2", "level_m": 1.0}},
        ],
        "edges": [
            {"id": "e1", "source": "t1", "target": "n1", "sourceHandle": "port-0", "targetHandle": "inlet-0",
             "data": {"length_m": 1.0, "diameter_m": 0.05, **(edge_data or {})}},
            {"id": "e2", "source": "n1", "target": "t2", "sourceHandle": "outlet-0", "targetHandle": "port-0",
             "data": {"length_m": 1.0, "diameter_m": 0.05}},
        ],
    })


def test_empty_numeric_field_is_a_model_input_error():
    with pytest.raises(ModelInputError, match="N1"):
        GraphParser.parse_graph(_graph("heat_exchanger", {"rated_cooling_kw": ""}))


def test_zero_rated_flow_is_a_model_input_error():
    with pytest.raises(ModelInputError, match="rated flow"):
        GraphParser.parse_graph(_graph("heat_exchanger", {"rated_flow_lmin": 0}))


@pytest.mark.parametrize("edge_data,match", [({"diameter_m": 0}, "diameter"), ({"diameter_m": ""}, "Pipe"), ({"length_m": -1}, "negative")])
def test_bad_pipe_input_is_a_model_input_error(edge_data, match):
    with pytest.raises(ModelInputError, match=match):
        GraphParser.parse_graph(_graph("heat_exchanger", None, edge_data))


@pytest.mark.parametrize("node_type", [
    pytest.param("mixer", id="removed_mixer_type"),
    pytest.param("splitter", id="removed_splitter_type"),
    pytest.param("made_up_type", id="made_up_type"),
])
def test_unknown_component_type_is_a_model_input_error(node_type):
    with pytest.raises(ModelInputError, match=rf'N1.*unknown component type "{node_type}"'):
        GraphParser.parse_graph(_graph(node_type))


@pytest.mark.parametrize("node_type", ["text_bubble", "note", "annotation", "instrument"])
def test_annotation_types_are_skipped_not_rejected(node_type):
    network = GraphParser.parse_graph(_graph(node_type))
    assert "n1" not in network.nodes


def _junction_graph(num_ports, handles):
    """A junction with one tank per given handle: ("in", handle) draws the pipe into it, ("out", handle) out of it."""
    nodes = [{"id": "j", "type": "junction", "position": {"x": 0, "y": 0}, "data": {"label": "J", "num_ports": num_ports}}]
    edges = []
    for k, (direction, handle) in enumerate(handles):
        nodes.append({"id": f"t{k}", "type": "tank", "position": {"x": 0, "y": 0}, "data": {"label": f"T{k}", "level_m": 1.0}})
        ends = ({"source": f"t{k}", "target": "j", "sourceHandle": "port-0", "targetHandle": handle} if direction == "in"
                else {"source": "j", "target": f"t{k}", "sourceHandle": handle, "targetHandle": "port-0"})
        edges.append({"id": f"e{k}", **ends, "data": {"length_m": 1.0, "diameter_m": 0.05}})
    return ReactFlowGraph(nodes=nodes, edges=edges)


@pytest.mark.parametrize("num_ports, handles, match", [
    pytest.param(2, [("in", "port-0")], "number of ports", id="junction_with_2_ports"),
    pytest.param(9, [("in", "port-0")], "number of ports", id="junction_with_9_ports"),
    pytest.param(3, [("in", "inlet-0")], 'has no port "inlet-0"', id="junction_handle_is_not_a_port"),
    pytest.param(3, [("out", "outlet-1")], 'has no port "outlet-1"', id="junction_source_handle_is_not_a_port"),
    pytest.param(3, [("in", "port-3")], "has no Port 4 .it has 3 ports.", id="junction_port_beyond_the_port_count"),
    pytest.param(3, [("in", "port-x")], 'has no port "port-x"', id="junction_port_index_is_not_a_number"),
    pytest.param(3, [("in", "port-²")], 'has no port "port-²"', id="junction_port_index_is_a_superscript_digit"),
    pytest.param(4.6, [("in", "port-0")], "number of ports", id="junction_with_a_fractional_port_count"),
    pytest.param(None, [("in", "port-0")], "number of ports", id="junction_with_a_null_port_count"),
    pytest.param("", [("in", "port-0")], "number of ports", id="junction_with_an_empty_port_count"),
    pytest.param("x", [("in", "port-0")], "number of ports", id="junction_with_a_text_port_count"),
    pytest.param(True, [("in", "port-0")], "number of ports", id="junction_with_a_true_port_count"),
    pytest.param(False, [("in", "port-0")], "number of ports", id="junction_with_a_false_port_count"),
    pytest.param(3, [("in", "port-1"), ("out", "port-1")], "takes one pipe", id="junction_two_pipes_on_one_port"),
    pytest.param(3, [("in", "port-1"), ("in", "port-1")], "takes one pipe", id="junction_two_pipes_drawn_the_same_way_on_one_port"),
])
def test_bad_junction_wiring_is_a_model_input_error(num_ports, handles, match):
    with pytest.raises(ModelInputError, match=match):
        GraphParser.parse_graph(_junction_graph(num_ports, handles))


def _boundary_graph(node_type, data, pipes):
    """A boundary "FB" labelled FB and a 3-port tank; pipes = (direction, FB port, tank port), "out" drawn from FB."""
    nodes = [{"id": "b", "type": node_type, "position": {"x": 0, "y": 0}, "data": {"label": "FB", **data}},
             {"id": "t", "type": "tank", "position": {"x": 0, "y": 0}, "data": {"label": "T", "num_ports": 3}}]
    edges = []
    for k, (direction, port, tank_port) in enumerate(pipes):
        ends = (("b", "t", port, tank_port) if direction == "out" else ("t", "b", tank_port, port))
        edges.append({"id": f"e{k}", "source": ends[0], "target": ends[1], "sourceHandle": ends[2],
                      "targetHandle": ends[3], "data": {"length_m": 1.0, "diameter_m": 0.05}})
    return ReactFlowGraph(nodes=nodes, edges=edges)


OUT, IN = [("out", "port-0", "port-0")], [("in", "port-0", "port-0")]
BAD_PORT_COUNT = "number of ports must be a whole number 1 to 8"


@pytest.mark.parametrize("node_type, data, pipes, match", [
    pytest.param("flow_boundary", {}, IN, "FB.*supplies flow", id="pipe_into_a_supply"),
    pytest.param("flow_boundary", {"flow_direction": "draw"}, OUT, "FB.*draws flow", id="pipe_out_of_a_draw"),
    pytest.param("flow_boundary", {"set_flow_lmin": -5}, OUT, "FB.*must not be negative", id="negative_set_flow"),
    pytest.param("flow_boundary", {"min_suction_pressure_bara": -1}, OUT, "FB.*below 0 bar", id="negative_min_suction"),
    pytest.param("flow_boundary", {"flow_direction": "sideways"}, OUT, "FB.*supply or draw", id="unknown_flow_direction"),
    pytest.param("flow_boundary", {"flow_split": "half"}, OUT, "FB.*flow split must be", id="unknown_flow_split"),
    pytest.param("flow_boundary", {"num_ports": 2, "flow_split": "total_split"}, OUT, "FB.*Port 2 has no pipe",
                 id="free_port_with_total_split"),
    pytest.param("flow_boundary", {"num_ports": 2, "flow_split": "per_port", "port_flows_lmin": [10.0, -1.0]}, OUT,
                 "FB.*port flows must not be negative", id="negative_port_flow"),
    *[pytest.param(node_type, {"num_ports": count}, OUT, BAD_PORT_COUNT, id=f"{node_type}_with_{count}_ports")
      for node_type in ("tank", "pressure_boundary", "flow_boundary") for count in (0, 9, 2.5)],
    *[pytest.param(node_type, {"num_ports": 2}, [("out", "port-2", "port-0")], r"FB.*no Port 3 .it has 2 ports.",
                   id=f"{node_type}_port_beyond_the_port_count") for node_type in ("tank", "pressure_boundary", "flow_boundary")],
    *[pytest.param(node_type, {"num_ports": 2}, [("out", "port-1", "port-0"), ("in", "port-1", "port-1")],
                   "FB.*Port 2 takes one pipe", id=f"{node_type}_two_pipes_on_one_port")
      for node_type in ("tank", "pressure_boundary", "flow_boundary")],
])
def test_bad_boundary_input_is_a_model_input_error(node_type, data, pipes, match):
    if node_type == "flow_boundary" and len(pipes) == 2:
        pipes = [pipes[0], ("out", "port-1", "port-1")]   # a supply takes its pipes drawn out of it
    with pytest.raises(ModelInputError, match=match):
        GraphParser.parse_graph(_boundary_graph(node_type, data, pipes))


@pytest.mark.parametrize("num_ports", [4, 4.0, "4", "4.0", " 4 "])
def test_whole_number_port_counts_are_accepted_in_any_spelling(num_ports):
    network = GraphParser.parse_graph(_junction_graph(num_ports, [("in", "port-3")]))
    assert network.nodes["j"].num_ports == 4


def test_relief_state_is_restored_when_a_solve_raises():
    network = GraphParser.parse_graph(_graph("pressure_safety_valve", {"set_pressure_barg": 5.0}))
    psv = network.nodes["n1"]
    assert psv.forced_state == "auto"

    class Boom:
        def solve(self):
            raise RuntimeError("solver blew up")

    with pytest.raises(RuntimeError):
        run_sequential_relief_simulation(network, Boom(), lambda n: {})
    assert psv.forced_state == "auto"
