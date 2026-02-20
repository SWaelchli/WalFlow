import sys
import os

# Ensure we can import from the backend directory
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from simulation.schemas import ReactFlowGraph
from simulation.graph_parser import GraphParser
from simulation.solver import NetworkSolver
from simulation.equipment.tank import Tank
from simulation.equipment.pipe import Pipe

def test_state_propagation():
    # 1. Mock a React Flow Graph: Tank1 -> Edge -> Tank2
    mock_graph = {
        "nodes": [
            {"id": "t1", "type": "tank", "data": {"label": "High Tank", "level": 10.0, "elevation": 0.0}, "position": {"x":0,"y":0}},
            {"id": "t2", "type": "tank", "data": {"label": "Low Tank", "level": 0.0, "elevation": 0.0}, "position": {"x":500,"y":0}}
        ],
        "edges": [
            {"id": "e1", "source": "t1", "target": "t2", "data": {"length": 25.0, "diameter": 0.1, "friction_factor": 0.02}}
        ]
    }
    
    graph = ReactFlowGraph(**mock_graph)
    network = GraphParser.parse_graph(graph)
    
    # 2. Verify Network structure
    # Tank -> Edge(Pipe) -> Tank
    assert len(network.nodes) == 2
    assert len(network.edges) == 1
    
    # 3. Solve
    solver = NetworkSolver(network)
    flow_rate = solver.solve()
    print(f"Calculated Flow Rate: {flow_rate:.5f} m3/s")
    
    # 4. Verify Pressures (Telemetry)
    t1 = network.nodes['t1']
    t2 = network.nodes['t2']
    pipe = network.edges[0]['pipe']
    
    p1_out = t1.outlets[0].pressure
    p_pipe_in = pipe.inlets[0].pressure
    p_pipe_out = pipe.outlets[0].pressure
    p2_in = t2.inlets[0].pressure
    
    print(f"T1 Outlet: {p1_out:.1f} Pa")
    print(f"Pipe Inlet: {p_pipe_in:.1f} Pa")
    print(f"Pipe Outlet: {p_pipe_out:.1f} Pa")
    print(f"T2 Inlet: {p2_in:.1f} Pa")
    
    # T1 static head + atm = 101325 + 1000*9.81*10 = 199425
    assert abs(p1_out - 199425.0) < 1.0
    # Continuity
    assert p1_out == p_pipe_in
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
