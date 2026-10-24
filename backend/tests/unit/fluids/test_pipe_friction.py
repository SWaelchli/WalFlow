"""Churchill friction factor: laminar / Colebrook limits, continuity, consistent derivative."""
import pytest


import math

import pytest

from simulation.equipment.pipe import Pipe

D, L, ROUGH = 0.05, 50.0, 0.000045


def _colebrook(re, eps_d):
    f = 0.02
    for _ in range(200):
        f = (-2.0 * math.log10(eps_d / 3.7 + 2.51 / (re * math.sqrt(f)))) ** -2
    return f


@pytest.mark.parametrize("re", [1.0, 100.0, 1000.0])
def test_laminar_limit(re):
    assert Pipe("p", L, D, ROUGH)._friction_factor(re) == pytest.approx(64.0 / re, rel=1e-3)


@pytest.mark.parametrize("re", [1e4, 1e5, 1e6, 1e7])
def test_turbulent_matches_colebrook(re):
    pipe = Pipe("p", L, D, ROUGH)
    assert pipe._friction_factor(re) == pytest.approx(_colebrook(re, ROUGH / D), rel=0.02)


def test_transition_is_continuous_and_between_limits():
    pipe = Pipe("p", L, D, ROUGH)
    res = [1500 + 50 * i for i in range(0, 80)]
    fs = [pipe._friction_factor(r) for r in res]
    assert max(abs(a - b) / a for a, b in zip(fs, fs[1:])) < 0.05
    # at Re 3000 Churchill follows the turbulent (Colebrook) branch within ~10 %
    assert pipe._friction_factor(3000.0) == pytest.approx(_colebrook(3000.0, ROUGH / D), rel=0.10)




def test_zero_flow_derivative_is_laminar_limit():
    pipe = Pipe("p", L, D, ROUGH)
    mu = 0.04
    assert pipe.calculate_dp_derivative(0.0, 870.0, mu) == pytest.approx(32.0 * mu * L / (D ** 2 * pipe.area), rel=1e-9)


def test_zero_roughness_is_a_smooth_pipe():
    re = 1e5
    smooth = Pipe("p", L, D, 0.0)._friction_factor(re)
    assert smooth == pytest.approx(_colebrook(re, 0.0), rel=0.02)
    assert smooth < 0.95 * Pipe("p", L, D, ROUGH)._friction_factor(re)


def test_missing_roughness_takes_the_default():
    assert Pipe("p", L, D, None)._friction_factor(1e5) == pytest.approx(Pipe("p", L, D, ROUGH)._friction_factor(1e5))


def test_missing_roughness_is_stored_as_the_default():
    assert Pipe("p", L, D, None).roughness == pytest.approx(0.000045)


def test_pipe_has_no_friction_factor_argument():
    with pytest.raises(TypeError):
        Pipe("p", L, D, ROUGH, friction_factor=0.02)


@pytest.mark.parametrize("eps_d", [0.0, 0.0009, 0.01])
@pytest.mark.parametrize("re", [0.5, 9.9, 10.1, 500.0, 2000.0, 2500.0, 3000.0, 4000.0, 1e4, 1e5, 1e7])
def test_friction_slope_is_the_exact_derivative(eps_d, re):
    from simulation.fluid_utils import FluidProperties as FP
    h = 1e-6
    num = (FP.get_darcy_friction_factor(re * (1 + h), eps_d) - FP.get_darcy_friction_factor(re * (1 - h), eps_d)) / (2 * h)
    assert FP.get_darcy_friction_slope(re, eps_d) == pytest.approx(num, rel=1e-5, abs=1e-9)


@pytest.mark.parametrize("re", [0.0, 1e-9, 1.0])
def test_friction_slope_laminar_limit_is_minus_f(re):
    from simulation.fluid_utils import FluidProperties as FP
    assert FP.get_darcy_friction_slope(re, 0.001) == pytest.approx(-FP.get_darcy_friction_factor(re, 0.001), rel=1e-12)
