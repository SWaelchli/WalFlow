"""F2-23: catalogue data against ASME B36.19M / B36.10M and between backend seed and bundled copy."""
import re
from pathlib import Path

from services.fitting_defaults import DIN_EN_10253_2_REDUCERS_DATA
from services.pipe_class_defaults import EXAMPLE_PIPE_CLASSES

FRONTEND = Path(__file__).resolve().parents[2] / "frontend" / "src"


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
