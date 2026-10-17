"""F1-20: docs/node-fields.md lists exactly the node data fields the parser reads, with their units."""
from walflow_paths import REPO_ROOT
import pytest

pytestmark = pytest.mark.audit("F1-20")

import os
import re

ROOT = REPO_ROOT


def parser_fields():
    with open(os.path.join(ROOT, "backend", "simulation", "graph_parser.py"), encoding="utf-8") as f:
        src = f.read()
    patterns = [
        r"\bd\.get\('(\w+)'", r"\bd\['(\w+)'\]", r"'(\w+)' in d\b",
        r"_npsh_value\(d, '(\w+)'", r"_relief_pressure_barg\(d, '(\w+)'",
    ]
    return {m for p in patterns for m in re.findall(p, src)}


def documented_fields():
    with open(os.path.join(ROOT, "docs", "node-fields.md"), encoding="utf-8") as f:
        rows = [line for line in f.read().splitlines() if line.startswith("| ") and not line.startswith("| Type") and not line.startswith("|---")]
    fields = set()
    for row in rows:
        cells = [c.strip() for c in row.strip("|").split("|")]
        fields.update(re.findall(r"`(\w+)`", cells[1]))
    return fields


def test_every_parsed_field_is_documented_and_vice_versa():
    parsed, documented = parser_fields(), documented_fields()
    assert parsed - documented == set(), f"undocumented fields: {sorted(parsed - documented)}"
    assert documented - parsed == set(), f"documented but not read: {sorted(documented - parsed)}"


def test_unit_suffix_fields_state_their_unit_in_the_table():
    with open(os.path.join(ROOT, "docs", "node-fields.md"), encoding="utf-8") as f:
        text = f.read()
    for field, unit in {"set_pressure_barg": "barg", "source_pressure_bara": "bar(a)", "temp_base_c": "°C",
                        "flow_rated_lmin": "L/min", "head_rated_m": "m"}.items():
        row = next(line for line in text.splitlines() if f"`{field}`" in line)
        assert unit in row, f"{field}: unit {unit} missing in its row"
