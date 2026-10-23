"""Volumetric pump: calculate_delta_p against the displacement, slip, power-limit and pressure-cap model."""
import pytest

from simulation.equipment.volumetric_pump import VolumetricPump

Q_RATED = 100.0 / 60000.0
P_IN = 1e5
HIGH_POWER = dict(motor_power=1e6, efficiency=1.0)  # high power tests the slip in isolation
SMALL_VFD = dict(motor_power=5000.0, drive_type="vfd_power_limit")


def _within(target, rel):
    lo, hi = sorted((target * (1 - rel), target * (1 + rel)))
    return lo, hi


@pytest.mark.parametrize("kwargs, q_lmin, p_in, bounds", [
    # Ideal flow: at Q = Q_rated, dP is exactly 0
    pytest.param(HIGH_POWER, 100.0, None, (0.0, 0.0), id="ideal-flow"),
    # 1 L/min drop = 1 % drop; slip is defined as 1 % drop at 100 bar, so 1 L/min is 100 bar
    pytest.param(HIGH_POWER, 99.0, None, _within(100e5, 0.01), id="slight-resistance"),
    # VFD with power limit: usable 4000 W, P = 4000 / (50/60000) = 48 bar
    pytest.param(dict(SMALL_VFD, efficiency=0.8), 50.0, None, _within(48e5, 0.01), id="power-limit"),
    # Efficiency scaling: usable 2000 W gives half of the dP
    pytest.param(dict(SMALL_VFD, efficiency=0.4), 50.0, None, _within(24e5, 0.01), id="efficiency-scaling"),
    # F1-35 aiding flow: Q > Q_rated, the pump brakes (negative dP) instead of passing freely
    pytest.param(HIGH_POWER, 101.0, None, _within(-100e5, 0.01), id="F1-35-aiding-flow"),
    # Dead head: the outlet is held at the 50 bar(a) default limit (+ max. 1 % accumulation)
    pytest.param(HIGH_POWER, 1.0, P_IN, (50e5, 50e5 * 1.01), id="dead-head"),
    # Fixed-speed drive (default) ignores the motor rating for the flow
    pytest.param(dict(motor_power=5000.0, efficiency=0.8), 50.0, P_IN, (50e5, 50e5 * 1.01), id="fixed-speed-ignores-motor-rating"),
])
def test_volumetric_pump_delta_p(kwargs, q_lmin, p_in, bounds):
    pump = VolumetricPump("TestPump", flow_rated=Q_RATED, **kwargs)
    dp = pump.calculate_delta_p(q_lmin / 60000.0, 1000.0, p_in_pa=p_in)
    value = dp if p_in is None else p_in + dp
    assert bounds[0] <= value <= bounds[1]
