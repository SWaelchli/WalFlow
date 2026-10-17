"""Manual benchmark (not collected by pytest): solve time vs. network size for both solver methods.

Run from anywhere:  python backend/tests/bench/bench_solver_scaling.py
Each run appends ONE row to the git-ignored performance_log.md next to this file (delete the file if the columns change).
"""
import os
import subprocess
import sys
import time
from datetime import datetime

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(_HERE, "..", "helpers"), os.path.join(_HERE, "..", "..")]  # tests/helpers, backend/

from networks import generate_stress_network
from simulation.schemas import ReactFlowGraph
from simulation.graph_parser import GraphParser
from simulation.solver import NetworkSolver

COMPLEXITIES = [5, 15, 30, 50, 100]
METHODS = ["sparse_newton", "lm"]
REPEATS = 3
LOG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "performance_log.md")


def bench(graph, method):
    """Best-of-N cold solve (warm-start cache cleared each time); returns (parse_ms, solve_ms, stats)."""
    parse_best = solve_best = float("inf")
    stats = {}
    for _ in range(REPEATS):
        NetworkSolver._warm_start_cache.clear()
        t0 = time.perf_counter()
        network = GraphParser.parse_graph(graph)
        t1 = time.perf_counter()
        stats = NetworkSolver(network).solve(method=method)
        t2 = time.perf_counter()
        parse_best = min(parse_best, (t1 - t0) * 1000)
        solve_best = min(solve_best, (t2 - t1) * 1000)
    return parse_best, solve_best, stats


def git_commit():
    try:
        out = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=_HERE, capture_output=True, text=True, timeout=5)
        return out.stdout.strip() or "n/a"
    except Exception:
        return "n/a"


def main():
    """One row per run: best solve time in ms for every (network size, method), so runs compare line by line."""
    columns, cells = [], []
    all_ok = True
    for comp in COMPLEXITIES:
        data = generate_stress_network(comp)
        graph = ReactFlowGraph(**data)
        for method in METHODS:
            _, solve_ms, stats = bench(graph, method)
            all_ok = all_ok and bool(stats.get("success"))
            columns.append(f"{len(data['nodes'])}n {'newton' if method == 'sparse_newton' else method}")
            cells.append(f"{solve_ms:.1f}")

    header = "| Timestamp | Commit | " + " | ".join(columns) + " | OK |"
    row = f"| {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} | {git_commit()} | " + " | ".join(cells) + f" | {'yes' if all_ok else 'NO'} |"
    if not os.path.exists(LOG_FILE):
        with open(LOG_FILE, "w", encoding="utf-8") as log:
            log.write("# WalFlow Performance Log (solve time in ms, best of %d, cold start)" % REPEATS + "\n\n")
            log.write(header + "\n" + "|" + "---|" * (len(columns) + 3) + "\n")
    with open(LOG_FILE, "a", encoding="utf-8") as log:
        log.write(row + "\n")
    print(header)
    print(row)


if __name__ == "__main__":
    main()
