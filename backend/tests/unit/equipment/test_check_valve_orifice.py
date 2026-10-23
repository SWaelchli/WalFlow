import math
import pytest

from simulation.equipment.check_valve_orifice import CheckValveOrifice
from simulation.schemas import ReactFlowNode
from simulation.graph_parser import GraphParser


def test_graph_parser_check_valve_orifice():
    node_data = ReactFlowNode(
        id="cvo_node_1",
        type="check_valve_orifice",
        position={"x": 0.0, "y": 0.0},
        data={
            "label": "Check Valve w/ Orifice 1",
            "cv": 12.0,
            "cracking_pressure_bar": 0.08,
            "pipe_diameter_m": 0.1,
            "orifice_diameter_m": 0.015
        }
    )
    parsed_node = GraphParser.create_node(node_data)
    assert isinstance(parsed_node, CheckValveOrifice)
    assert parsed_node.cv == 12.0
    assert parsed_node.cracking_pressure_bar == 0.08
    assert parsed_node.orifice_diameter == 0.015
    print("GraphParser created CheckValveOrifice instance successfully!")

def _reference_flow(cvo, dp, rho, mu):
    """Flow at valve drop dp: orifice flow plus, above cracking, the plain check valve seat flow (Cv with F_R)."""
    from scipy.optimize import brentq
    from simulation.equipment.check_valve import CheckValve, open_seat_dp
    q_ori = brentq(lambda q: cvo._calculate_orifice_dp(q, rho, mu) - dp, -1.0, 1.0, xtol=1e-15, rtol=1e-14)
    excess = dp - cvo.cracking_pressure_bar * 1e5
    if excess <= 0:
        return q_ori
    seat = CheckValve("seat", cv=cvo.cv)
    q_seat = brentq(lambda q: open_seat_dp(seat.cv, q, rho, mu) - excess, 0.0, 1.0,
                    xtol=1e-15, rtol=1e-14)
    return q_ori + q_seat


WATER = (998.2, 1.0e-3)
OIL = (870.0, 0.04)   # ISO VG 46 near 40 °C


@pytest.mark.audit("D-09")
@pytest.mark.parametrize("fluid", [WATER, OIL])
@pytest.mark.parametrize("crack_bar", [0.0, 0.05, 0.3])
@pytest.mark.parametrize("q_lmin", [-20.0, 0.5, 2.0, 5.0, 10.0, 60.0, 200.0])
def test_d09_flow_splits_between_seat_and_orifice_at_one_valve_drop(fluid, crack_bar, q_lmin):
    # Seat and orifice see the same drop; the orifice no longer pays the cracking pressure on top
    rho, mu = fluid
    cvo = CheckValveOrifice("CVO", cv=10.0, cracking_pressure_bar=crack_bar, pipe_diameter=0.05248,
                            orifice_diameter=0.005)
    q = q_lmin / 60000.0
    dp = cvo.calculate_delta_p(q, rho, mu)
    assert _reference_flow(cvo, dp, rho, mu) == pytest.approx(q, rel=1e-8)


@pytest.mark.audit("D-09")
def test_d09_seat_has_the_viscosity_correction():
    # Above cracking a viscous oil needs a larger drop than an equally dense fluid at water viscosity
    cvo = CheckValveOrifice("CVO", cv=10.0, cracking_pressure_bar=0.05, pipe_diameter=0.05248, orifice_diameter=0.001)
    q = 60.0 / 60000.0
    assert cvo.calculate_delta_p(q, 870.0, 0.2) > 1.05 * cvo.calculate_delta_p(q, 870.0, 1e-3)




@pytest.mark.audit("D-09")
@pytest.mark.parametrize("q, rho, mu", [(float("nan"), 998.2, 1e-3), (1e-3, float("nan"), 1e-3),
                                        (1e-3, 998.2, float("nan"))])
def test_d09_non_finite_state_does_not_raise(q, rho, mu):
    # A diverged iterate passes through (NaN, or the orifice drop where the orifice law clamps it) for the solver
    cvo = CheckValveOrifice("CVO", cracking_pressure_bar=0.0, pipe_diameter=0.05248, orifice_diameter=0.005)
    dp = cvo.calculate_delta_p(q, rho, mu)
    assert math.isnan(dp) or dp == cvo._calculate_orifice_dp(q, rho, mu)


@pytest.mark.audit("D-09")
@pytest.mark.parametrize("q", [5e-324, 1e-310, 1e-300, 1e-20])
def test_d09_tiny_forward_flow_with_zero_cracking_does_not_raise(q):
    cvo = CheckValveOrifice("CVO", cracking_pressure_bar=0.0, pipe_diameter=0.05248, orifice_diameter=0.005)
    dp = cvo.calculate_delta_p(q, 998.2, 1e-3)
    assert 0.0 <= dp <= cvo._calculate_orifice_dp(q, 998.2, 1e-3)


if __name__ == "__main__":
    test_check_valve_orifice_physics()
    test_graph_parser_check_valve_orifice()
    print("All Check Valve w/ Orifice tests passed successfully!")
