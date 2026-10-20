"""Manual benchmark (not collected by pytest): the 3-way TCV loop.

Run from anywhere:  python backend/tests/bench/bench_tcv_loop.py [--quick]
Every shipped example case and every scenario of helpers/tcv_networks.py is solved. Per case: success, controller convergence, outer / inner iterations, best-of-N cold
solve time, the largest outlet error of the TCVs that are not at an end stop, and the history spread: the same
case from start mix ratios 0.1 / 0.5 / 0.9 and warm-started, as the largest difference in TCV outlet temperature
and in minority-branch flow. The table goes to stdout and to bench_tcv_loop.md next to this file.
"""
import contextlib
import glob
import io
import json
import os
import statistics
import sys
import time

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(_HERE, "..", "helpers"), os.path.join(_HERE, "..", "..")]  # tests/helpers, backend/

from tcv_networks import tcv_scenarios
from walflow_paths import EXAMPLES_DIR
from simulation.equipment.three_way_tcv import ThreeWayTCV
from simulation.graph_parser import GraphParser
from simulation.schemas import ReactFlowGraph
from simulation.solver import NetworkSolver

REPEATS = 3
STARTS = (0.1, 0.9)
OUT_FILE = os.path.join(_HERE, "bench_tcv_loop.md")


def shipped_cases():
    for path in sorted(glob.glob(os.path.join(EXAMPLES_DIR, "*.wlf"))):
        data = json.load(open(path, encoding="utf-8"))
        name = os.path.basename(path)[len("Example_"):-len(".wlf")]
        for case in data.get("cases") or [None]:
            yield f"{name} / {case['name'] if case else '-'}", ReactFlowGraph(**data), case["id"] if case else None


def solve(graph, case_id, start=0.5, cold=True):
    NetworkSolver.TCV_START_MIX = start
    if cold:
        NetworkSolver._warm_start_cache.clear()
    with contextlib.redirect_stdout(io.StringIO()):
        network = GraphParser.parse_graph(graph, case_id=case_id)
        t0 = time.perf_counter()
        stats = NetworkSolver(network).solve()
        ms = (time.perf_counter() - t0) * 1000
    tcvs = []
    for node in network.nodes.values():
        if isinstance(node, ThreeWayTCV):
            at_stop = node.mix_ratio <= NetworkSolver.TCV_MIX_MIN * 1.001 or node.mix_ratio >= NetworkSolver.TCV_MIX_MAX - 1e-6
            q = sorted(p.flow_rate * 60000.0 for p in node.inlets)
            tcvs.append({"err": node.outlets[0].temperature - node.set_temperature, "t": node.outlets[0].temperature,
                         "mix": node.mix_ratio, "at_stop": at_stop, "q_min": q[0], "q_tot": sum(q)})
    return stats, ms, tcvs


def measure(graph, case_id):
    best, runs = float("inf"), []
    for _ in range(REPEATS):
        stats, ms, tcvs = solve(graph, case_id)
        best = min(best, ms)
    runs.append(tcvs)
    if tcvs:
        runs += [solve(graph, case_id, start=s)[2] for s in STARTS]
        solve(graph, case_id)
        runs.append(solve(graph, case_id, cold=False)[2])     # warm-started after a cold solve
    spread_t = spread_q = 0.0
    for i in range(len(tcvs)):
        ts = [r[i]["t"] for r in runs if len(r) > i]
        qs = [r[i]["q_min"] for r in runs if len(r) > i]
        spread_t = max(spread_t, max(ts) - min(ts))
        spread_q = max(spread_q, (max(qs) - min(qs)) / max(1e-3 * tcvs[i]["q_tot"], abs(max(qs, key=abs))))
    regulating = [t["err"] for t in tcvs if not t["at_stop"]]
    return {
        "ok": bool(stats.get("success")), "ctl": bool(stats.get("controls_converged")),
        "it": stats.get("outer_iterations", 0), "inner": stats.get("total_inner_iterations", 0), "ms": best,
        "limit": stats.get("outer_iterations", 0) >= 100,
        "err": max((abs(e) for e in regulating), default=0.0), "n_tcv": len(tcvs),
        "spread_t": spread_t, "spread_q": spread_q,
    }


def cell(r):
    flag = "" if r["ok"] and r["ctl"] and not r["limit"] else " FAIL" if not r["ok"] else " NC"
    if not r["n_tcv"]:
        return f"{r['it']} it {r['ms']:.0f} ms{flag}"
    return f"{r['it']} it {r['ms']:.0f} ms {r['err']:.3f} K ±{r['spread_t']:.3f} K q±{100 * r['spread_q']:.0f}%{flag}"


def main():
    if "--quick" in sys.argv:
        global REPEATS
        REPEATS = 1
    cases = list(shipped_cases()) + [(f"syn {n}", g, None) for n, g in tcv_scenarios()]
    results = {}
    for name, graph, case_id in cases:
        results[name] = measure(graph, case_id)
        print(f"{name:52} {cell(results[name])}", flush=True)
    NetworkSolver.TCV_START_MIX = 0.5

    tcv = [r for r in results.values() if r["n_tcv"]]
    lines = ["| Case | Result |", "|---|---|"] + [f"| {name} | {cell(r)} |" for name, r in results.items()]
    lines += ["", "| Summary (TCV cases) | |", "|---|---|",
              "| failed / not converged / at limit | {} / {} / {} |".format(
                  sum(not r["ok"] for r in results.values()), sum(not r["ctl"] for r in results.values()),
                  sum(r["limit"] for r in results.values())),
              f"| total outer iterations | {sum(r['it'] for r in tcv)} |",
              f"| total / median time (ms) | {sum(r['ms'] for r in tcv):.0f} / {statistics.median(r['ms'] for r in tcv):.1f} |",
              f"| max setpoint error (K) | {max(r['err'] for r in tcv):.3f} |",
              f"| max history spread (K) | {max(r['spread_t'] for r in tcv):.3f} |",
              f"| max minority-flow spread | {100 * max(r['spread_q'] for r in tcv):.1f} % |"]
    text = "\n".join(lines)
    print("\n" + text)
    with open(OUT_FILE, "w", encoding="utf-8") as f:
        f.write(text + "\n")


if __name__ == "__main__":
    main()
