"""Sharp-orifice Cd at low Reynolds number (Wuest laminar law blended into 0.60)."""
import pytest


import math

import pytest

from simulation.fluid_utils import FluidProperties as FP


@pytest.mark.parametrize("re, wuest, cd_min", [
    pytest.param(0.01, True, None, id="wuest-0.01"),
    pytest.param(0.1, True, None, id="wuest-0.1"),
    pytest.param(1.0, True, None, id="wuest-1"),
    # old model: Cd 0.12 at Re 10, 0.32 at 100, 0.54 at 1000; reference ~0.61 (Wuest capped)
    pytest.param(10.0, False, 0.4, id="improved-10"),
    pytest.param(100.0, False, 0.59, id="improved-100"),
    pytest.param(1000.0, False, 0.59, id="improved-1000"),
])
def test_laminar_limit_follows_wuest(re, wuest, cd_min):
    if wuest:
        assert FP.get_orifice_cd(re) == pytest.approx(0.2 * math.sqrt(re), rel=0.05)
    else:
        assert FP.get_orifice_cd(re) > cd_min


def test_turbulent_limit_and_monotonic():
    assert FP.get_orifice_cd(1e6) == pytest.approx(0.60, abs=1e-6)
    res = [10 ** (i / 4.0) for i in range(-4, 12)]   # Re 0.1 ... 1000
    cds = [FP.get_orifice_cd(r) for r in res]
    assert all(a < b for a, b in zip(cds, cds[1:]))
    assert max(cds) <= 0.60 + 1e-12





