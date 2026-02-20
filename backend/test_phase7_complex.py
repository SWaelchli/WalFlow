import sys
import os

# Ensure we can import from the backend directory
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from simulation.schemas import ReactFlowGraph
from simulation.graph_parser import GraphParser
from simulation.solver import NetworkSolver

def test_complex_circuit_detailed():
    # 1. Mock Graph: Tank1 -> Pipe1 -> Pump -> Pipe2 -> Valve -> Pipe3 -> Tank2
    mock_graph = {
        "nodes": [
            {"id": "t1", "type": "tank", "data": {"label": "Source", "level": 5.0, "elevation": 0.0}, "position": {"x":0,"y":0}},
            {"id": "pump1", "type": "pump", "data": {"label": "Main Pump", "A": 50.0, "B": 0.0, "C": -100.0}, "position": {"x":200,"y":0}},
            {"id": "v1", "type": "valve", "data": {"label": "Control Valve", "opening": 80.0, "max_cv": 0.1}, "position": {"x":400,"y":0}},
            {"id": "t2", "type": "tank", "data": {"label": "Sink", "level": 2.0, "elevation": 10.0}, "position": {"x":600,"y":0}},
        ],
        "edges": [
            {"id": "e1", "source": "t1", "target": "pump1", "data": {"length": 5.0, "diameter": 0.2}},
            {"id": "e2", "source": "pump1", "target": "v1", "data": {"length": 10.0, "diameter": 0.15}},
            {"id": "e3", "source": "v1", "target": "t2", "data": {"length": 5.0, "diameter": 0.2}},
        ]
    }
    
    graph = ReactFlowGraph(**mock_graph)
    network = GraphParser.parse_graph(graph)
    
    solver = NetworkSolver(network)
    q = solver.solve()
    
    print("-" * 60)
    print(f"{'NODE NAME':<20} | {'INLET P (Pa)':<15} | {'OUTLET P (Pa)':<15}")
    print("-" * 60)
    
    for node_id, node in network.nodes.items():
        p_in = node.inlets[0].pressure if node.inlets else "N/A"
        p_out = node.outlets[0].pressure if node.outlets else "N/A"
        p_in_str = f"{p_in:,.1f}" if isinstance(p_in, float) else str(p_in)
        p_out_str = f"{p_out:,.1f}" if isinstance(p_out, float) else str(p_out)
        print(f"{node.name:<20} | {p_in_str:>15} | {p_out_str:>15}")

    print("-" * 60)
    print(f"Converged Flow Rate: {q:.6f} m3/s")
    
    # Continuity Checks (Source -> Pipe e1 -> Pump)
    t1_out = network.nodes['t1'].outlets[0].pressure
    e1_pipe = next(e['pipe'] for e in network.edges if e['source'] == 't1')
    pump = network.nodes['pump1']
    
    assert t1_out == e1_pipe.inlets[0].pressure
    assert e1_pipe.outlets[0].pressure == pump.inlets[0].pressure
    
    print("\nSUCCESS: Pressure Continuity Verified in Complex Circuit!")

if __name__ == "__main__":
    try:
        test_complex_circuit_detailed()
    except Exception as e:
        print(f"TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
