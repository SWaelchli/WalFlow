"""Manual benchmark (not collected by pytest): PYTHONPATH=.:tests/helpers python tests/bench/bench_solver_comparison.py
Correctness of the two methods is guarded in regression/test_solver_methods_agree.py."""
import time
import numpy as np

from simulation.schemas import ReactFlowGraph
from simulation.graph_parser import GraphParser
from simulation.solver import NetworkSolver
from networks import generate_stress_network

def run_performance_comparison():
    print("======================================================================")
    print(" WALFLOW SOLVER OPTIMIZATION COMPARISON BENCHMARK")
    print("======================================================================")
    
    complexities = [5, 15, 30, 50]
    
    print(f"{'Nodes':<6} | {'Edges':<6} | {'Method':<15} | {'Solve Time (ms)':<15} | {'Outer Iters':<12} | {'Inner Iters':<12} | {'Max Residual':<12}")
    print("-" * 88)
    
    for comp in complexities:
        mock_data = generate_stress_network(comp)
        num_nodes = len(mock_data['nodes'])
        num_edges = len(mock_data['edges'])
        
        # Parse graph
        graph = ReactFlowGraph(**mock_data)
        
        # 1. Benchmark hybr (dense solver, finite-difference Jacobian)
        network_hybr = GraphParser.parse_graph(graph)
        # Clear cache to ensure clean baseline run
        NetworkSolver._warm_start_cache.clear()
        
        solver_hybr = NetworkSolver(network_hybr)
        start = time.perf_counter()
        stats_hybr = solver_hybr.solve(method='hybr')
        time_hybr = (time.perf_counter() - start) * 1000.0
        
        # 2. Benchmark sparse_newton (analytical sparse Jacobian, sparse Newton-Raphson)
        network_sparse = GraphParser.parse_graph(graph)
        # Clear cache to ensure clean baseline run
        NetworkSolver._warm_start_cache.clear()
        
        solver_sparse = NetworkSolver(network_sparse)
        start = time.perf_counter()
        stats_sparse = solver_sparse.solve(method='sparse_newton')
        time_sparse = (time.perf_counter() - start) * 1000.0
        
        # 3. Print side-by-side results
        res_hybr = stats_hybr.get("bottleneck", {}).get("magnitude", 0.0) if stats_hybr.get("bottleneck") else 0.0
        res_sparse = stats_sparse.get("bottleneck", {}).get("magnitude", 0.0) if stats_sparse.get("bottleneck") else 0.0
        
        print(f"{num_nodes:<6} | {num_edges:<6} | {'hybr':<15} | {time_hybr:<15.2f} | {stats_hybr.get('outer_iterations', 0):<12} | {stats_hybr.get('total_inner_iterations', 0):<12} | {res_hybr:<12.2e}")
        print(f"{num_nodes:<6} | {num_edges:<6} | {'sparse_newton':<15} | {time_sparse:<15.2f} | {stats_sparse.get('outer_iterations', 0):<12} | {stats_sparse.get('total_inner_iterations', 0):<12} | {res_sparse:<12.2e}")
        print("-" * 88)
        

if __name__ == "__main__":
    run_performance_comparison()

