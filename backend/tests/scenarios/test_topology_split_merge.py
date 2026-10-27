"""Flow split / merge ordering on small saved-file graphs; mass balance is a law in test_network_invariants.py."""
import pytest

from simulation.schemas import ReactFlowGraph
from simulation.graph_parser import GraphParser
from simulation.solver import NetworkSolver


def _tank(node_id, label, level, x, y):
    return {"id": node_id, "type": "tank", "data": {"label": label, "level_m": level, "elevation_m": 0.0}, "position": {"x": x, "y": y}}


def _edge(edge_id, source, target, length, diameter, source_handle=None, target_handle=None):
    handles = {**({"sourceHandle": source_handle} if source_handle else {}),
               **({"targetHandle": target_handle} if target_handle else {})}
    return {"id": edge_id, "source": source, "target": target, **handles,
            "data": {"length_m": length, "diameter_m": diameter}}


def _junction(node_id, x, y):
    return {"id": node_id, "type": "junction", "data": {"label": "Junction"}, "position": {"x": x, "y": y}}


# T1, junction, (pipe 0.1 m vs pipe 0.2 m, same length), junction, T2
PARALLEL = {
    "nodes": [
        _tank("t1", "Source", 10.0, 0, 0),
        _junction("s1", 100, 0),
        _junction("m1", 300, 0),
        _tank("t2", "Sink", 1.0, 400, 0),
    ],
    "edges": [
        _edge("e_source", "t1", "s1", 1.0, 0.3, target_handle="port-0"),
        _edge("e_path1", "s1", "m1", 10.0, 0.1, "port-1", "port-0"),
        _edge("e_path2", "s1", "m1", 10.0, 0.2, "port-2", "port-1"),
        _edge("e_sink", "m1", "t2", 1.0, 0.3, source_handle="port-2"),
    ],
}

# T1 (10 m) and T2 (9 m) merge in a junction, then run through an orifice into T3 (1 m)
DUAL_SOURCE = {
    "nodes": [
        _tank("t1", "Source High", 10.0, 0, 0),
        _tank("t2", "Source Low", 9.0, 0, 200),
        _junction("mix1", 200, 100),
        {"id": "ori1", "type": "orifice", "data": {"label": "Restricting Orifice", "pipe_diameter_m": 0.1, "orifice_diameter_m": 0.08}, "position": {"x": 400, "y": 100}},
        _tank("t3", "Sink", 1.0, 600, 100),
    ],
    "edges": [
        _edge("e1", "t1", "mix1", 5.0, 0.1, target_handle="port-0"),
        _edge("e2", "t2", "mix1", 5.0, 0.1, target_handle="port-1"),
        _edge("e3", "mix1", "ori1", 2.0, 0.1, source_handle="port-2"),
        _edge("e4", "ori1", "t3", 5.0, 0.1),
    ],
}

# T1 (10 m) splits to T2 (2 m) and T3 (8 m)
DUAL_SINK = {
    "nodes": [
        _tank("t1", "High Source", 10.0, 0, 100),
        _junction("split1", 200, 100),
        _tank("t2", "Low Sink", 2.0, 400, 0),
        _tank("t3", "High Sink", 8.0, 400, 200),
    ],
    "edges": [
        _edge("e_in", "t1", "split1", 1.0, 0.1, target_handle="port-0"),
        _edge("e_out1", "split1", "t2", 10.0, 0.1, source_handle="port-1"),
        _edge("e_out2", "split1", "t3", 10.0, 0.1, source_handle="port-2"),
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


def _four_port_junction_graphs():
    """Four tanks (10, 2, 5 and 12 m: the last one feeds back) on one 4-port junction, and the same tanks on two
    3-port junctions joined by a short, wide link pipe."""
    tanks = [_tank(f"t{k}", f"T{k}", level, 0, 100 * k) for k, level in enumerate((10.0, 2.0, 5.0, 12.0))]
    legs = [("e0", "t0", 4.0, 0.08), ("e1", "t1", 6.0, 0.06), ("e2", "t2", 5.0, 0.05), ("e3", "t3", 3.0, 0.07)]
    four = {"nodes": [*tanks, {**_junction("j", 200, 0), "data": {"label": "J", "num_ports": 4}}],
            "edges": [_edge(e, t, "j", length, d, target_handle=f"port-{k}") for k, (e, t, length, d) in enumerate(legs)]}
    chain = {"nodes": [*tanks, _junction("j1", 200, 0), _junction("j2", 300, 0)],
             "edges": [_edge(e, t, "j1" if k < 2 else "j2", length, d, target_handle=f"port-{k % 2}")
                       for k, (e, t, length, d) in enumerate(legs)]
             + [_edge("link", "j1", "j2", 0.01, 0.5, source_handle="port-2", target_handle="port-2")]}
    return four, chain


def test_four_port_junction_equals_two_chained_three_port_junctions():
    """One total pressure over four ports gives the flows of two 3-port junctions joined by a negligible link,
    so a port count above 3 neither adds nor loses a flow path."""
    flows = []
    for graph in _four_port_junction_graphs():
        network = GraphParser.parse_graph(ReactFlowGraph(**graph))
        assert NetworkSolver(network).solve()["success"]
        flows.append({e["id"]: e["pipe"].inlets[0].flow_rate for e in network.edges if e["id"].startswith("e")})
    four, chained = flows
    assert four["e0"] > 0 > four["e1"] and four["e3"] > 0   # two tanks supply, the lowest one drains, and the 12 m tank feeds in
    assert sum(four.values()) == pytest.approx(0.0, abs=1e-7)
    for leg in four:
        assert chained[leg] == pytest.approx(four[leg], rel=1e-3, abs=1e-7), leg


def test_pipe_between_two_ports_of_one_junction_carries_nothing_and_changes_nothing():
    """Both ends of the loop sit at the junction's one pressure, so it neither carries flow nor shifts the legs."""
    tanks = [_tank("t0", "T0", 10.0, 0, 0), _tank("t1", "T1", 2.0, 0, 100)]
    legs = [_edge("e0", "t0", "j", 4.0, 0.08, target_handle="port-0"), _edge("e1", "j", "t1", 6.0, 0.06, source_handle="port-1")]
    loop = _edge("loop", "j", "j", 3.0, 0.05, "port-2", "port-3")
    flows = []
    for edges in (legs, [*legs, loop]):
        junction = {**_junction("j", 200, 0), "data": {"label": "J", "num_ports": 4}}
        network = GraphParser.parse_graph(ReactFlowGraph(nodes=[*tanks, junction], edges=edges))
        assert NetworkSolver(network).solve()["success"]
        flows.append({e["id"]: e["pipe"].inlets[0].flow_rate for e in network.edges})
    plain, looped = flows
    assert plain["e0"] > 0
    assert looped["loop"] == pytest.approx(0.0, abs=1e-9)
    for leg in plain:
        assert looped[leg] == pytest.approx(plain[leg], rel=1e-6)
