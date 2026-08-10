import pytest
from simulation.equipment.tank import Tank
from simulation.equipment.volumetric_pump import VolumetricPump
from simulation.equipment.rupture_disc import RuptureDisc
from simulation.equipment.pipe import Pipe
from simulation.schemas import HydraulicNetwork
from simulation.solver import NetworkSolver

def test_rupture_disc_intact_and_burst():
    """Test that Rupture Disc remains intact below burst pressure and bursts when pressure exceeds threshold."""
    rd_full = RuptureDisc(name="RD_FULL", burst_pressure_bar=15.0, bore_type="full_bore", cv=10.0)

    # Below burst pressure (10 bar) -> Intact
    dp_intact = rd_full.calculate_delta_p(flow_rate=0.001, density=850.0, viscosity=0.03, p_in_pa=1000000.0)
    assert rd_full.status == "intact"
    assert not rd_full.is_burst

    # Above burst pressure (20 bar) -> Burst
    dp_burst = rd_full.calculate_delta_p(flow_rate=0.001, density=850.0, viscosity=0.03, p_in_pa=2000000.0)
    assert rd_full.status == "burst"
    assert rd_full.is_burst
    assert dp_burst < dp_intact

def test_rupture_disc_full_bore_vs_reduced_bore():
    """Test that Reduced Bore Rupture Disc creates higher pressure drop than Full Bore."""
    rd_full = RuptureDisc(name="RD_FULL", burst_pressure_bar=10.0, bore_type="full_bore", cv=10.0)
    rd_red = RuptureDisc(name="RD_RED", burst_pressure_bar=10.0, bore_type="reduced_bore", pipe_diameter=0.05248, orifice_diameter=0.008)

    # Trigger burst on both
    dp_full = rd_full.calculate_delta_p(flow_rate=0.001, density=850.0, viscosity=0.03, p_in_pa=2000000.0)
    dp_red = rd_red.calculate_delta_p(flow_rate=0.001, density=850.0, viscosity=0.03, p_in_pa=2000000.0)

    assert rd_full.is_burst and rd_red.is_burst
    # Orifice restriction should create a measurable permanent pressure loss
    assert dp_red > dp_full
