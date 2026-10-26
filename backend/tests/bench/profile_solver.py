"""Manual performance helper (not collected by pytest): profile, time and snapshot the solver, compare snapshots.

Run from anywhere:  python backend/tests/bench/profile_solver.py profile [--top N] [--sort tottime|cumulative]
                    python backend/tests/bench/profile_solver.py time [--repeats N]
                    python backend/tests/bench/profile_solver.py snapshot <name>
                    python backend/tests/bench/profile_solver.py compare <before> <after>
The suite is every case of every shipped example plus the stress networks, each solved cold (warm-start cache cleared).
Snapshots go to the git-ignored perf_snapshots/ next to this file; compare ends with the risk class of walflow-performance.
"""
import argparse
import contextlib
import cProfile
import glob
import io
import json
import math
import os
import pstats
import sys
import time

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(_HERE, "..", "helpers"), os.path.join(_HERE, "..", "..")]  # tests/helpers, backend/

from networks import generate_stress_network
from walflow_paths import EXAMPLES_DIR
from simulation.schemas import ReactFlowGraph
from simulation.graph_parser import GraphParser
from simulation.solver import NetworkSolver, run_sequential_relief_simulation
from routers.simulation import extract_telemetry

STRESS_SIZES = (5, 15, 30, 50, 100)
SNAPSHOT_DIR = os.path.join(_HERE, "perf_snapshots")
SIM_DIR = os.path.normcase(os.path.abspath(os.path.join(_HERE, "..", "..", "simulation")))
STATS_KEYS = ("success", "error_kind", "controls_converged", "properties_converged", "max_residual", "outer_iterations",
              "total_inner_iterations", "property_iterations", "fallback_used", "saturated_controllers", "physical_validity")
ITER_KEYS = ("outer_iterations", "total_inner_iterations", "property_iterations")
SKIP_KEYS = ("id", "connected_to_port_id")      # random per parse, not a result
FLOORS = {"pressure": 1.0, "total_pressure": 1.0, "temperature": 1e-6, "flow_rate": 1e-12}
DEFAULT_FLOOR = 1e-12
REL_TOL_B = 1e-12


def suite():
    """Yield (label, run) for every shipped example case and stress size; run() returns (stats, telemetry)."""
    for path in sorted(glob.glob(os.path.join(EXAMPLES_DIR, "*.wlf"))):
        data = json.load(open(path, encoding="utf-8"))
        for case in data.get("cases") or [None]:
            label = f"{os.path.basename(path)} / {case['name'] if case else '-'}"
            yield label, lambda data=data, case=case: run_example(data, case)
    for n in STRESS_SIZES:
        yield f"stress {n}n", lambda n=n: run_stress(n)


def run_example(data, case):
    """Same path as /batch and the WebSocket (see regression/test_golden_examples.py::run_case)."""
    NetworkSolver._warm_start_cache.clear()
    with contextlib.redirect_stdout(io.StringIO()):
        network = GraphParser.parse_graph(ReactFlowGraph(**data), case_id=case["id"] if case else None)
        stats, telemetry, _, _, _ = run_sequential_relief_simulation(network, NetworkSolver(network), extract_telemetry)
    return stats, telemetry


def run_stress(n):
    NetworkSolver._warm_start_cache.clear()
    with contextlib.redirect_stdout(io.StringIO()):
        network = GraphParser.parse_graph(ReactFlowGraph(**generate_stress_network(n)))
        stats = NetworkSolver(network).solve()
        telemetry = extract_telemetry(network)
    return stats, telemetry


def cmd_profile(args):
    items = list(suite())
    profiler = cProfile.Profile()
    profiler.enable()
    for _, run in items:
        run()
    profiler.disable()
    stats = pstats.Stats(profiler)
    total = stats.total_tt
    rows = [(func, vals) for func, vals in stats.stats.items() if os.path.normcase(os.path.abspath(func[0])).startswith(SIM_DIR)]
    index = 2 if args.sort == "tottime" else 3
    rows.sort(key=lambda r: r[1][index], reverse=True)
    print(f"total profiled time {total:.3f} s over {len(items)} items; rows in backend/simulation sorted by {args.sort}")
    print(f"{'calls':>9} {'tottime s':>10} {'tot %':>6} {'cumtime s':>10} {'cum %':>6}  function")
    for (filename, line, name), (cc, nc, tt, ct, _) in rows[:args.top]:
        where = os.path.relpath(filename, SIM_DIR).replace("\\", "/")
        print(f"{nc:>9} {tt:>10.3f} {100 * tt / total:>5.1f}% {ct:>10.3f} {100 * ct / total:>5.1f}%  {where}:{line}({name})")


def cmd_time(args):
    print(f"{'item':58} {'best ms':>9} {'spread ms':>10} {'inner':>6} {'outer':>6} {'prop':>5}")
    total = 0.0
    for label, run in suite():
        times = []
        for _ in range(args.repeats):
            t0 = time.perf_counter()
            stats, _ = run()
            times.append((time.perf_counter() - t0) * 1000)
        total += min(times)
        print(f"{label:58} {min(times):>9.1f} {max(times) - min(times):>10.1f} {stats.get('total_inner_iterations', 0):>6} "
              f"{stats.get('outer_iterations', 0):>6} {stats.get('property_iterations', 0):>5}")
    print(f"{'total of bests':58} {total:>9.1f}")


def flatten(value, path, out):
    """Telemetry / stats to {path: leaf}; numpy scalars become Python numbers, random ids are skipped."""
    if hasattr(value, "item") and not isinstance(value, (list, dict)):
        value = value.item()
    if isinstance(value, dict):
        for key, sub in value.items():
            if key not in SKIP_KEYS:
                flatten(sub, f"{path}.{key}" if path else str(key), out)
    elif isinstance(value, (list, tuple)):
        for i, sub in enumerate(value):
            flatten(sub, f"{path}[{i}]", out)
    else:
        out[path] = value


def snapshot_item(stats, telemetry):
    flat = {}
    flatten({k: stats.get(k) for k in STATS_KEYS}, "stats", flat)
    flatten(telemetry.get("nodes", {}), "nodes", flat)
    flatten(telemetry.get("edges", {}), "edges", flat)
    return flat


def cmd_snapshot(args):
    result = {}
    for label, run in suite():
        stats, telemetry = run()
        result[label] = snapshot_item(stats, telemetry)
        print(f"{label:58} {len(result[label])} values")
    os.makedirs(SNAPSHOT_DIR, exist_ok=True)
    path = os.path.join(SNAPSHOT_DIR, f"{args.name}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=0, sort_keys=True)      # json writes floats with repr: full precision, round-trips
    print("wrote", path)


def is_number(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def same(a, b):
    return a == b or (isinstance(a, float) and isinstance(b, float) and math.isnan(a) and math.isnan(b))


def floor_of(path):
    return FLOORS.get(path.rsplit(".", 1)[-1], DEFAULT_FLOOR)


def cmd_compare(args):
    snaps = []
    for name in (args.before, args.after):
        with open(os.path.join(SNAPSHOT_DIR, f"{name}.json"), encoding="utf-8") as f:
            snaps.append(json.load(f))
    before, after = snaps
    structure, identical, differing, rel, iter_notes, resid_up = [], 0, 0, [], [], []
    for item in sorted(set(before) | set(after)):
        if item not in before or item not in after:
            structure.append(f"{item}: only in {'after' if item in after else 'before'}")
            continue
        a, b = before[item], after[item]
        for path in sorted(set(a) | set(b)):
            if path not in a or path not in b:
                structure.append(f"{item}: {path} only in {'after' if path in b else 'before'}")
            elif path.startswith("stats.") and path.rsplit(".", 1)[-1] in ITER_KEYS + ("max_residual",):
                continue        # reported per item below
            elif is_number(a[path]) and is_number(b[path]):
                if same(float(a[path]), float(b[path])):
                    identical += 1
                else:
                    differing += 1
                    d = abs(a[path] - b[path]) / max(abs(a[path]), abs(b[path]), floor_of(path))
                    rel.append((d, item, path, a[path], b[path]))
            elif not same(a[path], b[path]):
                structure.append(f"{item}: {path} {a[path]!r} -> {b[path]!r}")
        iters = {k: (a.get(f"stats.{k}"), b.get(f"stats.{k}")) for k in ITER_KEYS}
        r0, r1 = a.get("stats.max_residual"), b.get("stats.max_residual")
        changed = any(x != y for x, y in iters.values()) or r0 != r1
        if changed:
            rose = any(is_number(y) and is_number(x) and y > x for x, y in iters.values())
            flag = []
            if rose:
                flag.append("ITERATIONS ROSE")
            if is_number(r0) and is_number(r1) and r1 > r0:
                flag.append("RESIDUAL ROSE")
                resid_up.append(item)
            iter_notes.append((item, iters, r0, r1, flag))
    iters_equal = all(x == y for _, iters, _, _, _ in iter_notes for x, y in iters.values())
    resid_same = all(r0 == r1 for _, _, r0, r1, _ in iter_notes)
    max_rel = max((r[0] for r in rel), default=0.0)

    print(f"STRUCTURE CHANGED: {len(structure)}" if structure else "structure unchanged")
    for line in structure[:25]:
        print("  ", line)
    print(f"numeric values: {identical} bit-identical, {differing} differing")
    rel.sort(reverse=True)
    for d, item, path, x, y in rel[:10]:
        print(f"  rel {d:.3e}  {item} / {path}: {x!r} -> {y!r}")
    print(f"max relative difference: {max_rel:.3e}")
    print(f"items with changed iterations or max_residual: {len(iter_notes)}")
    for item, iters, r0, r1, flag in iter_notes:
        counts = ", ".join(f"{k.split('_')[0] if k != 'total_inner_iterations' else 'inner'} {x}->{y}" for k, (x, y) in iters.items())
        print(f"  {item}: {counts}; max_residual {r0!r} -> {r1!r} {' '.join(flag)}")

    if structure:
        verdict = f"FAIL: structure changed ({len(structure)} differences)"
    elif differing == 0 and iters_equal and resid_same:
        verdict = "CLASS A: bit-identical"
    elif max_rel <= REL_TOL_B and iters_equal:
        verdict = f"CLASS B: max rel diff {max_rel:.3e} <= 1e-12"
    elif not resid_up:
        rose = [i for i, _, _, _, f in iter_notes if "ITERATIONS ROSE" in f]
        verdict = f"CLASS C candidate: max rel diff {max_rel:.3e}, {len(iter_notes)} items changed iterations or residual" \
                  + (f", iterations rose in {rose}" if rose else "")
    else:
        verdict = f"FAIL: max_residual rose in {resid_up}"
    print(verdict)
    return 1 if verdict.startswith("FAIL") else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("profile")
    p.add_argument("--top", type=int, default=30)
    p.add_argument("--sort", choices=("cumulative", "tottime"), default="tottime")
    p = sub.add_parser("time")
    p.add_argument("--repeats", type=int, default=3)
    sub.add_parser("snapshot").add_argument("name")
    p = sub.add_parser("compare")
    p.add_argument("before")
    p.add_argument("after")
    args = parser.parse_args()
    sys.exit({"profile": cmd_profile, "time": cmd_time, "snapshot": cmd_snapshot, "compare": cmd_compare}[args.cmd](args) or 0)


if __name__ == "__main__":
    main()
