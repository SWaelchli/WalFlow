import math

import pytest
from physics_refs import solve
from simulation.equipment.pressure_boundary import PressureBoundary
from simulation.equipment.tank import Tank
from simulation.equipment.rupture_disc import RuptureDisc
from simulation.equipment.pipe import Pipe
from simulation.fluid_utils import FluidProperties

P_ATM = 101325.0
GPM = 15850.3231        # (US gal/min) per (m³/s)
PSI = 6894.757          # Pa per psi


def cv_flow_m3s(cv: float, dp_pa: float, rho: float) -> float:
    """US flow-coefficient definition: Q[gpm] = Cv·√(ΔP[psi] / SG), SG relative to water at 60 °F (999 kg/m³)."""
    return cv * math.sqrt((dp_pa / PSI) / (rho / 999.0)) / GPM


@pytest.mark.parametrize("outlet_barg, inlet_barg, bursts", [
    pytest.param(3.0, 12.9, False, id="pressurised_outlet_intact_below_differential"),
    pytest.param(3.0, 13.0, True, id="pressurised_outlet_bursts_at_burst_plus_backpressure"),
    pytest.param(3.0, 10.0, False, id="pressurised_outlet_intact_at_gauge_burst_pressure"),
    pytest.param(0.0, 9.99, False, id="atmospheric_outlet_intact_below_burst"),
    pytest.param(0.0, 10.0, True, id="atmospheric_outlet_bursts_at_burst"),
])
def test_rupture_disc_intact_and_burst(outlet_barg, inlet_barg, bursts):
    """ISO 4126-2: the burst pressure is the differential inlet - outlet, so a back pressure raises the inlet needed.
    A burst disc stays burst for the run until the run state is reset."""
    rd = RuptureDisc("RD", burst_pressure_barg=10.0, bore_type="full_bore", cv=10.0)
    assert rd.lift_mode() == "closed"
    assert rd.update_relief_state(P_ATM + inlet_barg * 1e5, P_ATM + outlet_barg * 1e5) is bursts
    assert rd.is_burst is bursts
    if bursts:
        assert rd.lift_mode() == "full"
        assert not rd.update_relief_state(P_ATM, P_ATM)     # latched for the run
        assert rd.is_burst
    rd.reset_run_state()
    assert not rd.is_burst and rd.status == "intact"


def test_rupture_disc_opening_pressure_and_rated_flow_follow_the_outlet():
    """The inlet opening pressure is outlet + burst pressure; the rated condition is the differential 1.1 x burst
    pressure whatever the outlet pressure."""
    rd = RuptureDisc("RD", burst_pressure_barg=10.0, cv=10.0)
    rd.outlets[0].pressure = P_ATM + 3e5
    assert rd.opening_depends_on_outlet is True
    assert rd.inlet_opening_pressure_pa() == pytest.approx(P_ATM + 13e5, abs=1.0)
    assert rd.opening_pressure_barg == pytest.approx(13.0, abs=1e-6)     # outlet gauge 3 + burst 10
    rho, mu = 998.0, 0.001
    q_atm = rd.rated_flow(0.001, rho, mu, P_ATM)
    assert q_atm > 0.0
    assert rd.rated_flow(0.001, rho, mu, P_ATM + 3e5) == pytest.approx(q_atm, rel=1e-9)


def test_burst_full_bore_disc_follows_the_cv_definition():
    """Header 10 bar(a) → burst disc (5 barg) → drain; DN200 lines keep pipe losses below 1 mbar."""
    nodes = {
        "src": PressureBoundary("Header", set_pressure=1_000_000.0),
        "rd": RuptureDisc("RD-1", burst_pressure_barg=5.0, cv=10.0),
        "t": Tank("Drain", fluid_level=0.0),
    }
    edges = [
        {"id": "e1", "source": "src", "target": "rd", "pipe": Pipe("p1", 1.0, 0.2)},
        {"id": "e2", "source": "rd", "target": "t", "pipe": Pipe("p2", 1.0, 0.2)},
    ]
    stats = solve(nodes, edges)
    rd = nodes["rd"]
    assert stats["success"] and rd.is_burst and rd.status in ("burst", "overcapacity")
    rho = FluidProperties.get_density("water", 293.15)
    dp = rd.inlets[0].pressure - rd.outlets[0].pressure
    assert abs(dp - (1_000_000.0 - P_ATM)) < 200.0
    assert math.isclose(rd.inlets[0].flow_rate, cv_flow_m3s(10.0, dp, rho), rel_tol=0.005)


def test_rupture_disc_full_bore_vs_reduced_bore():
    """Test that Reduced Bore Rupture Disc creates higher pressure drop than Full Bore."""
    rd_full = RuptureDisc(name="RD_FULL", burst_pressure_barg=10.0, bore_type="full_bore", cv=10.0)
    rd_red = RuptureDisc(name="RD_RED", burst_pressure_barg=10.0, bore_type="reduced_bore", pipe_diameter=0.05248, orifice_diameter=0.008)

    dp_full = rd_full.open_dp(0.001, 850.0, 0.03)
    dp_red = rd_red.open_dp(0.001, 850.0, 0.03)
    # Orifice restriction should create a measurable permanent pressure loss
    assert dp_red > dp_full > 0.0
