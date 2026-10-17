import time
import os
from datetime import datetime

from networks import generate_stress_network
from simulation.schemas import ReactFlowGraph
from simulation.graph_parser import GraphParser
from simulation.solver import NetworkSolver


def run_benchmark():
    print("[Benchmark] Starting WalFlow Performance Benchmark (HYBR Method)...")
    
    # 1. Setup
    complexity = 15 # Number of loops (yields 33 nodes, 47 edges)
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
        # Explicitly use hybr to maintain benchmark consistency
        solver.solve(method='hybr')
        solve_success = True
    except Exception as e:
        print(f"[Error] Solver Failed during benchmark: {e}")
        solve_success = False
    
    solve_time = time.perf_counter() - solver_start
    total_time = time.perf_counter() - start_time
    
    # 4. Logging
    log_result(len(mock_data['nodes']), len(mock_data['edges']), parse_time, solve_time, total_time, solve_success)
    
    print(f"[Benchmark] Complete!")
    print(f"   - Nodes: {len(mock_data['nodes'])}")
    print(f"   - Edges: {len(mock_data['edges'])}")
    print(f"   - Parse Time: {parse_time*1000:.2f} ms")
    print(f"   - Solve Time: {solve_time*1000:.2f} ms")
    print(f"   - Total Time: {total_time*1000:.2f} ms")

def log_result(nodes, edges, parse, solve, total, success):
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
