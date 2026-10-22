import math
import pytest

from simulation.equipment.check_valve_orifice import CheckValveOrifice
from simulation.schemas import ReactFlowNode
from simulation.graph_parser import GraphParser

def test_check_valve_orifice_physics():
    cvo = CheckValveOrifice(
        name="CVO_1",
        cv=10.0,
        cracking_pressure_bar=0.05,
        pipe_diameter=0.1,
        orifice_diameter=0.01
    )
    
    # Forward sub-cracking / orifice flow (low flow)
    dp_sub = cvo.calculate_delta_p(flow_rate=0.0001, density=1000.0)
    print(f"Sub-cracking forward dP: {dp_sub / 1e5:.5f} bar")
    assert dp_sub > 0, "Sub-cracking forward flow should have positive dP across orifice"

    # Reverse backflow through orifice
    dp_rev = cvo.calculate_delta_p(flow_rate=-0.0001, density=1000.0)
    print(f"Reverse backflow dP across orifice: {dp_rev / 1e5:.5f} bar")
    assert dp_rev < 0, "Reverse flow should have negative dP through orifice"

    # Forward flow above cracking pressure
    dp_open = cvo.calculate_delta_p(flow_rate=0.001, density=1000.0)
    print(f"Open forward dP: {dp_open / 1e5:.4f} bar")
    assert dp_open >= 0.05 * 1e5, "Open forward flow dP should exceed cracking pressure"

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
    from simulation.equipment.check_valve import CheckValve
    q_ori = brentq(lambda q: cvo._calculate_orifice_dp(q, rho, mu) - dp, -1.0, 1.0, xtol=1e-15, rtol=1e-14)
    excess = dp - cvo.cracking_pressure_bar * 1e5
    if excess <= 0:
        return q_ori
    seat = CheckValve("seat", cv=cvo.cv)
    q_seat = brentq(lambda q: seat.calculate_open_friction_and_deriv(q, rho, mu)[0] - excess, 0.0, 1.0,
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
@pytest.mark.parametrize("crack_bar", [0.0, 0.05])
def test_d09_drop_is_continuous_and_monotonic_through_zero_and_cracking(crack_bar):
    rho, mu = WATER
    cvo = CheckValveOrifice("CVO", cv=10.0, cracking_pressure_bar=crack_bar, pipe_diameter=0.05248,
                            orifice_diameter=0.005)
    assert cvo.calculate_delta_p(0.0, rho, mu) == 0.0
    flows = [i * 1e-6 for i in range(-200, 2001)]
    drops = [cvo.calculate_delta_p(q, rho, mu) for q in flows]
    assert all(b > a for a, b in zip(drops, drops[1:]))
    # Largest step stays of the order of the local slope (no jump at Q = 0 or at the cracking point)
    assert max(b - a for a, b in zip(drops, drops[1:])) < 0.01 * max(abs(d) for d in drops)


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
