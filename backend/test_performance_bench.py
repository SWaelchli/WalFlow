import time
import os
import sys
import json
from datetime import datetime

# Add backend to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from simulation.schemas import ReactFlowGraph, GlobalSettings
from simulation.graph_parser import GraphParser
from simulation.solver import NetworkSolver

def generate_stress_network(size=10):
    """
    Generates a synthetic network with 'size' parallel loops.
    Each loop has: Splitter -> 2 Pipes -> Mixer.
    """
    nodes = [
        {"id": "t_start", "type": "tank", "data": {"label": "Source", "level": 10.0}, "position": {"x":0,"y":0}},
        {"id": "p_main", "type": "pump", "data": {"A": 100, "B": 0, "C": -1000}, "position": {"x":100,"y":0}},
    ]
    edges = [
        {"id": "e_start", "source": "t_start", "target": "p_main", "data": {"length": 1, "diameter": 0.1}}
    ]

    prev_node = "p_main"
    for i in range(size):
        s_id = f"s_{i}"
        m_id = f"m_{i}"
        
        nodes.append({"id": s_id, "type": "splitter", "data": {"label": f"S{i}"}, "position": {"x": 200 + i*200, "y": 0}})
        nodes.append({"id": m_id, "type": "mixer", "data": {"label": f"M{i}"}, "position": {"x": 300 + i*200, "y": 0}})
        
        # Connect previous to splitter
        edges.append({"id": f"e_pre_{i}", "source": prev_node, "target": s_id, "data": {"length": 1, "diameter": 0.1}})
        
        # Parallel paths
        edges.append({"id": f"e_p1_{i}", "source": s_id, "target": m_id, "data": {"length": 10, "diameter": 0.05}})
        edges.append({"id": f"e_p2_{i}", "source": s_id, "target": m_id, "data": {"length": 10, "diameter": 0.08}})
        
        prev_node = m_id

    nodes.append({"id": "t_end", "type": "tank", "data": {"label": "Sink", "level": 1.0}, "position": {"x": 200 + size*200, "y": 0}})
    edges.append({"id": "e_end", "source": prev_node, "target": "t_end", "data": {"length": 1, "diameter": 0.1}})

    return {"nodes": nodes, "edges": edges}

def run_benchmark():
    print("🚀 Starting WalFlow Performance Benchmark...")
    
    # 1. Setup
    complexity = 15 # Number of loops
    mock_data = generate_stress_network(complexity)
    
    start_time = time.perf_counter()
    
    # 2. Parsing
    graph = ReactFlowGraph(**mock_data)
    network = GraphParser.parse_graph(graph)
    parse_time = time.perf_counter() - start_time
    
    # 3. Solving
    solver_start = time.perf_counter()
    try:
        solver = NetworkSolver(network)
        solver.solve()
        solve_success = True
    except Exception as e:
        print(f"❌ Solver Failed during benchmark: {e}")
        solve_success = False
    
    solve_time = time.perf_counter() - solver_start
    total_time = time.perf_counter() - start_time
    
    # 4. Logging
    log_result(complexity, len(mock_data['nodes']), len(mock_data['edges']), parse_time, solve_time, total_time, solve_success)
    
    print(f"✅ Benchmark Complete!")
    print(f"   - Nodes: {len(mock_data['nodes'])}")
    print(f"   - Edges: {len(mock_data['edges'])}")
    print(f"   - Parse Time: {parse_time*1000:.2f} ms")
    print(f"   - Solve Time: {solve_time*1000:.2f} ms")
    print(f"   - Total Time: {total_time*1000:.2f} ms")

def log_result(complexity, nodes, edges, parse, solve, total, success):
    log_file = os.path.join(os.path.dirname(__file__), "performance_log.md")
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    status = "PASS" if success else "FAIL"
    
    # Create file with header if it doesn't exist
    if not os.path.exists(log_file):
        with open(log_file, "w") as f:
            f.write("# WalFlow Performance Log\n\n")
            f.write("| Timestamp | Nodes | Edges | Parse (ms) | Solve (ms) | Total (ms) | Status |\n")
            f.write("|-----------|-------|-------|------------|------------|------------|--------|\n")
    
    # Append the result
    with open(log_file, "a") as f:
        f.write(f"| {timestamp} | {nodes} | {edges} | {parse*1000:.2f} | {solve*1000:.2f} | {total*1000:.2f} | {status} |\n")

if __name__ == "__main__":
    run_benchmark()
