"""F2-23: catalogue data against ASME B36.19M / B36.10M and between backend seed and bundled copy."""
from walflow_paths import FRONTEND_SRC
import pytest

pytestmark = pytest.mark.audit("F2-23")

import re
from pathlib import Path

from services.fitting_defaults import DIN_EN_10253_2_REDUCERS_DATA
from services.pipe_class_defaults import EXAMPLE_PIPE_CLASSES

FRONTEND = Path(FRONTEND_SRC)


def _rows(sch):
    for cls in EXAMPLE_PIPE_CLASSES:
        for row in cls.get("sizes", []) or []:
            if row.get("sch") == sch:
                yield cls.get("code"), row


def test_f2_23_10s_walls_dn15_dn20_are_2_11_mm():
    found = [(c, r) for c, r in _rows("10S") if r["dn"] in (15, 20)]
    assert found, "seed classes with 10S DN15/DN20 expected"
    for _, r in found:
        assert r["wt_mm"] == 2.11
        assert abs(r["id_mm"] - (r["od_mm"] - 2 * 2.11)) < 0.01


def test_f2_23_bundled_standards_dn400_sch20_sch30():
    text = (FRONTEND / "utils" / "standards_library.js").read_text(encoding="utf-8")
    line = next(l for l in text.splitlines() if "dn: 400" in l)
    assert '"20": 7.92' in line and '"30": 9.53' in line


def test_f2_23_bundled_din_reducers_match_backend_seed():
    text = (FRONTEND / "constants" / "asme_b16_9_data.js").read_text(encoding="utf-8")
    block = text[text.index("export const DIN_EN_10253_2_REDUCERS"):]
    pairs = re.findall(r"dn_large: (\d+),.*?dn_small: (\d+),", block.split("];")[0])
    assert len(pairs) == len(DIN_EN_10253_2_REDUCERS_DATA) == 37
    assert {(int(a), int(b)) for a, b in pairs} == {(r["dn_large"], r["dn_small"]) for r in DIN_EN_10253_2_REDUCERS_DATA}


def test_din_schedules_share_reducer_outside_diameters():
    """DIN EN reducers and DIN EN pipe dimensions use the same EN 10220 outside diameters."""
    from services.fitting_defaults import DIN_EN_PIPE_SCHEDULES_DATA
    od_by_dn = {row["dn"]: row["od_mm"] for row in DIN_EN_PIPE_SCHEDULES_DATA}
    for r in DIN_EN_10253_2_REDUCERS_DATA:
        assert od_by_dn[r["dn_large"]] == r["od_large_mm"]
        assert od_by_dn[r["dn_small"]] == r["od_small_mm"]


def test_din_schedule_walls_and_bores():
    from services.fitting_defaults import DIN_EN_PIPE_SCHEDULES_DATA
    for row in DIN_EN_PIPE_SCHEDULES_DATA:
        s = row["schedules"]
        assert s["ISO 1127"]["wt_mm"] < s["Normal"]["wt_mm"] < s["Heavy"]["wt_mm"]
        for entry in s.values():
            assert abs(entry["id_mm"] - (row["od_mm"] - 2 * entry["wt_mm"])) < 0.006


def test_bundled_din_schedules_match_backend_seed():
    from services.fitting_defaults import DIN_EN_PIPE_SCHEDULES_DATA
    text = (FRONTEND / "constants" / "din_en_pipe_data.js").read_text(encoding="utf-8")
    block = text[text.index("export const DIN_EN_PIPE_SCHEDULES"):].split("];")[0]
    rows = re.findall(r"dn: (\d+),.*?od_mm: ([\d.]+),.*?Normal: \{ wt_mm: ([\d.]+),.*?Heavy: \{ wt_mm: ([\d.]+),.*?'ISO 1127': \{ wt_mm: ([\d.]+),", block)
    bundled = {(int(dn), float(od), float(n), float(h), float(i)) for dn, od, n, h, i in rows}
    seed = {(r["dn"], r["od_mm"], r["schedules"]["Normal"]["wt_mm"], r["schedules"]["Heavy"]["wt_mm"],
             r["schedules"]["ISO 1127"]["wt_mm"]) for r in DIN_EN_PIPE_SCHEDULES_DATA}
    assert len(rows) == len(DIN_EN_PIPE_SCHEDULES_DATA)
    assert bundled == seed
