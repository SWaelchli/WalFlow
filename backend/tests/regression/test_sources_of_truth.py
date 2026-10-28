"""`global_roughness` is gone (pipes use the pipe class or their own roughness); older files that still
contain it load unchanged; the frontend fluid list is the backend catalogue."""
from walflow_paths import REPO_ROOT
from networks import neutral_graph
import pytest


import glob
import os
import re

from simulation.fluid_utils import FluidProperties
from simulation.schemas import GlobalSettings, ReactFlowGraph
from simulation.graph_parser import GraphParser

ROOT = REPO_ROOT


def test_global_settings_have_no_roughness_field():
    assert "global_roughness" not in GlobalSettings.model_fields
    assert not hasattr(GlobalSettings(), "global_roughness")


def test_old_file_with_global_roughness_still_parses():
    graph = neutral_graph(nodes=[], edges=[], globalSettings={"fluid_type": "water", "global_roughness": 0.000045,
                                                               "globalRoughness": 0.1})
    network = GraphParser.parse_graph(graph)
    assert network.global_settings.fluid_type == "water"


def test_pipe_roughness_comes_from_the_edge_data():
    # roughness_mm (mm) is read from the pipe; without it the default 0.045 mm applies
    for data, expected in (({"roughness_mm": 0.2}, 0.0002), ({}, 0.000045)):
        graph = neutral_graph(
            nodes=[{"id": "a", "type": "tank", "position": {"x": 0, "y": 0}, "data": {}},
                   {"id": "b", "type": "tank", "position": {"x": 0, "y": 0}, "data": {}}],
            edges=[{"id": "e", "source": "a", "target": "b", "data": data}])
        pipe = GraphParser.parse_graph(graph).edges[0]["pipe"]
        assert pipe.roughness == pytest.approx(expected)


def test_shipped_files_do_not_carry_global_roughness():
    for path in glob.glob(os.path.join(ROOT, "frontend", "src", "data", "**", "*.wlf"), recursive=True):
        with open(path, encoding="utf-8") as f:
            assert "global_roughness" not in f.read(), path


def test_frontend_fluid_list_equals_backend_catalogue():
    with open(os.path.join(ROOT, "frontend", "src", "constants", "fluid_library.js"), encoding="utf-8") as f:
        text = f.read()
    frontend_ids = set(re.findall(r"""\bid:\s*['"]([a-z0-9_]+)['"]""", text))
    assert frontend_ids == set(FluidProperties.FLUIDS.keys())
