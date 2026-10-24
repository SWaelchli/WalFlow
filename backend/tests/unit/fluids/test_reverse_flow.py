"""Reverse flow – magnitude against Darcy–Weisbach/Colebrook and temperature carried backwards."""
import pytest


import pytest

from physics_refs import reservoir_pipe_flow, solve
from simulation.equipment.tank import Tank
from simulation.equipment.pipe import Pipe
from simulation.fluid_utils import FluidProperties

FLUID = "iso_vg_46"
D, L, ROUGH = 0.05, 20.0, 0.000045


def test_reverse_flow_magnitude_and_temperature():
    # Edge drawn t1 -> t2, but t2 has the higher level: flow must run backwards
    t1 = Tank("Low Tank", fluid_level=5.0, temperature=80 + 273.15, fluid_type=FLUID)
    t2 = Tank("High Tank", fluid_level=10.0, temperature=20 + 273.15, fluid_type=FLUID)
    pipe = Pipe("pipe1", L, D, roughness=ROUGH)
    stats = solve({"t1": t1, "t2": t2}, [{"source": "t1", "target": "t2", "pipe": pipe}], fluid=FLUID)
    assert stats["success"]

    q = pipe.inlets[0].flow_rate
    assert q < 0

    # Fluid comes from the cold high tank
    t_cold = 20 + 273.15
    assert pipe.inlets[0].temperature == pytest.approx(t_cold, abs=0.5)

    rho_hot = FluidProperties.get_density(FLUID, 80 + 273.15)
    rho_cold = FluidProperties.get_density(FLUID, t_cold)
    mu = FluidProperties.get_viscosity(FLUID, t_cold)
    dp_static = 9.81 * (rho_cold * 10.0 - rho_hot * 5.0)
    q_ref = reservoir_pipe_flow(dp_static, L, D, ROUGH, rho_cold, mu)
    assert abs(q) == pytest.approx(q_ref, rel=0.02)
