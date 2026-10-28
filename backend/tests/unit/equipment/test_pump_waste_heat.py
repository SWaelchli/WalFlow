"""Pump waste heat: the share (1 - eta) of the shaft power that is not hydraulic power heats the fluid.

Reference: dT = dp / (rho * cp) * (1 - eta) / eta, with rho and cp of the fluid entering the pump.
"""
import pytest

from physics_refs import build_network, water_head
from simulation.equipment.base_node import total_of
from simulation.equipment.tank import Tank
from simulation.equipment.pipe import Pipe
from simulation.equipment.centrifugal_pump import CentrifugalPump
from simulation.equipment.volumetric_pump import VolumetricPump
from simulation.fluid_utils import FluidProperties
from simulation.schemas import HydraulicNetwork, GlobalSettings
from simulation.solver import NetworkSolver

FLUID = "iso_vg_46"


def _solve_pump(pump):
    gs = GlobalSettings(fluid_type=FLUID)
    t1 = Tank("Source", elevation=0.0, fluid_level=1.0, fluid_type=FLUID, temperature=293.15)
    t2 = Tank("Sink", elevation=10.0, fluid_level=0.0, fluid_type=FLUID, temperature=293.15)
    nodes = {"t1": t1, "t2": t2, "p1": pump}
    edges = [
        {"id": "e1", "source": "t1", "target": "p1", "source_port": "outlet-0", "target_port": "inlet-0", "pipe": Pipe("P1", 1.0, 0.1)},
        {"id": "e2", "source": "p1", "target": "t2", "source_port": "outlet-0", "target_port": "inlet-0", "pipe": Pipe("P2", 1.0, 0.1)},
    ]
    network = build_network(nodes=nodes, edges=edges)
    network.global_settings = gs
    for node in nodes.values():
        node.global_settings = gs
    for edge in edges:
        edge["pipe"].global_settings = gs
    assert NetworkSolver(network).solve()["success"]
    return pump


def _expected_rise(pump, efficiency):
    t_in = pump.inlets[0].temperature
    dp = total_of(pump.outlets[0]) - total_of(pump.inlets[0])   # the pump works on total pressure
    rho = FluidProperties.get_density(FLUID, t_in)
    cp = FluidProperties.get_specific_heat(FLUID, t_in)
    return dp / (rho * cp) * (1.0 - efficiency) / efficiency


def _actual_rise(pump):
    return pump.outlets[0].temperature - pump.inlets[0].temperature


def test_centrifugal_pump_heats_the_fluid_by_its_inefficiency():
    pump = _solve_pump(CentrifugalPump("Pump", flow_rated=0.01, head_rated=water_head(1000000.0), efficiency=0.5))
    assert pump.outlets[0].pressure - pump.inlets[0].pressure > 5e4   # the pump really works against a head
    assert _actual_rise(pump) == pytest.approx(_expected_rise(pump, 0.5), rel=2e-3)


def test_volumetric_pump_heats_the_fluid_by_its_inefficiency():
    pump = _solve_pump(VolumetricPump("PD-Pump", flow_rated=0.001, motor_power=50000.0, efficiency=0.1))
    assert pump.outlets[0].pressure - pump.inlets[0].pressure > 5e4
    assert _actual_rise(pump) == pytest.approx(_expected_rise(pump, 0.1), rel=2e-3)


@pytest.mark.parametrize("efficiency", [0.02, 0.05, 0.08, 1.0])
@pytest.mark.parametrize("kind", ["centrifugal", "volumetric"])
def test_heat_is_shaft_power_minus_hydraulic_power_at_low_efficiency(kind, efficiency):
    # One efficiency in both formulas, down to the 1 % input minimum: no hidden 5 % or 10 % floor
    if kind == "centrifugal":
        pump = _solve_pump(CentrifugalPump("Pump", flow_rated=0.01, head_rated=water_head(1000000.0), efficiency=efficiency))
    else:
        pump = _solve_pump(VolumetricPump("PD-Pump", flow_rated=0.001, motor_power=1e7, efficiency=efficiency))
    q = pump.inlets[0].flow_rate
    dp = total_of(pump.outlets[0]) - total_of(pump.inlets[0])   # shaft power is on total pressure
    t_in = pump.inlets[0].temperature
    m_cp = FluidProperties.get_density(FLUID, t_in) * q * FluidProperties.get_specific_heat(FLUID, t_in)
    assert pump.shaft_power() == pytest.approx(q * dp / efficiency, rel=1e-9)
    assert _actual_rise(pump) == pytest.approx((pump.shaft_power() - q * dp) / m_cp, rel=2e-3)


def _solve_braking(pump):
    """A 60 m head drives more flow through the pump than it delivers on its own: the pump brakes (dP < 0)."""
    gs = GlobalSettings(fluid_type=FLUID)
    t1 = Tank("Header", elevation=60.0, fluid_level=1.0, fluid_type=FLUID, temperature=293.15)
    t2 = Tank("Sink", elevation=0.0, fluid_level=0.0, fluid_type=FLUID, temperature=293.15)
    nodes = {"t1": t1, "t2": t2, "p1": pump}
    edges = [
        {"id": "e1", "source": "t1", "target": "p1", "pipe": Pipe("P1", 1.0, 0.1)},
        {"id": "e2", "source": "p1", "target": "t2", "pipe": Pipe("P2", 1.0, 0.1)},
    ]
    network = build_network(nodes=nodes, edges=edges)
    network.global_settings = gs
    for item in [*nodes.values(), *(e["pipe"] for e in edges)]:
        item.global_settings = gs
    assert NetworkSolver(network).solve()["success"]
    return pump


@pytest.mark.parametrize("kind", ["centrifugal", "volumetric"])
def test_braking_pump_turns_all_its_pressure_drop_into_heat(kind):
    # The fluid does work on the pump: like a throttle, all of Q·|dP| becomes heat, whatever the efficiency
    if kind == "centrifugal":
        pump = CentrifugalPump("Pump", flow_rated=0.002, head_rated=5.0, efficiency=0.3)
    else:
        pump = VolumetricPump("PD-Pump", flow_rated=0.002, motor_power=50000.0, efficiency=0.3)
    _solve_braking(pump)
    dp = pump.outlets[0].pressure - pump.inlets[0].pressure
    assert pump.inlets[0].flow_rate > 0 and dp < -1e4
    t_in = pump.inlets[0].temperature
    rho, cp = FluidProperties.get_density(FLUID, t_in), FluidProperties.get_specific_heat(FLUID, t_in)
    assert _actual_rise(pump) == pytest.approx(-dp / (rho * cp), rel=2e-3)
    assert pump.shaft_power() == 0.0


def _pump_at(pump, flow_rate):
    """Runs calculate() on a lone pump at a fixed flow, both ports at 20 °C; returns (dP, rise at the exit port)."""
    pump.global_settings = GlobalSettings(fluid_type=FLUID)
    for port in (pump.inlets[0], pump.outlets[0]):
        port.temperature = 293.15
        port.density = FluidProperties.get_density(FLUID, 293.15)
        port.viscosity = FluidProperties.get_viscosity(FLUID, 293.15)
    pump.inlets[0].pressure = 2e5
    pump.inlets[0].flow_rate = flow_rate
    pump.calculate()
    dp = pump.outlets[0].pressure - pump.inlets[0].pressure
    exit_port, entry_port = (pump.outlets[0], pump.inlets[0]) if flow_rate >= 0 else (pump.inlets[0], pump.outlets[0])
    return dp, exit_port.temperature - entry_port.temperature


@pytest.mark.parametrize("kind", ["centrifugal", "volumetric"])
def test_heat_does_not_depend_on_the_sign_of_a_near_zero_flow(kind):
    # A dead-headed pump sits at Q = ±noise: the heat must not jump between iterations
    def make():
        if kind == "centrifugal":
            return CentrifugalPump("Pump", flow_rated=0.01, head_rated=50.0, efficiency=0.1)
        return VolumetricPump("PD-Pump", flow_rated=0.001, motor_power=50000.0, efficiency=0.1)
    dp_plus, rise_plus = _pump_at(make(), 1e-12)
    dp_minus, rise_minus = _pump_at(make(), -1e-12)
    assert dp_plus > 1e5 and dp_minus > 1e5
    assert rise_minus == pytest.approx(rise_plus, rel=1e-6)


def test_running_pump_in_reverse_flow_still_draws_shaft_power():
    # A stronger parallel pump pushes flow back through a running one (Q < 0, dP > 0): the motor still drives
    # the impeller, shaft power |Q|·dP/eta, heat (1 - eta)/eta of |dP| on the inlet side
    pump = CentrifugalPump("Pump", flow_rated=0.01, head_rated=50.0, efficiency=0.5)
    dp, rise = _pump_at(pump, -0.002)
    assert dp > 0
    rho, cp = FluidProperties.get_density(FLUID, 293.15), FluidProperties.get_specific_heat(FLUID, 293.15)
    assert pump.shaft_power() == pytest.approx(0.002 * dp / 0.5, rel=1e-9)
    assert rise == pytest.approx(dp / (rho * cp) * (1.0 - 0.5) / 0.5, rel=1e-9)
    assert pump.outlets[0].temperature == pytest.approx(293.15)
