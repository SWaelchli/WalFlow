import sys
import os

# Add backend to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from simulation.schemas import ReactFlowGraph
from simulation.graph_parser import GraphParser
from simulation.solver import NetworkSolver

def test_dual_source_to_sink():
    """
    Scenario: Two sources at different pressures merging into one sink.
    T1 (10m) \
              -> Mixer -> Orifice -> T3 (1m)
    T2 (5m)  /
    """
    print("\n" + "="*60)
    print("TEST: DUAL SOURCE MERGING INTO SINGLE SINK")
    print("="*60)
    
    mock_graph = {
        "nodes": [
            {"id": "t1", "type": "tank", "data": {"label": "Source High", "level": 10.0, "elevation": 0.0}, "position": {"x":0,"y":0}},
            {"id": "t2", "type": "tank", "data": {"label": "Source Low", "level": 9.0, "elevation": 0.0}, "position": {"x":0,"y":200}},
            {"id": "mix1", "type": "mixer", "data": {"label": "Mixer"}, "position": {"x":200,"y":100}},
            {"id": "ori1", "type": "orifice", "data": {"label": "Restricting Orifice", "pipe_diameter": 0.1, "orifice_diameter": 0.05}, "position": {"x":400,"y":100}},
            {"id": "t3", "type": "tank", "data": {"label": "Sink", "level": 1.0, "elevation": 0.0}, "position": {"x":600,"y":100}},
        ],
        "edges": [
            {"id": "e1", "source": "t1", "target": "mix1", "data": {"length": 50.0, "diameter": 0.1}},
            {"id": "e2", "source": "t2", "target": "mix1", "data": {"length": 5.0, "diameter": 0.1}},
            {"id": "e3", "source": "mix1", "target": "ori1", "data": {"length": 2.0, "diameter": 0.1}},
            {"id": "e4", "source": "ori1", "target": "t3", "data": {"length": 5.0, "diameter": 0.1}},
        ]
    }
    
    graph = ReactFlowGraph(**mock_graph)
    network = GraphParser.parse_graph(graph)
    solver = NetworkSolver(network)
    solver.solve()
    
    # Verify flows
    flows = {edge['pipe'].name: edge['pipe'].inlets[0].flow_rate for edge in network.edges}
    
    for pipe_name, q in flows.items():
        print(f"{pipe_name}: {q:,.4f} m3/s")
        
    q1 = flows['Pipe e1']
    q2 = flows['Pipe e2']
    q4 = flows['Pipe e4']
    
    print(f"\nSource 1 Flow: {q1:,.4f} m3/s")
    print(f"Source 2 Flow: {q2:,.4f} m3/s")
    print(f"Total to Sink: {q4:,.4f} m3/s")
    
    assert q1 > 0
    assert q2 > 0
    assert abs((q1 + q2) - q4) < 1e-6
    assert q1 > q2  # T1 has higher head than T2
    print("\nSUCCESS: Dual source merging verified!")

def test_source_to_dual_sink():
    """
    Scenario: One source splitting into two sinks at different levels.
    T1 (10m) -> Splitter -> Path A -> T2 (2m Sink)
                         -> Path B -> T3 (8m Sink)
    """
    print("\n" + "="*60)
    print("TEST: SINGLE SOURCE SPLITTING INTO DUAL SINKS")
    print("="*60)
    
    mock_graph = {
        "nodes": [
            {"id": "t1", "type": "tank", "data": {"label": "High Source", "level": 10.0, "elevation": 0.0}, "position": {"x":0,"y":100}},
            {"id": "split1", "type": "splitter", "data": {"label": "Splitter"}, "position": {"x":200,"y":100}},
            {"id": "t2", "type": "tank", "data": {"label": "Low Sink", "level": 2.0, "elevation": 0.0}, "position": {"x":400,"y":0}},
            {"id": "t3", "type": "tank", "data": {"label": "High Sink", "level": 8.0, "elevation": 0.0}, "position": {"x":400,"y":200}},
        ],
        "edges": [
            {"id": "e_in", "source": "t1", "target": "split1", "data": {"length": 1.0, "diameter": 0.1}},
            {"id": "e_out1", "source": "split1", "target": "t2", "data": {"length": 10.0, "diameter": 0.1}},
            {"id": "e_out2", "source": "split1", "target": "t3", "data": {"length": 10.0, "diameter": 0.1}},
        ]
    }
    
    graph = ReactFlowGraph(**mock_graph)
    network = GraphParser.parse_graph(graph)
    solver = NetworkSolver(network)
    solver.solve()
    
    flows = {edge['pipe'].name: edge['pipe'].inlets[0].flow_rate for edge in network.edges}
    
    for pipe_name, q in flows.items():
        print(f"{pipe_name}: {q:,.4f} m3/s")
        
    q_in = flows['Pipe e_in']
    q_low_sink = flows['Pipe e_out1']
    q_high_sink = flows['Pipe e_out2']
    
    print(f"\nTotal Outflow: {q_in:,.4f} m3/s")
    print(f"Flow to Low Sink (2m): {q_low_sink:,.4f} m3/s")
    print(f"Flow to High Sink (8m): {q_high_sink:,.4f} m3/s")
    
    assert q_low_sink > q_high_sink
    assert abs(q_in - (q_low_sink + q_high_sink)) < 1e-6
    print("\nSUCCESS: Source to dual sink split verified!")

if __name__ == "__main__":
    try:
        test_dual_source_to_sink()
        test_source_to_dual_sink()
    except Exception as e:
        print(f"TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
