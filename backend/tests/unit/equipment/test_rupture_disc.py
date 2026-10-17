import math

from physics_refs import solve
from simulation.equipment.pressure_source import PressureSource
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


def test_rupture_disc_intact_and_burst():
    """The disc bursts when the inlet gauge pressure reaches the burst pressure (barg) and stays burst."""
    rd = RuptureDisc(name="RD_FULL", burst_pressure_barg=15.0, bore_type="full_bore", cv=10.0)
    assert rd.lift_mode() == "closed"
    assert not rd.update_relief_state(P_ATM + 14.99e5)      # 14.99 barg
    assert not rd.is_burst
    assert rd.update_relief_state(P_ATM + 15.0e5)           # 15.00 barg
    assert rd.is_burst and rd.lift_mode() == "full"
    assert not rd.update_relief_state(P_ATM)                # latched for the run
    rd.reset_run_state()
    assert not rd.is_burst and rd.status == "intact"


def test_burst_full_bore_disc_follows_the_cv_definition():
    """Header 10 bar(a) → burst disc (5 barg) → drain; DN200 lines keep pipe losses below 1 mbar."""
    nodes = {
        "src": PressureSource("Header", source_pressure=1_000_000.0),
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
