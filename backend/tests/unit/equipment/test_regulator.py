"""Pressure regulators – at setpoint when reachable, otherwise saturated on the physically correct side."""



import pytest

from physics_refs import solve, water_head
from strategies import build
from networks import assert_regulator_consistent, ID_1IN, ATM
from simulation.equipment.tank import Tank
from simulation.equipment.pipe import Pipe
from simulation.equipment.orifice import Orifice
from simulation.equipment.centrifugal_pump import CentrifugalPump
from simulation.equipment.linear_regulator import LinearRegulator





def test_prv_holds_reachable_setpoint():
    # 6 bar(g) feed head, orifice load downstream: 2 bar(g) is reachable
    set_pa = 2.0e5 + ATM
    nodes = {
        "t1": Tank("Source", fluid_level=61.0),
        "reg": LinearRegulator("PRV", max_cv=5.0, set_pressure=set_pa, backpressure=False),
        "ori": Orifice("Load", pipe_diameter=ID_1IN, orifice_diameter=0.008),
        "t2": Tank("Sink", fluid_level=0.0),
    }
    edges = [
        {"source": "t1", "target": "reg", "pipe": Pipe("p1", 5, ID_1IN)},
        {"source": "reg", "target": "ori", "pipe": Pipe("p2", 1, ID_1IN)},
        {"source": "ori", "target": "t2", "pipe": Pipe("p3", 1, ID_1IN)},
    ]
    assert solve(nodes, edges)["success"]
    assert assert_regulator_consistent(nodes["reg"], set_pa) == "regulated"


def test_prv_into_open_tank_saturates_open():
    # A PRV discharging straight into an atmospheric tank cannot build 3 bar(g) downstream
    set_pa = 3.0e5 + ATM
    nodes = {
        "t1": Tank("Source", fluid_level=50.0),
        "reg": LinearRegulator("PRV", max_cv=5.0, set_pressure=set_pa, backpressure=False),
        "t2": Tank("Sink", fluid_level=0.0),
    }
    edges = [
        {"source": "t1", "target": "reg", "pipe": Pipe("p1", 5, ID_1IN)},
        {"source": "reg", "target": "t2", "pipe": Pipe("p2", 5, ID_1IN)},
    ]
    assert solve(nodes, edges)["success"]
    assert assert_regulator_consistent(nodes["reg"], set_pa) == "saturated open"


def test_bpr_holds_upstream_pressure():
    set_pa = 8.0e5 + ATM
    nodes = {
        "t1": Tank("Source", fluid_level=1.0),
        "p1": CentrifugalPump("Feed Pump", flow_rated=100.0 / 60000.0, head_rated=water_head(10.0e5), rise_to_shutoff_pct=20.0),
        "reg": LinearRegulator("BPR", max_cv=5.0, set_pressure=set_pa, backpressure=True),
        "t2": Tank("Sink", fluid_level=1.0),
    }
    edges = [
        {"source": "t1", "target": "p1", "pipe": Pipe("p1", 1, ID_1IN)},
        {"source": "p1", "target": "reg", "pipe": Pipe("p2", 1, ID_1IN)},
        {"source": "reg", "target": "t2", "pipe": Pipe("p3", 1, ID_1IN)},
    ]
    assert solve(nodes, edges)["success"]
    assert assert_regulator_consistent(nodes["reg"], set_pa) == "regulated"


# Cv in US gpm per sqrt(psi): dp [Pa] = (Q / (Cv * gpm_to_m3s))^2 * psi_to_pa * SG, derived from the unit definitions
GPM_TO_M3S = 6.30902e-5
PSI_TO_PA = 6894.757


def _cv_dp(q, rho, cv):
    return (abs(q) / (cv * GPM_TO_M3S)) ** 2 * PSI_TO_PA * rho / 1000.0 * (1.0 if q >= 0 else -1.0)


def _regulator(max_cv, set_pa, p_in, q, t_in=300.0):
    reg = build("linear_regulator", {"max_cv": max_cv, "set_pressure_pa": set_pa})
    inlet, outlet = reg.inlets[0], reg.outlets[0]
    inlet.pressure, inlet.flow_rate, inlet.temperature = p_in, q, t_in
    inlet.density, inlet.viscosity = 997.0, 0.001
    outlet.temperature, outlet.density, outlet.viscosity = t_in, 997.0, 0.001
    return reg


@pytest.mark.parametrize("max_cv, q", [
    pytest.param(5.0, 2e-3, id="cv5_forward"),
    pytest.param(1.0, 1e-3, id="cv1_forward"),
    pytest.param(20.0, 8e-3, id="cv20_forward"),
    pytest.param(5.0, -2e-3, id="cv5_reverse"),
])
def test_wide_open_dp_follows_the_cv_definition_in_turbulent_flow(max_cv, q):
    reg = _regulator(max_cv, 5e5, 6e5, q)
    assert reg.calculate_delta_p(q, 997.0, 0.001) == pytest.approx(_cv_dp(q, 997.0, max_cv), rel=1e-2)


@pytest.mark.parametrize("p_in, expected_rise", [
    pytest.param(6e5, True, id="supply_above_setpoint_heats"),
    pytest.param(4e5, False, id="supply_below_setpoint_does_not_heat"),
])
def test_locked_up_regulator_pins_outlet_to_setpoint(p_in, expected_rise):
    # The Cv equation at the end stop would give a dp unrelated to the pinned outlet pressure
    reg = _regulator(0.05, 5e5, p_in, 0.0)
    reg.locked_up = True
    dp = reg.calculate()
    assert dp == pytest.approx(p_in - 5e5)
    assert reg.outlets[0].pressure == pytest.approx(5e5)
    if expected_rise:
        assert reg.outlets[0].temperature > 300.0
    else:
        assert reg.outlets[0].temperature == pytest.approx(300.0)


@pytest.mark.parametrize("node_type", ["linear_control_valve", "remote_control_valve", "linear_regulator"])
def test_missing_max_cv_defaults_to_50(node_type):
    assert build(node_type, {}).max_cv == 50.0
