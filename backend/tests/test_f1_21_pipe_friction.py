"""F1-21: Churchill friction factor: laminar / Colebrook limits, continuity, consistent derivative."""
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
def test_f1_21_laminar_limit(re):
    assert Pipe("p", L, D, ROUGH)._friction_factor(re) == pytest.approx(64.0 / re, rel=1e-3)


@pytest.mark.parametrize("re", [1e4, 1e5, 1e6, 1e7])
def test_f1_21_turbulent_matches_colebrook(re):
    pipe = Pipe("p", L, D, ROUGH)
    assert pipe._friction_factor(re) == pytest.approx(_colebrook(re, ROUGH / D), rel=0.02)


def test_f1_21_transition_is_continuous_and_between_limits():
    pipe = Pipe("p", L, D, ROUGH)
    res = [1500 + 50 * i for i in range(0, 80)]
    fs = [pipe._friction_factor(r) for r in res]
    assert max(abs(a - b) / a for a, b in zip(fs, fs[1:])) < 0.05
    # at Re 3000 Churchill follows the turbulent (Colebrook) branch within ~10 %
    assert pipe._friction_factor(3000.0) == pytest.approx(_colebrook(3000.0, ROUGH / D), rel=0.10)


@pytest.mark.parametrize("q", [1e-6, 5e-5, 1e-3, 2e-2])
def test_f1_21_derivative_matches_numerical(q):
    pipe = Pipe("p", L, D, ROUGH)
    rho, mu = 870.0, 0.04
    h = q * 1e-5
    num = (pipe.calculate_delta_p(q + h, rho, mu) - pipe.calculate_delta_p(q - h, rho, mu)) / (2 * h)
    assert pipe.calculate_dp_derivative(q, rho, mu) == pytest.approx(num, rel=1e-4)


def test_f1_21_zero_flow_derivative_is_laminar_limit():
    pipe = Pipe("p", L, D, ROUGH)
    mu = 0.04
    assert pipe.calculate_dp_derivative(0.0, 870.0, mu) == pytest.approx(32.0 * mu * L / (D ** 2 * pipe.area), rel=1e-9)
