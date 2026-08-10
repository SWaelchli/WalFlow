import time
import numpy as np
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from simulation.schemas import ReactFlowGraph, GlobalSettings
from simulation.graph_parser import GraphParser
from simulation.solver import NetworkSolver
from test_performance_bench import generate_stress_network

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
        
        # Assert accuracy consistency
        # Compare internal node pressures
        p_hybr = np.array([n.inlets[0].pressure for n in network_hybr.nodes.values() if n.inlets])
        p_sparse = np.array([n.inlets[0].pressure for n in network_sparse.nodes.values() if n.inlets])
        assert np.allclose(p_hybr, p_sparse, rtol=1e-3, atol=500.0), f"Pressure discrepancy found at complexity {comp}!"
        
    # 4. Verify Warm-Start Caching Speedups
    print("\n--- Testing Warm-Start Iteration Reduction ---")
    mock_data = generate_stress_network(30)
    graph = ReactFlowGraph(**mock_data)
    
    # Run 1: Cold start
    NetworkSolver._warm_start_cache.clear()
    network = GraphParser.parse_graph(graph)
    solver = NetworkSolver(network)
    stats_cold = solver.solve(method='sparse_newton')
    iters_cold = stats_cold.get('total_inner_iterations', 0)
    print(f"Cold Start Solver Iterations: {iters_cold}")
    
    # Run 2: Hot start (identical state)
    stats_hot = solver.solve(method='sparse_newton')
    iters_hot = stats_hot.get('total_inner_iterations', 0)
    print(f"Hot Start (Identical Graph) Solver Iterations: {iters_hot}")
    
    # Run 3: Slider Adjustment (adjust pump coefficient slightly)
    # Find pump and adjust pressure_rated
    for node in graph.nodes:
        if node.type in ['centrifugal_pump', 'pump']:
            # Adjust flow_rated_lmin slightly
            current_val = node.data.get('flow_rated_lmin', 100.0)
            node.data['flow_rated_lmin'] = current_val * 1.01

            
    network_adj = GraphParser.parse_graph(graph)
    solver_adj = NetworkSolver(network_adj)
    stats_adj = solver_adj.solve(method='sparse_newton')
    iters_adj = stats_adj.get('total_inner_iterations', 0)
    print(f"Hot Start (1% Slider Adjustment) Solver Iterations: {iters_adj}")
    
    reduction = (1.0 - (iters_adj / iters_cold)) * 100.0
    print(f"Iteration Reduction (vs Cold Sparse): {reduction:.2f}%")
    
    # Compare with typical legacy HYBR iterations (which is around 177 for complexity 30)
    reduction_hybr = (1.0 - (iters_adj / 177.0)) * 100.0
    print(f"Iteration Reduction (vs Legacy HYBR): {reduction_hybr:.2f}%")
    
    assert iters_adj <= 5, f"Warm-start required too many iterations: {iters_adj} (expected <= 5)"
    print("Warm-Start Iteration Reduction Verification: PASS")
    print("======================================================================")


def test_solver_performance():
    run_performance_comparison()

if __name__ == "__main__":
    run_performance_comparison()

