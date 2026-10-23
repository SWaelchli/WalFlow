"""F1-41: mixer energy and mass balance."""
import pytest

pytestmark = pytest.mark.audit("F1-41", "F1-42")

import pytest

from physics_refs import solve
from simulation.equipment.tank import Tank
from simulation.equipment.pipe import Pipe
from simulation.equipment.mixer import Mixer
from simulation.fluid_utils import FluidProperties

FLUID = "iso_vg_46"


@pytest.mark.parametrize("tol_k", [
    pytest.param(1.0, id="thermal-mixing-balances"),
    pytest.param(0.1, id="F1-42-variable-cp-enthalpy"),
])
def test_mixing_conserves_mass_and_enthalpy(tol_k):
    t_hot = Tank("Hot Tank", fluid_level=10.0, temperature=80 + 273.15, fluid_type=FLUID)
    t_cold = Tank("Cold Tank", fluid_level=5.0, temperature=20 + 273.15, fluid_type=FLUID)
    mix = Mixer("Mixing Junction", num_inlets=2)
    t_sink = Tank("Return Tank", fluid_level=0.0, temperature=20 + 273.15, fluid_type=FLUID)
    edges = [
        {"source": "t1", "target": "mix", "target_port": "inlet-0", "pipe": Pipe("p_hot", 5, 0.05)},
        {"source": "t2", "target": "mix", "target_port": "inlet-1", "pipe": Pipe("p_cold", 5, 0.08)},
        {"source": "mix", "target": "t3", "target_port": "inlet-0", "pipe": Pipe("p_out", 5, 0.08)},
    ]
    stats = solve({"t1": t_hot, "t2": t_cold, "mix": mix, "t3": t_sink}, edges, fluid=FLUID)
    assert stats["success"]

    hot, cold = edges[0]["pipe"].outlets[0], edges[1]["pipe"].outlets[0]
    assert hot.flow_rate > 0 and cold.flow_rate > 0
    assert hot.temperature == pytest.approx(353.15, abs=0.2)
    assert cold.temperature == pytest.approx(293.15, abs=0.2)

    m_h = hot.flow_rate * hot.density
    m_c = cold.flow_rate * cold.density
    m_out = mix.outlets[0].flow_rate * mix.outlets[0].density
    assert m_out == pytest.approx(m_h + m_c, rel=0.005)

    # Energy balance: heat given by the hot stream = heat taken by the cold stream, h = ∫cp dT
    cp = lambda t: FluidProperties.get_specific_heat(FLUID, t)
    def dh(t_from, t_to, n=200):
        step = (t_to - t_from) / n
        return sum(cp(t_from + (i + 0.5) * step) for i in range(n)) * step
    lo, hi = cold.temperature, hot.temperature
    for _ in range(60):
        t = (lo + hi) / 2.0
        if m_h * dh(t, hot.temperature) > m_c * dh(cold.temperature, t):
            lo = t
        else:
            hi = t
    assert mix.outlets[0].temperature == pytest.approx((lo + hi) / 2.0, abs=tol_k)
