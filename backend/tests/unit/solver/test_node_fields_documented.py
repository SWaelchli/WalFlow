"""F1-20: the "Data Fields" sections of backend/simulation/equipment/*.md list exactly the node and pipe data
fields the parser reads, and every dimensional field carries its unit in the name."""
from walflow_paths import REPO_ROOT
import pytest

pytestmark = pytest.mark.audit("F1-20")

import glob
import os
import re

PARSER = os.path.join(REPO_ROOT, "backend", "simulation", "graph_parser.py")
EQUIPMENT_DIR = os.path.join(REPO_ROOT, "backend", "simulation", "equipment")

# Units of fields that are not dimensional (no suffix needed)
UNITLESS = ("text", "bool", "Cv", "DN", "index", "catalogue id")
# Unit in the table -> suffixes a field with that unit may end with
SUFFIX_FOR_UNIT = {
    "Pa": ("_pa",), "bar": ("_bar",), "barg": ("_barg",), "bar(a)": ("_bara",), "L/min": ("_lmin",),
    "°C": ("_c",), "K": ("_k",), "m": ("_m",), "mm": ("_mm",), "kW": ("_kw",), "W/K": ("_w_k",),
    "%": ("_pct",), "deg": ("_deg",), "mPa·s": ("_mpas",),
}


def _source():
    with open(PARSER, encoding="utf-8") as f:
        return f.read()


def parser_node_fields():
    patterns = [
        r"\bd\.get\('(\w+)'", r"\bd\['(\w+)'\]", r"'(\w+)' in d\b",
        r"_npsh_value\(d, '(\w+)'", r"_relief_pressure_barg\(d, '(\w+)'",
    ]
    src = _source()
    return {m for p in patterns for m in re.findall(p, src)}


def parser_edge_fields():
    src = _source()
    return {m for p in (r"\bedge_data\.get\('(\w+)'", r"\bedge_data\['(\w+)'\]") for m in re.findall(p, src)}


def parser_node_types():
    """Node types with their own branch in GraphParser._build_node."""
    return set(re.findall(r"\bt == '(\w+)'", _source()))


def data_field_sections():
    """{doc name: (header line, [(field, unit), ...])} of every '## Data Fields' section."""
    sections = {}
    for path in sorted(glob.glob(os.path.join(EQUIPMENT_DIR, "*.md"))):
        with open(path, encoding="utf-8") as f:
            text = f.read()
        m = re.search(r"^## Data Fields\s*$(.*?)(?=^## |\Z)", text, re.M | re.S)
        if not m:
            continue
        body = m.group(1)
        header = next((line for line in body.splitlines() if line.startswith(("Node type:", "Pipe (edge) data"))), "")
        rows = []
        for line in body.splitlines():
            if not line.startswith("| `"):
                continue
            cells = [c.strip() for c in line.strip("|").split("|")]
            rows += [(field, cells[1]) for field in re.findall(r"`(\w+)`", cells[0])]
        sections[os.path.basename(path)] = (header, rows)
    return sections


def _documented(kind):
    is_edge = kind == "edge"
    return {field for header, rows in data_field_sections().values()
            if header.startswith("Pipe (edge) data") == is_edge for field, _ in rows}


def test_every_parsed_node_field_is_documented_and_vice_versa():
    parsed, documented = parser_node_fields(), _documented("node")
    assert parsed - documented == set(), f"undocumented node fields: {sorted(parsed - documented)}"
    assert documented - parsed == set(), f"documented but not read: {sorted(documented - parsed)}"


def test_every_parsed_pipe_field_is_documented_and_vice_versa():
    parsed, documented = parser_edge_fields(), _documented("edge")
    assert parsed == documented, f"parser {sorted(parsed)} vs pipe.md {sorted(documented)}"


def test_every_node_type_has_a_data_fields_section():
    headers = " ".join(header for header, _ in data_field_sections().values())
    missing = sorted(t for t in parser_node_types() if f"`{t}`" not in headers)
    assert missing == [], f"node types without a Data Fields section: {missing}"


def test_dimensional_fields_carry_their_unit_in_the_name():
    for doc, (_, rows) in data_field_sections().items():
        for field, unit in rows:
            if unit.startswith(UNITLESS):
                continue
            key = unit.split(" ")[0].strip("*")
            assert key in SUFFIX_FOR_UNIT, f"{doc}: unknown unit '{unit}' of {field}"
            assert field.endswith(SUFFIX_FOR_UNIT[key]), f"{doc}: {field} ({unit}) must end with {SUFFIX_FOR_UNIT[key]}"
