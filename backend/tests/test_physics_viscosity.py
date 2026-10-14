"""F1-41: pipe friction against an independent Darcy–Weisbach / Colebrook calculation, for oil at two temperatures."""
import pytest

from physics_refs import pipe_dp, pipe_flow, solve
from simulation.equipment.tank import Tank
from simulation.equipment.pipe import Pipe
from simulation.fluid_utils import FluidProperties

FLUID = "iso_vg_46"
D, L, ROUGH = 0.05, 100.0, 0.000045


def _gravity_flow(temp_c):
    t_k = temp_c + 273.15
    nodes = {
        "t1": Tank("Oil Tank", fluid_level=12.0, temperature=t_k, fluid_type=FLUID),
        "t2": Tank("Return Tank", fluid_level=2.0, temperature=t_k, fluid_type=FLUID),
    }
    pipe = Pipe("Long Pipe", length=L, diameter=D, roughness=ROUGH)
    stats = solve(nodes, [{"source": "t1", "target": "t2", "pipe": pipe}], fluid=FLUID)
    assert stats["success"]
    return pipe, t_k


@pytest.mark.parametrize("temp_c", [20.0, 60.0])
def test_pipe_flow_matches_darcy_colebrook(temp_c):
    pipe, t_k = _gravity_flow(temp_c)
    rho = FluidProperties.get_density(FLUID, t_k)
    mu = FluidProperties.get_viscosity(FLUID, t_k)
    # Oil properties must reach the pipe (the old test silently ran with water)
    assert pipe.inlets[0].viscosity == pytest.approx(mu, rel=1e-3)

    dp_static = rho * 9.81 * (12.0 - 2.0)
    q_ref = pipe_flow(dp_static, L, D, ROUGH, rho, mu)
    q = pipe.inlets[0].flow_rate
    # The reference switches abruptly from 64/Re to Colebrook; WalFlow uses the continuous Churchill (F1-21),
    # which differs by a few percent in the transition band (Re 2000-4000, the 60 °C case)
    tol = 0.01 if temp_c < 40.0 else 0.10
    assert q == pytest.approx(q_ref, rel=tol)
    assert pipe.inlets[0].pressure - pipe.outlets[0].pressure == pytest.approx(pipe_dp(q, L, D, ROUGH, rho, mu), rel=tol)


def test_warm_oil_flows_more():
    q_cold = _gravity_flow(20.0)[0].inlets[0].flow_rate
    q_warm = _gravity_flow(60.0)[0].inlets[0].flow_rate
    assert q_warm > 1.5 * q_cold  # VG46: ~6.6x lower viscosity at 60 °C, laminar regime
