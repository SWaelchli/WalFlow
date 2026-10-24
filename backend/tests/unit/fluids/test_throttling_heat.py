"""Every restriction keeps its throttling heat, ΔT = ΔP/(ρ·cp) (adiabatic, incompressible liquid)."""
import pytest


import pytest

from physics_refs import solve, throttling_dt
from simulation.equipment.tank import Tank
from simulation.equipment.pipe import Pipe
from simulation.equipment.orifice import Orifice
from simulation.equipment.filter import Filter
from simulation.equipment.linear_control_valve import LinearControlValve
from simulation.equipment.linear_regulator import LinearRegulator
from simulation.equipment.remote_control_valve import RemoteControlValve
from simulation.equipment.check_valve import CheckValve
from simulation.equipment.check_valve_orifice import CheckValveOrifice
from simulation.equipment.pressure_safety_valve import PressureSafetyValve
from simulation.equipment.rupture_disc import RuptureDisc
from simulation.fluid_utils import FluidProperties

COMPONENTS = {
    "orifice": lambda: Orifice("R", pipe_diameter=0.05, orifice_diameter=0.01),
    "filter": lambda: Filter("R", dp_clean_bar=2.0, flow_ref_lmin=100.0),
    "control_valve": lambda: LinearControlValve("R", max_cv=1.0, opening_pct=50.0),
    "regulator": lambda: LinearRegulator("R", max_cv=1.0, set_pressure=50e5, backpressure=False),
    "remote_control_valve": lambda: RemoteControlValve("R", max_cv=1.0, set_pressure=50e5),
    "check_valve": lambda: CheckValve("R", cv=1.0, cracking_pressure_bar=0.5),
    "check_valve_orifice": lambda: CheckValveOrifice("R", cv=1.0, cracking_pressure_bar=0.5, pipe_diameter=0.05, orifice_diameter=0.01),
    "psv": lambda: PressureSafetyValve("R", set_pressure_barg=2.0, cv=1.0),
    "rupture_disc": lambda: RuptureDisc("R", burst_pressure_barg=1.5, cv=1.0),
}


@pytest.mark.parametrize("kind", sorted(COMPONENTS))
def test_throttling_heat_magnitude(kind):
    # ~5.8 bar of water head across one restriction
    t1 = Tank("High", elevation=59.0, fluid_level=0.0, temperature=293.15)
    t2 = Tank("Low", elevation=0.0, fluid_level=0.0, temperature=293.15)
    comp = COMPONENTS[kind]()
    edges = [
        {"source": "t1", "target": "r", "pipe": Pipe("P1", 1.0, 0.05)},
        {"source": "r", "target": "t2", "pipe": Pipe("P2", 1.0, 0.05)},
    ]
    stats = solve({"t1": t1, "r": comp, "t2": t2}, edges)
    assert stats["success"]

    inlet, outlet = comp.inlets[0], comp.outlets[0]
    assert inlet.flow_rate > 1e-5, "restriction must pass flow in this test"
    dp = inlet.pressure - outlet.pressure
    assert dp > 0.5e5

    rho = inlet.density
    cp = FluidProperties.get_specific_heat("water", inlet.temperature)
    assert outlet.temperature - inlet.temperature == pytest.approx(throttling_dt(dp, rho, cp), rel=0.02)
