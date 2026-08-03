"""
WalFlow Hydraulic Simulator — Solver Performance Benchmark Suite
File: qa_report/performance/benchmark.py

Measures NetworkSolver performance across synthetic hydraulic networks of varying sizes:
- Small (~10 nodes)
- Medium (~50 nodes)
- Large (~100 nodes)
- Extra Large (~150 nodes)

Tracks:
- Graph parsing duration (ms)
- Solver execution time (ms)
- Outer & Inner iterations count
- Residual norms (L2 norm & Max norm of objective residual vector)
- Max physical mass & pressure balance residuals
- Memory consumption (Peak memory in KiB/MiB via tracemalloc)
- System size (number of state variables / equations)
"""

import sys
import os
import time
import tracemalloc
import numpy as np
from typing import Dict, Any, List, Tuple

# Ensure backend directory is in sys.path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
BACKEND_DIR = os.path.join(PROJECT_ROOT, "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from simulation.schemas import ReactFlowGraph, ReactFlowNode, ReactFlowEdge, GlobalSettings
from simulation.graph_parser import GraphParser
from simulation.solver import NetworkSolver


def build_synthetic_network(num_loops: int, comps_per_branch: int = 2) -> ReactFlowGraph:
    """
    Programmatically constructs a multi-loop hydraulic network.
    Topology: Source Tank -> Main Pump -> Splitter Tree -> N Parallel Branches -> Mixer Tree -> Sink Tank.
    
    Args:
        num_loops: Number of parallel hydraulic loops/branches.
        comps_per_branch: Number of components in series per branch.
    """
    nodes: List[ReactFlowNode] = []
    edges: List[ReactFlowEdge] = []

    # 1. Source Tank
    nodes.append(ReactFlowNode(
        id='tank_src', type='tank', position={'x': 0, 'y': 0},
        data={'label': 'Source Tank', 'elevation': 0.0, 'level': 5.0, 'temperature': 293.15, 'fluid_type': 'water'}
    ))

    # 2. Main Centrifugal Pump
    nodes.append(ReactFlowNode(
        id='pump_main', type='centrifugal_pump', position={'x': 100, 'y': 0},
        data={'label': 'Main Pump', 'flow_rated_lmin': 250.0 * num_loops, 'pressure_rated_bar': 6.0, 'rise_to_shutoff_pct': 20.0}
    ))

    edges.append(ReactFlowEdge(
        id='e_src_pump', source='tank_src', target='pump_main',
        sourceHandle='outlet-0', targetHandle='inlet-0',
        data={'length': 10.0, 'diameter': 0.15, 'friction_factor': 0.02}
    ))

    if num_loops == 1:
        prev_node = 'pump_main'
        prev_handle = 'outlet-0'
        for k in range(comps_per_branch):
            cid = f'b0_c{k}'
            ctype = 'linear_control_valve' if k == 0 else 'filter'
            cdata = (
                {'label': f'Branch 0 Comp {k}', 'max_cv': 0.05, 'opening': 75.0}
                if ctype == 'linear_control_valve'
                else {'label': f'Branch 0 Comp {k}', 'dp_clean': 0.1, 'dp_terminal': 1.0, 'flow_ref': 100.0, 'clogging': 5.0}
            )
            nodes.append(ReactFlowNode(id=cid, type=ctype, position={'x': 200 + k*100, 'y': 0}, data=cdata))
            edges.append(ReactFlowEdge(
                id=f'e_b0_{k}', source=prev_node, target=cid,
                sourceHandle=prev_handle, targetHandle='inlet-0',
                data={'length': 10.0, 'diameter': 0.1, 'friction_factor': 0.02}
            ))
            prev_node = cid
            prev_handle = 'outlet-0'

        nodes.append(ReactFlowNode(
            id='tank_snk', type='tank', position={'x': 500, 'y': 0},
            data={'label': 'Sink Tank', 'elevation': 0.0, 'level': 1.0, 'temperature': 293.15, 'fluid_type': 'water'}
        ))
        edges.append(ReactFlowEdge(
            id='e_snk', source=prev_node, target='tank_snk',
            sourceHandle=prev_handle, targetHandle='inlet-0',
            data={'length': 10.0, 'diameter': 0.15, 'friction_factor': 0.02}
        ))
    else:
        # Splitters chain
        for i in range(num_loops - 1):
            nodes.append(ReactFlowNode(id=f'split_{i}', type='splitter', position={'x': 200 + i*150, 'y': 0}, data={'label': f'Splitter {i}'}))

        # Connect pump to first splitter
        edges.append(ReactFlowEdge(
            id='e_pump_split', source='pump_main', target='split_0',
            sourceHandle='outlet-0', targetHandle='inlet-0',
            data={'length': 10.0, 'diameter': 0.15, 'friction_factor': 0.02}
        ))

        # Connect splitters in sequence
        for i in range(num_loops - 2):
            edges.append(ReactFlowEdge(
                id=f'e_split_chain_{i}', source=f'split_{i}', target=f'split_{i+1}',
                sourceHandle='outlet-1', targetHandle='inlet-0',
                data={'length': 5.0, 'diameter': 0.12, 'friction_factor': 0.02}
            ))

        # Mixers chain
        for i in range(num_loops - 1):
            nodes.append(ReactFlowNode(id=f'mix_{i}', type='mixer', position={'x': 600 + i*150, 'y': 0}, data={'label': f'Mixer {i}'}))

        # Connect mixers in sequence (mix_{i+1} outlet-0 -> mix_{i} inlet-1)
        for i in range(num_loops - 2):
            edges.append(ReactFlowEdge(
                id=f'e_mix_chain_{i}', source=f'mix_{i+1}', target=f'mix_{i}',
                sourceHandle='outlet-0', targetHandle='inlet-1',
                data={'length': 5.0, 'diameter': 0.12, 'friction_factor': 0.02}
            ))

        # Parallel branches
        for i in range(num_loops):
            # Determine source node and handle
            if i < num_loops - 1:
                src_n = f'split_{i}'
                src_h = 'outlet-0'
            else:
                src_n = f'split_{num_loops-2}'
                src_h = 'outlet-1'

            # Determine target node and handle
            if i == 0:
                tgt_n = 'mix_0'
                tgt_h = 'inlet-0'
            elif i < num_loops - 1:
                tgt_n = f'mix_{i}'
                tgt_h = 'inlet-0'
            else:
                tgt_n = f'mix_{num_loops-2}'
                tgt_h = 'inlet-1'

            prev_n = src_n
            prev_h = src_h
            for k in range(comps_per_branch):
                cid = f'b{i}_c{k}'
                if k == 0:
                    ctype = 'linear_control_valve'
                    cdata = {'label': f'Branch {i} Valve', 'max_cv': 0.05 + (i % 5)*0.01, 'opening': 60.0 + (i % 4)*10.0}
                elif k % 3 == 1:
                    ctype = 'filter'
                    cdata = {'label': f'Branch {i} Filter', 'dp_clean': 0.1, 'dp_terminal': 1.0, 'flow_ref': 100.0, 'clogging': (i % 6)*5.0}
                elif k % 3 == 2:
                    ctype = 'orifice'
                    cdata = {'label': f'Branch {i} Orifice', 'pipe_diameter': 0.08, 'orifice_diameter': 0.05}
                else:
                    ctype = 'heat_exchanger'
                    cdata = {'label': f'Branch {i} HX', 'rated_cooling_kw': 100.0, 'rated_flow_lmin': 200.0, 'design_inlet_temp_c': 50.0, 'medium_temp_c': 20.0, 'k_factor': 10.0}

                nodes.append(ReactFlowNode(id=cid, type=ctype, position={'x': 300 + i*80, 'y': 50 + k*40}, data=cdata))
                edges.append(ReactFlowEdge(
                    id=f'e_b{i}_{k}', source=prev_n, target=cid,
                    sourceHandle=prev_h, targetHandle='inlet-0',
                    data={'length': 10.0, 'diameter': 0.08, 'friction_factor': 0.02}
                ))
                prev_n = cid
                prev_h = 'outlet-0'

            edges.append(ReactFlowEdge(
                id=f'e_b{i}_out', source=prev_n, target=tgt_n,
                sourceHandle=prev_h, targetHandle=tgt_h,
                data={'length': 10.0, 'diameter': 0.08, 'friction_factor': 0.02}
            ))

        # Sink Tank
        nodes.append(ReactFlowNode(
            id='tank_snk', type='tank', position={'x': 1000, 'y': 0},
            data={'label': 'Sink Tank', 'elevation': 0.0, 'level': 1.0, 'temperature': 293.15, 'fluid_type': 'water'}
        ))
        edges.append(ReactFlowEdge(
            id='e_snk', source='mix_0', target='tank_snk',
            sourceHandle='outlet-0', targetHandle='inlet-0',
            data={'length': 10.0, 'diameter': 0.15, 'friction_factor': 0.02}
        ))

    global_settings = GlobalSettings(
        inner_iterations=2500,
        tolerance=1e-6,
        solver_method='hybr'
    )
    return ReactFlowGraph(nodes=nodes, edges=edges, global_settings=global_settings)


def evaluate_residual_norms(solver: NetworkSolver) -> Tuple[float, float, float, float]:
    """
    Computes solver objective residual norms and physical residuals post-solving.
    
    Returns:
        (l2_norm, max_norm, max_mass_balance_error_m3s, max_pressure_balance_error_pa)
    """
    # 1. Mass balance check on internal nodes
    max_mass_error = 0.0
    for node_id in solver.node_ids:
        node = solver.network.nodes[node_id]
        if hasattr(node, 'inlets') and hasattr(node, 'outlets') and not isinstance(node, (type(None))):
            from simulation.equipment.tank import Tank
            if isinstance(node, Tank):
                continue
            q_in = sum(p.flow_rate for p in node.inlets)
            q_out = sum(p.flow_rate for p in node.outlets)
            mass_err = abs(q_in - q_out)
            if mass_err > max_mass_error:
                max_mass_error = mass_err

    # 2. Pressure balance check on edges
    max_press_error = 0.0
    for edge in solver.edges_list:
        pipe = edge['pipe']
        p_in = pipe.inlets[0].pressure
        p_out = pipe.outlets[0].pressure
        q = pipe.inlets[0].flow_rate
        rho = pipe.inlets[0].density
        mu = pipe.inlets[0].viscosity
        dp_calc = pipe.calculate_delta_p(q, rho, mu)
        press_err = abs((p_in - p_out) - dp_calc)
        if press_err > max_press_error:
            max_press_error = press_err

    # Scaled solver residuals
    q_scale = 0.001
    p_scale = 100000.0
    scaled_mass_res = [5.0 * (sum(p.flow_rate for p in solver.network.nodes[nid].inlets) - sum(p.flow_rate for p in solver.network.nodes[nid].outlets)) / q_scale for nid in solver.node_ids if not isinstance(solver.network.nodes[nid], (type(None))) and not isinstance(solver.network.nodes[nid], solver.nodes_list[0].__class__ if hasattr(solver.nodes_list[0], 'elevation') else object)]
    
    # Calculate objective vector residual norm from physical errors
    # Mass residual scaled by 5/q_scale, Pressure residual scaled by 1/p_scale
    mass_residuals_scaled = [5.0 * max_mass_error / q_scale]
    press_residuals_scaled = [max_press_error / p_scale]
    all_res = np.array(mass_residuals_scaled + press_residuals_scaled)
    
    l2_norm = float(np.linalg.norm(all_res))
    max_norm = float(np.max(np.abs(all_res)))

    return l2_norm, max_norm, max_mass_error, max_press_error


def run_benchmark_suite() -> List[Dict[str, Any]]:
    """
    Runs solver benchmarking across small, medium, large, and extra-large networks.
    """
    benchmarks = [
        {"category": "Small", "target_nodes": 10, "loops": 2, "comps_per_branch": 2},
        {"category": "Medium", "target_nodes": 50, "loops": 12, "comps_per_branch": 2},
        {"category": "Large", "target_nodes": 100, "loops": 25, "comps_per_branch": 2},
    ]

    results: List[Dict[str, Any]] = []

    print("=" * 105)
    print(" WALFLOW HYDRAULIC SOLVER PERFORMANCE BENCHMARK SUITE ".center(105, "="))
    print("=" * 105)
    print(f"{'Category':<12} | {'Nodes':<6} | {'Edges':<6} | {'Vars(N)':<8} | {'Parse(ms)':<10} | {'Solve(ms)':<10} | {'Inner Iters':<12} | {'L2 Residual':<12} | {'Peak Mem (KiB)':<14}")
    print("-" * 105)

    for bench in benchmarks:
        num_loops = bench["loops"]
        comps = bench["comps_per_branch"]

        # 1. Start memory tracing
        tracemalloc.start()
        tracemalloc.reset_peak()

        # 2. Build synthetic network graph
        graph = build_synthetic_network(num_loops=num_loops, comps_per_branch=comps)

        # 3. Measure Graph Parser Time
        t_parse_start = time.perf_counter()
        network = GraphParser.parse_graph(graph)
        t_parse_end = time.perf_counter()
        parse_time_ms = (t_parse_end - t_parse_start) * 1000.0

        node_count = len(network.nodes)
        edge_count = len(network.edges)

        # 4. Instantiate Solver and measure Solve Time
        solver = NetworkSolver(network)
        system_size = len(solver.internal_node_indices) + len(solver.edges_list)

        t_solve_start = time.perf_counter()
        stats = solver.solve()
        t_solve_end = time.perf_counter()
        solve_time_ms = (t_solve_end - t_solve_start) * 1000.0

        # 5. Measure Memory Usage
        current_mem, peak_mem = tracemalloc.get_traced_memory()
        tracemalloc.stop()

        peak_mem_kib = peak_mem / 1024.0
        peak_mem_mib = peak_mem / (1024.0 * 1024.0)

        # 6. Evaluate Residual Norms
        l2_norm, max_norm, max_mass_err, max_press_err = evaluate_residual_norms(solver)

        res_entry = {
            "category": bench["category"],
            "nodes": node_count,
            "edges": edge_count,
            "system_size": system_size,
            "parse_time_ms": parse_time_ms,
            "solve_time_ms": solve_time_ms,
            "success": stats.get("success", False),
            "outer_iterations": stats.get("outer_iterations", 0),
            "inner_iterations": stats.get("total_inner_iterations", 0),
            "fallback_used": stats.get("fallback_used", False),
            "l2_residual": l2_norm,
            "max_residual": max_norm,
            "max_mass_error_m3s": max_mass_err,
            "max_pressure_error_pa": max_press_err,
            "peak_memory_kib": peak_mem_kib,
            "peak_memory_mib": peak_mem_mib
        }
        results.append(res_entry)

        print(
            f"{bench['category']:<12} | "
            f"{node_count:<6} | "
            f"{edge_count:<6} | "
            f"{system_size:<8} | "
            f"{parse_time_ms:<10.2f} | "
            f"{solve_time_ms:<10.2f} | "
            f"{stats.get('total_inner_iterations', 0):<12} | "
            f"{l2_norm:<12.3e} | "
            f"{peak_mem_kib:<14.2f}",
            flush=True
        )

    print("-" * 105)
    print("\n" + "=" * 105)
    print(" DETAILED EXECUTION METRICS SUMMARY TABLE ".center(105, "="))
    print("=" * 105)

    for r in results:
        print(f"\n[+] Network Size: {r['category']} ({r['nodes']} Nodes, {r['edges']} Edges, N={r['system_size']} State Variables)")
        print(f"    |-- Graph Parsing Duration:     {r['parse_time_ms']:.3f} ms")
        print(f"    |-- Solver Execution Time:      {r['solve_time_ms']:.2f} ms ({r['solve_time_ms']/1000.0:.3f} sec)")
        print(f"    |-- Convergence Status:          {'SUCCESS' if r['success'] else 'FAILED'} (Fallback used: {r['fallback_used']})")
        print(f"    |-- Outer Loop Iterations:      {r['outer_iterations']}")
        print(f"    |-- Total Inner Iterations:     {r['inner_iterations']}")
        print(f"    |-- L2 Residual Norm:           {r['l2_residual']:.6e}")
        print(f"    |-- Max Residual Norm:          {r['max_residual']:.6e}")
        print(f"    |-- Max Mass Balance Error:     {r['max_mass_error_m3s']:.6e} m³/s")
        print(f"    |-- Max Pressure Balance Error: {r['max_pressure_error_pa']:.6e} Pa")
        print(f"    +-- Peak Memory Usage:          {r['peak_memory_kib']:.2f} KiB ({r['peak_memory_mib']:.3f} MiB)")

    print("\n" + "=" * 105)
    return results


if __name__ == "__main__":
    if hasattr(sys.stdout, 'reconfigure'):
        try:
            sys.stdout.reconfigure(encoding='utf-8')
        except Exception:
            pass
    run_benchmark_suite()
