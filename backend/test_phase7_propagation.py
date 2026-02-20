import sys
import os

# Ensure we can import from the backend directory
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from simulation.schemas import ReactFlowGraph, ReactFlowNode, ReactFlowEdge
from simulation.graph_parser import GraphParser
from simulation.solver import NetworkSolver
from simulation.equipment.tank import Tank
from simulation.equipment.pipe import Pipe

def test_state_propagation():
    # 1. Mock a React Flow Graph: Tank1 -> Edge -> Tank2
    # Tank 1: 10m level, 0 elevation
    # Edge: Default Pipe (25m, 0.1m)
    # Tank 2: 0m level, 0 elevation
    
    mock_graph = {
        "nodes": [
            {
                "id": "t1",
                "type": "tank",
                "position": {"x": 0, "y": 0},
                "data": {"label": "High Tank", "level": 10.0, "elevation": 0.0}
            },
            {
                "id": "t2",
                "type": "tank",
                "position": {"x": 500, "y": 0},
                "data": {"label": "Low Tank", "level": 0.0, "elevation": 0.0}
            }
        ],
        "edges": [
            {
                "id": "e1",
                "source": "t1",
                "target": "t2",
                "data": {"length": 25.0, "diameter": 0.1, "friction_factor": 0.02}
            }
        ]
    }
    
    # Convert to Pydantic models
    graph = ReactFlowGraph(**mock_graph)
    
    # 2. Parse the graph
    nodes = GraphParser.parse_graph(graph)
    print(f"Parsed {len(nodes)} nodes: {[n.name for n in nodes]}")
    
    assert len(nodes) == 3 # Tank -> Pipe -> Tank
    assert isinstance(nodes[0], Tank)
    assert isinstance(nodes[1], Pipe)
    assert isinstance(nodes[2], Tank)
    
    # 3. Solve the simulation
    solver = NetworkSolver(nodes)
    flow_rate = solver.solve()
    print(f"Calculated Flow Rate: {flow_rate:.5f} m3/s")
    
    # 4. Verify Pressures (State Propagation)
    # Tank 1 Outlet pressure
    p1 = nodes[0].outlets[0].pressure
    # Pipe Inlet pressure
    p_pipe_in = nodes[1].inlets[0].pressure
    # Pipe Outlet pressure
    p_pipe_out = nodes[1].outlets[0].pressure
    # Tank 2 Inlet pressure
    p2_in = nodes[2].inlets[0].pressure
    
    print(f"P1 Outlet: {p1:.1f} Pa")
    print(f"Pipe Inlet: {p_pipe_in:.1f} Pa")
    print(f"Pipe Outlet: {p_pipe_out:.1f} Pa")
    print(f"T2 Inlet: {p2_in:.1f} Pa")
    
    # Assertions
    # Tank 1 static head + atm = 101325 + 1000*9.81*10 = 199425
    assert abs(p1 - 199425.0) < 1.0
    
    # State Propagation between T1 and Pipe
    assert p1 == p_pipe_in
    
    # State Propagation between Pipe and T2
    assert p_pipe_out == p2_in
    
    # T2 static head + atm = 101325 + 0 = 101325
    assert abs(p2_in - 101325.0) < 1.0
    
    print("\nSUCCESS: Phase 7 State Propagation Verified!")

if __name__ == "__main__":
    try:
        test_state_propagation()
    except Exception as e:
        print(f"TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
