import pytest

from simulation.equipment.check_valve import CheckValve
from simulation.schemas import ReactFlowNode
from simulation.graph_parser import GraphParser

K_CV_SI = 1.732e9  # Pa.m3/s units of the Cv equation: dp = K * rho * Q|Q| / Cv^2
RHO = 998.2


def test_graph_parser_check_valve():
    node_data = ReactFlowNode(
        id="cv_node_1",
        type="check_valve",
        position={"x": 0.0, "y": 0.0},
        data={"label": "Check Valve 1", "cv": 15.0, "cracking_pressure_bar": 0.1},
    )
    parsed_node = GraphParser.create_node(node_data)
    assert isinstance(parsed_node, CheckValve)
    assert parsed_node.cv == 15.0
    assert parsed_node.cracking_pressure_bar == 0.1


@pytest.mark.parametrize("cv, crack_bar, q, expected_dp", [
    pytest.param(10.0, 0.05, 1e-3, 0.05e5 + K_CV_SI * RHO * 1e-6 / 10.0**2,
                 id="forward_60_lpm_is_cracking_plus_seat_friction"),
    pytest.param(10.0, 0.05, -1e-3, -(0.05e5 + K_CV_SI * RHO * 1e-6 / 1e-4**2),
                 id="reverse_60_lpm_is_negative_through_closed_leak_cv"),
    pytest.param(10.0, 0.05, 0.0, 0.0, id="no_flow_no_drop"),
])
def test_smoothed_curve_without_pressures(cv, crack_bar, q, expected_dp):
    dp = CheckValve("CV", cv=cv, cracking_pressure_bar=crack_bar).calculate_delta_p(q, RHO)
    assert dp == pytest.approx(expected_dp, rel=0.02, abs=1.0)
