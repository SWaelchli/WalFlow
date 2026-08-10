import sys
import os
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from simulation.schemas import ReactFlowGraph, ReactFlowNode, ReactFlowEdge
from simulation.graph_parser import GraphParser

def test_text_bubble_ignored_by_graph_parser():
    """
    Verify that text_bubble nodes are ignored by GraphParser.parse_graph and do not leak into hydraulic network nodes.
    """
    nodes = [
        ReactFlowNode(id="tank1", type="tank", position={"x": 0, "y": 0}, data={"level": 2.0, "elevation": 0.0}),
        ReactFlowNode(id="note1", type="text_bubble", position={"x": 100, "y": 100}, data={"title": "OPERATING NOTE", "text": "Check pump pressure before startup"}),
        ReactFlowNode(id="tank2", type="tank", position={"x": 200, "y": 0}, data={"level": 0.5, "elevation": 0.0}),
    ]
    edges = [
        ReactFlowEdge(id="e1", source="tank1", target="tank2", data={"length": 10.0, "diameter": 0.05})
    ]
    
    graph = ReactFlowGraph(nodes=nodes, edges=edges)
    network = GraphParser.parse_graph(graph)
    
    assert "tank1" in network.nodes
    assert "tank2" in network.nodes
    assert "note1" not in network.nodes
    assert len(network.nodes) == 2
    assert len(network.edges) == 1

if __name__ == "__main__":
    test_text_bubble_ignored_by_graph_parser()
    print("ALL TEXT BUBBLE TESTS PASSED.")
