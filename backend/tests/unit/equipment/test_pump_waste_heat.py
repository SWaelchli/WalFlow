"""Pump waste heat: the share (1 - eta) of the shaft power that is not hydraulic power heats the fluid.

Reference: dT = dp / (rho * cp) * (1 - eta) / eta, with rho and cp of the fluid entering the pump.
"""
import pytest

from physics_refs import water_head
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
    network = HydraulicNetwork(nodes=nodes, edges=edges)
    network.global_settings = gs
    for node in nodes.values():
        node.global_settings = gs
    for edge in edges:
        edge["pipe"].global_settings = gs
    assert NetworkSolver(network).solve()["success"]
    return pump


def _expected_rise(pump, efficiency):
    t_in = pump.inlets[0].temperature
    dp = pump.outlets[0].pressure - pump.inlets[0].pressure
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


def test_perfect_pump_adds_no_heat():
    pump = _solve_pump(CentrifugalPump("Pump", flow_rated=0.01, head_rated=water_head(1000000.0), efficiency=1.0))
    # only pipe friction (a few mK) remains
    assert _actual_rise(pump) == pytest.approx(0.0, abs=1e-3)
