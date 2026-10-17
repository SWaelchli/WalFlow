"""F2-04: a heat exchanger without an explicit rated ΔP uses the 0.5 bar default the inspector shows."""
import pytest

pytestmark = pytest.mark.audit("F2-04")

from simulation.graph_parser import GraphParser
from simulation.schemas import ReactFlowGraph


def _hx(data):
    graph = ReactFlowGraph(nodes=[{"id": "hx", "type": "heat_exchanger", "position": {"x": 0, "y": 0}, "data": data}], edges=[])
    return GraphParser.parse_graph(graph).nodes["hx"]


def test_f2_04_missing_rated_dp_is_half_a_bar_at_rated_flow():
    hx = _hx({"rated_flow_lmin": 500.0})
    assert hx.rated_dp_bar == 0.5
    q_rated = 500.0 / 60000.0
    assert abs(hx.pressure_drop_factor * q_rated ** 2 - 0.5e5) < 1.0  # Pa at rated flow


def test_f2_04_explicit_rated_dp_is_kept():
    assert _hx({"rated_dp_bar": 1.2}).rated_dp_bar == 1.2
