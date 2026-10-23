"""Flow split / merge ordering on small saved-file graphs; mass balance is a law in test_network_invariants.py."""
import pytest

from simulation.schemas import ReactFlowGraph
from simulation.graph_parser import GraphParser
from simulation.solver import NetworkSolver


def _tank(node_id, label, level, x, y):
    return {"id": node_id, "type": "tank", "data": {"label": label, "level_m": level, "elevation_m": 0.0}, "position": {"x": x, "y": y}}


def _edge(edge_id, source, target, length, diameter):
    return {"id": edge_id, "source": source, "target": target, "data": {"length_m": length, "diameter_m": diameter}}


# T1, splitter, (pipe 0.1 m vs pipe 0.2 m, same length), mixer, T2
PARALLEL = {
    "nodes": [
        _tank("t1", "Source", 10.0, 0, 0),
        {"id": "s1", "type": "splitter", "data": {"label": "Splitter"}, "position": {"x": 100, "y": 0}},
        {"id": "m1", "type": "mixer", "data": {"label": "Mixer"}, "position": {"x": 300, "y": 0}},
        _tank("t2", "Sink", 1.0, 400, 0),
    ],
    "edges": [
        _edge("e_source", "t1", "s1", 1.0, 0.3),
        _edge("e_path1", "s1", "m1", 10.0, 0.1),
        _edge("e_path2", "s1", "m1", 10.0, 0.2),
        _edge("e_sink", "m1", "t2", 1.0, 0.3),
    ],
}

# T1 (10 m) and T2 (9 m) merge in a mixer, then run through an orifice into T3 (1 m)
DUAL_SOURCE = {
    "nodes": [
        _tank("t1", "Source High", 10.0, 0, 0),
        _tank("t2", "Source Low", 9.0, 0, 200),
        {"id": "mix1", "type": "mixer", "data": {"label": "Mixer"}, "position": {"x": 200, "y": 100}},
        {"id": "ori1", "type": "orifice", "data": {"label": "Restricting Orifice", "pipe_diameter_m": 0.1, "orifice_diameter_m": 0.08}, "position": {"x": 400, "y": 100}},
        _tank("t3", "Sink", 1.0, 600, 100),
    ],
    "edges": [
        _edge("e1", "t1", "mix1", 5.0, 0.1),
        _edge("e2", "t2", "mix1", 5.0, 0.1),
        _edge("e3", "mix1", "ori1", 2.0, 0.1),
        _edge("e4", "ori1", "t3", 5.0, 0.1),
    ],
}

# T1 (10 m) splits to T2 (2 m) and T3 (8 m)
DUAL_SINK = {
    "nodes": [
        _tank("t1", "High Source", 10.0, 0, 100),
        {"id": "split1", "type": "splitter", "data": {"label": "Splitter"}, "position": {"x": 200, "y": 100}},
        _tank("t2", "Low Sink", 2.0, 400, 0),
        _tank("t3", "High Sink", 8.0, 400, 200),
    ],
    "edges": [
        _edge("e_in", "t1", "split1", 1.0, 0.1),
        _edge("e_out1", "split1", "t2", 10.0, 0.1),
        _edge("e_out2", "split1", "t3", 10.0, 0.1),
    ],
}


@pytest.mark.parametrize("graph, more, less, both_flow_forward", [
    pytest.param(PARALLEL, "e_path2", "e_path1", False, id="parallel-larger-diameter-takes-more"),
    pytest.param(DUAL_SOURCE, "e1", "e2", True, id="dual-source-higher-head-supplies-more"),
    pytest.param(DUAL_SINK, "e_out1", "e_out2", False, id="dual-sink-lower-sink-takes-more"),
])
def test_flow_split_follows_resistance_and_head(graph, more, less, both_flow_forward):
    network = GraphParser.parse_graph(ReactFlowGraph(**graph))
    NetworkSolver(network).solve()
    flows = {edge["pipe"].name: edge["pipe"].inlets[0].flow_rate for edge in network.edges}
    q_more, q_less = flows["Pipe " + more], flows["Pipe " + less]
    if both_flow_forward:
        assert q_less > 0
    assert q_more > q_less
