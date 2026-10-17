"""Code-review fixes: HX sign, relief state restore, parser input errors."""
import pytest

from simulation.equipment.heat_exchanger import HeatExchanger
from simulation.graph_parser import GraphParser, ModelInputError
from simulation.schemas import ReactFlowGraph
from simulation.solver import run_sequential_relief_simulation


def test_heat_exchanger_dp_is_odd_in_flow():
    hx = HeatExchanger("HX", rated_cooling_kw=30.0, rated_flow_lmin=100.0, design_inlet_temp_c=50.0, medium_temp_c=10.0)
    fwd = hx.calculate_delta_p(0.005, 998.0, 1e-3)
    rev = hx.calculate_delta_p(-0.005, 998.0, 1e-3)
    assert fwd > 0.0 and rev == pytest.approx(-fwd)
    assert hx.calculate_dp_derivative(-0.005, 998.0, 1e-3) > 0.0


def _graph(node_type, node_data=None, edge_data=None):
    return ReactFlowGraph(**{
        "nodes": [
            {"id": "t1", "type": "tank", "position": {"x": 0, "y": 0}, "data": {"label": "T1", "level": 1.0}},
            {"id": "n1", "type": node_type, "position": {"x": 1, "y": 0}, "data": {"label": "N1", **(node_data or {})}},
            {"id": "t2", "type": "tank", "position": {"x": 2, "y": 0}, "data": {"label": "T2", "level": 1.0}},
        ],
        "edges": [
            {"id": "e1", "source": "t1", "target": "n1", "sourceHandle": "outlet-0", "targetHandle": "inlet-0",
             "data": {"length": 1.0, "diameter": 0.05, **(edge_data or {})}},
            {"id": "e2", "source": "n1", "target": "t2", "sourceHandle": "outlet-0", "targetHandle": "inlet-0",
             "data": {"length": 1.0, "diameter": 0.05}},
        ],
    })


def test_empty_numeric_field_is_a_model_input_error():
    with pytest.raises(ModelInputError, match="N1"):
        GraphParser.parse_graph(_graph("heat_exchanger", {"rated_cooling_kw": ""}))


def test_zero_rated_flow_is_a_model_input_error():
    with pytest.raises(ModelInputError, match="rated flow"):
        GraphParser.parse_graph(_graph("heat_exchanger", {"rated_flow_lmin": 0}))


@pytest.mark.parametrize("edge_data,match", [({"diameter": 0}, "diameter"), ({"diameter": ""}, "Pipe"), ({"length": -1}, "negative")])
def test_bad_pipe_input_is_a_model_input_error(edge_data, match):
    with pytest.raises(ModelInputError, match=match):
        GraphParser.parse_graph(_graph("heat_exchanger", None, edge_data))


def test_relief_state_is_restored_when_a_solve_raises():
    network = GraphParser.parse_graph(_graph("pressure_safety_valve", {"set_pressure_barg": 5.0}))
    psv = network.nodes["n1"]
    assert psv.forced_state == "auto"

    class Boom:
        def solve(self):
            raise RuntimeError("solver blew up")

    with pytest.raises(RuntimeError):
        run_sequential_relief_simulation(network, Boom(), lambda n: {})
    assert psv.forced_state == "auto"
