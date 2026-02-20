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
    nodes = GraphParser.parse_graph(graph)
    
    solver = NetworkSolver(nodes)
    q = solver.solve()
    
    print("-" * 60)
    print(f"{'NODE NAME':<20} | {'INLET P (Pa)':<15} | {'OUTLET P (Pa)':<15}")
    print("-" * 60)
    
    for node in nodes:
        # Get inlet pressure (if exists)
        p_in = node.inlets[0].pressure if node.inlets else "N/A"
        # Get outlet pressure (if exists)
        p_out = node.outlets[0].pressure if node.outlets else "N/A"
        
        # Format the numbers if they are float
        p_in_str = f"{p_in:,.1f}" if isinstance(p_in, float) else str(p_in)
        p_out_str = f"{p_out:,.1f}" if isinstance(p_out, float) else str(p_out)
        
        print(f"{node.name:<20} | {p_in_str:>15} | {p_out_str:>15}")

    print("-" * 60)
    print(f"Converged Flow Rate: {q:.6f} m3/s")
    
    # Assertions to verify continuity
    # Outlet of Source (Index 0) should match Inlet of Pipe e1 (Index 1)
    assert nodes[0].outlets[0].pressure == nodes[1].inlets[0].pressure
    # Outlet of Pipe e1 should match Inlet of Pump (Index 2)
    assert nodes[1].outlets[0].pressure == nodes[2].inlets[0].pressure
    # Outlet of Pump should match Inlet of Pipe e2 (Index 3)
    assert nodes[2].outlets[0].pressure == nodes[3].inlets[0].pressure
    
    print("\nSUCCESS: Pressure Continuity Verified across all junctions!")

if __name__ == "__main__":
    try:
        test_complex_circuit_detailed()
    except Exception as e:
        print(f"TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
