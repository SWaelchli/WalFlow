"""F1-12: the analytic Jacobian agrees with finite differences of the residual at the converged state
for every shipped diagram (and so for every equipment type in them)."""
import contextlib
import glob
import io
import json
import os

import numpy as np
import pytest

from simulation.graph_parser import GraphParser
from simulation.schemas import ReactFlowGraph
from simulation.solver import NetworkSolver

EXAMPLES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "frontend", "src", "data", "examples")
FILES = sorted(glob.glob(os.path.join(EXAMPLES, "*.wlf")))

# Rows are compared as a whole: the largest deviation in a row must stay below this share of the
# row's largest entry. Entries the solver deliberately floors (dead legs, tiny slopes) are far
# below the largest entry of their row, so they do not count.
ROW_TOLERANCE = 0.03


def finite_difference(objective, x, h=1e-6):
    n = len(x)
    jac = np.zeros((n, n))
    for k in range(n):
        xp, xm = x.copy(), x.copy()
        xp[k] += h
        xm[k] -= h
        jac[:, k] = (objective(xp) - objective(xm)) / (2 * h)
    return jac


def worst_row_deviation(solver):
    x = solver._last_x_scaled
    analytic = solver.calculate_jacobian(x).toarray()
    fd = finite_difference(solver._last_objective, x)
    worst = 0.0
    for r in range(analytic.shape[0]):
        scale = np.max(np.abs(fd[r]))
        if scale < 1e-6:
            continue
        worst = max(worst, np.max(np.abs(analytic[r] - fd[r])) / scale)
    return worst


def solve_file(path):
    data = json.load(open(path, encoding="utf-8"))
    cases = data.get("cases") or [None]
    out = []
    for case in cases:
        d = dict(data)
        if case is not None:
            d["active_case_id"] = case["id"]
        with contextlib.redirect_stdout(io.StringIO()):
            network = GraphParser.parse_graph(ReactFlowGraph(**d))
            solver = NetworkSolver(network)
            stats = solver.solve()
        out.append((case["name"] if case else "-", solver, stats))
    return out


@pytest.mark.parametrize("path", FILES, ids=[os.path.basename(p) for p in FILES])
def test_jacobian_matches_finite_differences(path):
    checked = 0
    for name, solver, stats in solve_file(path):
        if not stats.get("success") or not hasattr(solver, "_last_x_scaled"):
            continue
        dev = worst_row_deviation(solver)
        assert dev < ROW_TOLERANCE, f"{os.path.basename(path)} / {name}: row deviation {dev:.3f}"
        checked += 1
    assert checked > 0
