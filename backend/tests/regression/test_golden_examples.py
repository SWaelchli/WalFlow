"""Golden results (audit close-out 5.3): every case of every shipped example solves through the same
path as /batch and the WebSocket (parse per case, relief passes, KPIs) and matches the stored results.

The stored values are the reviewed state after audit batches B0 to B6. A deliberate model change
updates them: run with WALFLOW_UPDATE_GOLDEN=1, then review the diff of golden_examples.json
(and list the changed results in the commit or CHANGELOG)."""
from walflow_paths import EXAMPLES_DIR, GOLDEN_FILE

import contextlib
import glob
import io
import json
import os

import pytest

from routers.simulation import calculate_case_kpis, extract_telemetry
from simulation.graph_parser import GraphParser
from simulation.schemas import ReactFlowGraph
from simulation.solver import NetworkSolver, run_sequential_relief_simulation

HERE = os.path.dirname(os.path.abspath(__file__))
EXAMPLES = EXAMPLES_DIR
FILES = sorted(glob.glob(os.path.join(EXAMPLES, "*.wlf")))
GOLDEN = GOLDEN_FILE
UPDATE = os.environ.get("WALFLOW_UPDATE_GOLDEN") == "1"

# Tolerances: well above run-to-run noise (the solve is deterministic, F1-14), well below any
# change worth noticing. The TCV loop stops within 0.1 K of its setpoint (ROADMAP), hence 0.15 K.
FLOW_ABS_LMIN, FLOW_REL = 0.05, 0.005
P_ABS_BAR, P_REL = 0.005, 0.002
T_ABS_K = 0.15
OPENING_ABS_PCT = 0.5
# Pressure in a branch without flow is not defined by the equations (ROADMAP "Undefined Pressure
# in Stagnant Branches"), so it is only compared where the port carries flow.
STAGNANT_LMIN = 0.01
KPI_KEYS = ("max_pressure_bar", "min_pressure_bar", "total_flow_lmin", "total_pump_power_kw",
            "has_cavitation_warning", "relieved_pressure_bara", "peak_pressure_bara",
            "unmitigated_peak_pressure_bara")


def _ports(item):
    return [[round(p["pressure"] / 1e5, 5), round(p["temperature"] - 273.15, 3), round(p["flow_rate"] * 60000.0, 4)]
            for p in item["inlets"] + item["outlets"]]


def run_case(data, case):
    graph = ReactFlowGraph(**data)
    with contextlib.redirect_stdout(io.StringIO()):
        network = GraphParser.parse_graph(graph, case_id=case["id"] if case else None)
        stats, telemetry, _, _, _ = run_sequential_relief_simulation(network, NetworkSolver(network), extract_telemetry)
        kpis = calculate_case_kpis(network, telemetry, stats) if not stats.get("error_kind") else {}
    nodes = {}
    for node_id, tel in telemetry.get("nodes", {}).items():
        entry = {"ports": _ports(tel)}
        for key in ("status", "opening_pct"):
            if tel.get(key) is not None:
                entry[key] = round(tel[key], 3) if key == "opening_pct" else tel[key]
        nodes[node_id] = entry
    return {
        "success": bool(stats.get("success")),
        "error_kind": stats.get("error_kind"),
        "controls_converged": stats.get("controls_converged"),
        "kpis": {k: kpis[k] for k in KPI_KEYS if k in kpis},
        "nodes": nodes,
        "edges": {edge_id: _ports(tel) for edge_id, tel in telemetry.get("edges", {}).items()},
    }


def run_file(path):
    data = json.load(open(path, encoding="utf-8"))
    cases = data.get("cases") or [None]
    return {(case["name"] if case else "-"): run_case(data, case) for case in cases}


def _close(a, b, abs_tol, rel_tol=0.0):
    return abs(a - b) <= abs_tol + rel_tol * max(abs(a), abs(b))


def _compare_ports(where, got, want, problems):
    if len(got) != len(want):
        problems.append(f"{where}: {len(got)} ports, expected {len(want)}")
        return
    for i, ((p, t, q), (p0, t0, q0)) in enumerate(zip(got, want)):
        if not _close(q, q0, FLOW_ABS_LMIN, FLOW_REL):
            problems.append(f"{where} port {i}: flow {q:.3f} L/min, expected {q0:.3f}")
        if abs(q0) > STAGNANT_LMIN and not _close(p, p0, P_ABS_BAR, P_REL):
            problems.append(f"{where} port {i}: pressure {p:.4f} bar(a), expected {p0:.4f}")
        if abs(q0) > STAGNANT_LMIN and not _close(t, t0, T_ABS_K):
            problems.append(f"{where} port {i}: temperature {t:.2f} C, expected {t0:.2f}")


def compare_case(where, got, want):
    problems = []
    for key in ("success", "error_kind", "controls_converged"):
        if got[key] != want[key]:
            problems.append(f"{where}: {key} {got[key]!r}, expected {want[key]!r}")
    for key, value in want["kpis"].items():
        new = got["kpis"].get(key)
        if isinstance(value, bool) or value is None or new is None:
            ok = new == value
        else:
            ok = _close(new, value, 0.011, P_REL)  # KPIs are rounded to 0.01
        if not ok:
            problems.append(f"{where}: KPI {key} {new!r}, expected {value!r}")
    if set(got["nodes"]) != set(want["nodes"]) or set(got["edges"]) != set(want["edges"]):
        problems.append(f"{where}: component or pipe ids differ from the stored results")
        return problems
    for node_id, node in want["nodes"].items():
        new = got["nodes"][node_id]
        if new.get("status") != node.get("status"):
            problems.append(f"{where} / {node_id}: status {new.get('status')!r}, expected {node.get('status')!r}")
        if "opening_pct" in node and not _close(new.get("opening_pct", -1e9), node["opening_pct"], OPENING_ABS_PCT):
            problems.append(f"{where} / {node_id}: opening {new.get('opening_pct')}, expected {node['opening_pct']}")
        _compare_ports(f"{where} / {node_id}", new["ports"], node["ports"], problems)
    for edge_id, ports in want["edges"].items():
        _compare_ports(f"{where} / pipe {edge_id}", got["edges"][edge_id], ports, problems)
    return problems


def _load_golden():
    if not os.path.exists(GOLDEN):
        return {}
    return json.load(open(GOLDEN, encoding="utf-8"))


@pytest.mark.parametrize("path", FILES, ids=[os.path.basename(p) for p in FILES])
def test_shipped_example_matches_golden_results(path):
    name = os.path.basename(path)
    results = run_file(path)
    for case_name, result in results.items():
        assert result["success"], f"{name} / {case_name} does not solve: {result['error_kind']}"

    if UPDATE:
        golden = _load_golden()
        golden[name] = results
        with open(GOLDEN, "w", encoding="utf-8", newline="\n") as f:
            json.dump(dict(sorted(golden.items())), f, indent=1, sort_keys=True)
            f.write("\n")
        return

    stored = _load_golden().get(name)
    assert stored is not None, f"No stored results for {name}: run with WALFLOW_UPDATE_GOLDEN=1 and review"
    assert set(results) == set(stored), f"{name}: cases {sorted(results)} differ from stored {sorted(stored)}"
    problems = []
    for case_name, want in stored.items():
        problems += compare_case(f"{name} / {case_name}", results[case_name], want)
    assert not problems, f"{len(problems)} results changed:\n" + "\n".join(problems[:25])


def test_every_stored_example_still_ships():
    if UPDATE:
        pytest.skip("updating")
    missing = set(_load_golden()) - {os.path.basename(p) for p in FILES}
    assert not missing, f"Stored results for removed examples: {sorted(missing)}"
