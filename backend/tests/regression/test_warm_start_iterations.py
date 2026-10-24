"""Both solver methods find the same solution, and a warm start needs far fewer iterations than a cold one."""
import numpy as np
import pytest

from simulation.schemas import ReactFlowGraph
from simulation.graph_parser import GraphParser
from simulation.solver import NetworkSolver
from networks import generate_stress_network


@pytest.mark.parametrize("complexity", [5, 15, 30])
def test_newton_and_lm_agree(complexity):
    """The two solver methods are independent algorithms; they must land on the same pressures."""
    graph = ReactFlowGraph(**generate_stress_network(complexity))
    results = {}
    for method in ("sparse_newton", "lm"):
        NetworkSolver._warm_start_cache.clear()
        network = GraphParser.parse_graph(graph)
        assert NetworkSolver(network).solve(method=method)["success"], method
        results[method] = np.array([n.inlets[0].pressure for n in network.nodes.values() if n.inlets])
    assert np.allclose(results["sparse_newton"], results["lm"], rtol=1e-3, atol=500.0)


def test_warm_start_needs_few_iterations():
    graph = ReactFlowGraph(**generate_stress_network(30))
    NetworkSolver._warm_start_cache.clear()
    iters_cold = NetworkSolver(GraphParser.parse_graph(graph)).solve(method="sparse_newton").get("total_inner_iterations", 0)

    for node in graph.nodes:
        if node.type in ("centrifugal_pump", "pump"):
            node.data["flow_rated_lmin"] = node.data.get("flow_rated_lmin", 100.0) * 1.01

    iters_adj = NetworkSolver(GraphParser.parse_graph(graph)).solve(method="sparse_newton").get("total_inner_iterations", 0)
    # Convergence also needs a small Newton step, which costs ~2 more evaluations than a residual-only test
    assert iters_adj <= 8 and iters_adj < iters_cold, f"warm start took {iters_adj} iterations (cold {iters_cold})"
