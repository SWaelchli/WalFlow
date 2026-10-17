"""hybr and sparse_newton must find the same solution, and a warm start must need far fewer iterations than a cold one."""
import numpy as np
import pytest

from simulation.schemas import ReactFlowGraph
from simulation.graph_parser import GraphParser
from simulation.solver import NetworkSolver
from networks import generate_stress_network


def _solve(graph, method):
    network = GraphParser.parse_graph(graph)
    NetworkSolver._warm_start_cache.clear()
    NetworkSolver(network).solve(method=method)
    return network


@pytest.mark.parametrize("complexity", [5, 15, 30])
def test_hybr_and_sparse_newton_agree(complexity):
    graph = ReactFlowGraph(**generate_stress_network(complexity))
    p_hybr = np.array([n.inlets[0].pressure for n in _solve(graph, "hybr").nodes.values() if n.inlets])
    p_sparse = np.array([n.inlets[0].pressure for n in _solve(graph, "sparse_newton").nodes.values() if n.inlets])
    assert np.allclose(p_hybr, p_sparse, rtol=1e-3, atol=500.0)


def test_warm_start_needs_few_iterations():
    graph = ReactFlowGraph(**generate_stress_network(30))
    NetworkSolver._warm_start_cache.clear()
    iters_cold = NetworkSolver(GraphParser.parse_graph(graph)).solve(method="sparse_newton").get("total_inner_iterations", 0)

    for node in graph.nodes:
        if node.type in ("centrifugal_pump", "pump"):
            node.data["flow_rated_lmin"] = node.data.get("flow_rated_lmin", 100.0) * 1.01

    iters_adj = NetworkSolver(GraphParser.parse_graph(graph)).solve(method="sparse_newton").get("total_inner_iterations", 0)
    # F1-06: convergence also needs a small Newton step, which costs ~2 more evaluations than a residual-only test
    assert iters_adj <= 8 and iters_adj < iters_cold, f"warm start took {iters_adj} iterations (cold {iters_cold})"
