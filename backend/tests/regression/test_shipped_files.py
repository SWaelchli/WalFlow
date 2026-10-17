"""F0-02 / F2-22 / F2-04: shipped diagrams are format 0.2, carry no stored results and give heat exchangers an explicit rated dP."""
from walflow_paths import DATA_DIR
import pytest

pytestmark = pytest.mark.audit("F0-02", "F2-22", "F2-04")

import glob
import json
import os

import pytest

DATA_DIR = DATA_DIR
FILES = sorted(glob.glob(os.path.join(DATA_DIR, "examples", "*.wlf"))) + [os.path.join(DATA_DIR, "GreetingCanvas.wlf")]
RESULT_KEYS = {"telemetry", "telemetry_unmitigated", "telemetry_peak", "kpis", "stats", "result_hash", "_scalingInfo"}


@pytest.mark.parametrize("path", FILES, ids=[os.path.basename(p) for p in FILES])
def test_shipped_file_is_current_format_without_results(path):
    data = json.load(open(path, encoding="utf-8"))
    assert data["version"] == "0.2"
    assert data["app_version"] == "0.2.0"
    for node in data["nodes"]:
        assert "telemetry" not in node["data"]
        if node["type"] == "heat_exchanger":
            assert node["data"].get("rated_dp_bar", 0) > 0
            assert "k_factor" not in node["data"]
    for edge in data["edges"]:
        assert "telemetry" not in (edge.get("data") or {})
    for case in data.get("cases", []):
        assert not (RESULT_KEYS & set(case))
