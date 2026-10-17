"""The run_simulation websocket payload must be JSON serializable (numpy.bool_ in pump warnings broke Multi_PSV)."""
from walflow_paths import EXAMPLES_DIR

import contextlib
import glob
import io
import json
import os

import numpy as np
import pytest

from simulation.schemas import ReactFlowGraph
from simulation.graph_parser import GraphParser
from simulation.solver import NetworkSolver, run_sequential_relief_simulation
from routers.simulation import calculate_case_kpis, extract_telemetry, numpy_json_default

EXAMPLES_DIR = EXAMPLES_DIR
EXAMPLES = sorted(os.path.splitext(os.path.basename(p))[0] for p in glob.glob(os.path.join(EXAMPLES_DIR, "*.wlf")))


@pytest.mark.parametrize("example", EXAMPLES)
def test_example_payload_serializes_without_fallback(example):
    # Same path as main.py run_simulation, but strict json.dumps so numpy values leaking out of the model fail here
    data = json.load(open(os.path.join(EXAMPLES_DIR, f"{example}.wlf"), encoding="utf-8"))
    with contextlib.redirect_stdout(io.StringIO()):
        network = GraphParser.parse_graph(ReactFlowGraph(**data))
        stats, tel, tel_unmitigated, has_psv, tel_peak = run_sequential_relief_simulation(
            network, NetworkSolver(network), extract_telemetry)
    assert not stats.get("error_kind"), stats.get("error")
    kpis = calculate_case_kpis(network, tel, stats)
    json.dumps({"status": "success", "stats": stats, "telemetry": tel, "telemetry_unmitigated": tel_unmitigated,
                "telemetry_peak": tel_peak, "has_psv": has_psv, "kpis": kpis})


def test_numpy_json_default_converts_numpy_values():
    payload = {"flag": np.bool_(True), "p": np.float32(1.5), "n": np.int64(3), "arr": np.array([1, 2])}
    assert json.loads(json.dumps(payload, default=numpy_json_default)) == {"flag": True, "p": 1.5, "n": 3, "arr": [1, 2]}
    with pytest.raises(TypeError):
        json.dumps({"x": object()}, default=numpy_json_default)
