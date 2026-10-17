"""F1-06: the solver must not leave phantom flows in low-loss sections (old absolute 10 Pa residual floor)."""
import pytest

pytestmark = pytest.mark.audit("F1-06")

import pytest

from physics_refs import pipe_flow, solve
from simulation.equipment.pipe import Pipe
from simulation.equipment.tank import Tank
from simulation.fluid_utils import FluidProperties

ROUGH = 0.000045


def _two_tanks(d, level_diff, length=10.0, **settings):
    nodes = {
        "t1": Tank("A", fluid_level=2.0 + level_diff),
        "t2": Tank("B", fluid_level=2.0),
    }
    pipe = Pipe("p", length, d, roughness=ROUGH)
    stats = solve(nodes, [{"source": "t1", "target": "t2", "pipe": pipe}], **settings)
    assert stats["success"]
    return pipe.inlets[0].flow_rate * 60000.0  # L/min


@pytest.mark.parametrize("d", [0.0525, 0.2])
def test_equal_levels_give_zero_flow(d):
    # Exact answer is 0; the old solver stopped at 4.7 L/min (DN50) and 150 L/min (DN200)
    assert abs(_two_tanks(d, 0.0)) < 0.01


@pytest.mark.parametrize("d,level_diff", [(0.2, 0.010), (0.0525, 0.010)])
def test_small_level_difference_matches_reference(d, level_diff):
    rho = FluidProperties.get_density("water", 293.15)
    mu = FluidProperties.get_viscosity("water", 293.15)
    q_ref = pipe_flow(rho * 9.81 * level_diff, 10.0, d, ROUGH, rho, mu) * 60000.0
    assert _two_tanks(d, level_diff) == pytest.approx(q_ref, rel=0.02)


def test_user_tolerance_is_honoured():
    # A tighter user tolerance may not be ignored (the old floor made tolerances below 1e-5 inert)
    assert abs(_two_tanks(0.2, 0.0, tolerance=1e-9)) < 0.001
