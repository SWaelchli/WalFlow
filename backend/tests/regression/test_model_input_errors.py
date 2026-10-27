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
            {"id": "e1", "source": "t1", "target": "n1", "sourceHandle": "outlet-0", "targetHandle": "inlet-0",
             "data": {"length_m": 1.0, "diameter_m": 0.05, **(edge_data or {})}},
            {"id": "e2", "source": "n1", "target": "t2", "sourceHandle": "outlet-0", "targetHandle": "inlet-0",
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


def _junction_graph(num_ports, handles):
    """A junction with one tank per given handle: ("in", handle) draws the pipe into it, ("out", handle) out of it."""
    nodes = [{"id": "j", "type": "junction", "position": {"x": 0, "y": 0}, "data": {"label": "J", "num_ports": num_ports}}]
    edges = []
    for k, (direction, handle) in enumerate(handles):
        nodes.append({"id": f"t{k}", "type": "tank", "position": {"x": 0, "y": 0}, "data": {"label": f"T{k}", "level_m": 1.0}})
        ends = ({"source": f"t{k}", "target": "j", "sourceHandle": "outlet-0", "targetHandle": handle} if direction == "in"
                else {"source": "j", "target": f"t{k}", "sourceHandle": handle, "targetHandle": "inlet-0"})
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
