import sys
import os

# Add backend to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from simulation.schemas import ReactFlowGraph
from simulation.graph_parser import GraphParser
from simulation.solver import NetworkSolver

def test_parallel_circuit():
    """
    Simulates a parallel split:
    T1 (Source) -> Splitter -> (Pipe 1 vs Pipe 2) -> Mixer -> T2 (Sink)
    Pipe 1: 10m long, 0.1m diameter (Higher resistance)
    Pipe 2: 10m long, 0.2m diameter (Lower resistance)
    
    EXPECTED: Pipe 2 should have much higher flow than Pipe 1.
    """
    mock_graph = {
        "nodes": [
            {"id": "t1", "type": "tank", "data": {"label": "Source", "level": 10.0, "elevation": 0.0}, "position": {"x":0,"y":0}},
            {"id": "s1", "type": "splitter", "data": {"label": "Splitter"}, "position": {"x":100,"y":0}},
            {"id": "m1", "type": "mixer", "data": {"label": "Mixer"}, "position": {"x":300,"y":0}},
            {"id": "t2", "type": "tank", "data": {"label": "Sink", "level": 1.0, "elevation": 0.0}, "position": {"x":400,"y":0}},
        ],
        "edges": [
            {"id": "e_source", "source": "t1", "target": "s1", "data": {"length": 1.0, "diameter": 0.3}},
            {"id": "e_path1", "source": "s1", "target": "m1", "data": {"length": 10.0, "diameter": 0.1}},
            {"id": "e_path2", "source": "s1", "target": "m1", "data": {"length": 10.0, "diameter": 0.2}},
            {"id": "e_sink", "source": "m1", "target": "t2", "data": {"length": 1.0, "diameter": 0.3}},
        ]
    }
    
    graph = ReactFlowGraph(**mock_graph)
    network = GraphParser.parse_graph(graph)
    
    solver = NetworkSolver(network)
    solver.solve()
    
    # Extract flows from the edges
    q_path1 = 0
    q_path2 = 0
    q_total = 0
    
    print("\n" + "="*50)
    print("PHASE 8 PARALLEL CIRCUIT RESULTS")
    print("="*50)
    
    for edge_data in network.edges:
        pipe = edge_data['pipe']
        q = pipe.inlets[0].flow_rate
        source_id = edge_data['source']
        target_id = edge_data['target']
        print(f"Flow through {pipe.name} ({source_id} -> {target_id}): {q:,.4f} m3/s")
        
        if edge_data['source'] == "s1" and edge_data['target'] == "m1":
            if "e_path1" in pipe.name:
                q_path1 = q
            else:
                q_path2 = q
        elif edge_data['source'] == "t1":
            q_total = q

    print("-" * 50)
    print(f"Total Flow: {q_total:,.4f} m3/s")
    print(f"Path 1 (0.1m) Flow: {q_path1:,.4f} m3/s")
    print(f"Path 2 (0.2m) Flow: {q_path2:,.4f} m3/s")
    print(f"Sum of Paths: {(q_path1 + q_path2):,.4f} m3/s")
    
    # Conservation of mass within a small tolerance
    assert abs(q_total - (q_path1 + q_path2)) < 1e-4
    # Larger diameter = less resistance = more flow
    assert q_path2 > q_path1
    
    print("\nSUCCESS: Parallel Network Solver Verified!")

if __name__ == "__main__":
    try:
        test_parallel_circuit()
    except Exception as e:
        print(f"TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
