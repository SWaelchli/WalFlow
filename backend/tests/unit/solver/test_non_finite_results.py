"""NaN/Infinity in results must not make the reply invalid JSON; the fields are reported instead."""


import json

import numpy as np

from routers.simulation import sanitize_non_finite, sanitize_result


def test_non_finite_become_null_and_are_listed():
    tel = {"HX-1": {"temperature_out": float("nan"), "p": 1.5, "arr": [1.0, float("inf")]}, "np": np.float64("nan")}
    clean, found = sanitize_non_finite(tel, "telemetry")
    assert clean["HX-1"]["temperature_out"] is None
    assert clean["HX-1"]["arr"] == [1.0, None]
    assert clean["np"] is None
    assert clean["HX-1"]["p"] == 1.5
    assert set(found) == {"telemetry.HX-1.temperature_out", "telemetry.HX-1.arr[1]", "telemetry.np"}
    json.dumps(clean, allow_nan=False)


def test_stats_report_the_fields():
    stats, clean = sanitize_result({"success": True}, telemetry={"a": {"x": float("nan")}}, kpis={"k": 2.0})
    assert stats["non_finite_count"] == 1 and stats["non_finite_fields"] == ["telemetry.a.x"]
    assert clean["kpis"] == {"k": 2.0}


def test_finite_result_is_unchanged():
    stats, clean = sanitize_result({"success": True}, telemetry={"a": {"x": 1.0}})
    assert "non_finite_fields" not in stats and clean["telemetry"] == {"a": {"x": 1.0}}
