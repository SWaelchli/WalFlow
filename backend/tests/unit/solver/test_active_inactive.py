import pytest

pytestmark = pytest.mark.audit("F3-16")

import pytest

from physics_refs import water_head
from simulation.equipment.tank import Tank
from simulation.equipment.pipe import Pipe
from simulation.equipment.centrifugal_pump import CentrifugalPump
from simulation.equipment.volumetric_pump import VolumetricPump
from simulation.equipment.heat_exchanger import HeatExchanger
from simulation.schemas import HydraulicNetwork, GlobalSettings
from simulation.solver import NetworkSolver

def test_inactive_centrifugal_pump():
    """
    Verify that an inactive centrifugal pump generates 0 pressure boost.
    """
    gs = GlobalSettings(fluid_type="water")
    
    t1 = Tank("Source", fluid_level=2.0, elevation=0.0, temperature=293.15, fluid_type="water")
    p1 = CentrifugalPump("Pump", flow_rated=100.0/60000.0, head_rated=water_head(5.0*100000.0), rise_to_shutoff_pct=20.0)
    p1.active = False  # Set to inactive
    t2 = Tank("Sink", fluid_level=1.0, elevation=0.0, temperature=293.15, fluid_type="water")

    nodes = {"t1": t1, "p1": p1, "t2": t2}
    edges = [
        {"source": "t1", "target": "p1", "pipe": Pipe("p1", 1.0, 0.05)},
        {"source": "p1", "target": "t2", "pipe": Pipe("p2", 1.0, 0.05)}
    ]
    
    network = HydraulicNetwork(nodes=nodes, edges=edges)
    for n in nodes.values(): n.global_settings = gs
    for e in edges: e['pipe'].global_settings = gs

    solver = NetworkSolver(network)
    solver.solve()

    # The flow rate should be positive because of gravity (elevation and level difference)
    q = p1.inlets[0].flow_rate
    dp_pump = p1.outlets[0].pressure - p1.inlets[0].pressure
    
    assert q > 0
    # D2: a stopped pump is a locked-rotor resistance, rated head lost at rated flow
    q_r = 100.0 / 60000.0
    rho = p1.inlets[0].density
    x = q / q_r
    assert dp_pump == pytest.approx(-rho * 9.81 * water_head(5.0e5) * (0.95 * x * abs(x) + 0.05 * x), rel=1e-3)
    assert dp_pump < 0


def test_f3_16_stopped_pump_between_equal_heads_passes_no_flow():
    gs = GlobalSettings(fluid_type="water")
    t1 = Tank("Source", fluid_level=1.0, temperature=293.15)
    p1 = CentrifugalPump("Pump", flow_rated=100.0/60000.0, head_rated=water_head(5.0e5), rise_to_shutoff_pct=20.0)
    p1.active = False
    t2 = Tank("Sink", fluid_level=1.0, temperature=293.15)
    nodes = {"t1": t1, "p1": p1, "t2": t2}
    edges = [
        {"source": "t1", "target": "p1", "pipe": Pipe("p1", 1.0, 0.05)},
        {"source": "p1", "target": "t2", "pipe": Pipe("p2", 1.0, 0.05)}
    ]
    for n in nodes.values(): n.global_settings = gs
    for e in edges: e['pipe'].global_settings = gs
    NetworkSolver(HydraulicNetwork(nodes=nodes, edges=edges)).solve()
    # < 0.1 % of rated flow; the remainder is the solver's residual tolerance (~5 Pa, B1b)
    assert abs(p1.inlets[0].flow_rate) * 60000.0 < 0.05  # L/min

def test_inactive_volumetric_pump():
    """
    Verify that an inactive volumetric pump blocks flow (acts like a closed valve/high resistance).
    """
    gs = GlobalSettings(fluid_type="water")
    
    t1 = Tank("Source", fluid_level=5.0, elevation=0.0, temperature=293.15, fluid_type="water")
    p1 = VolumetricPump("VolPump", flow_rated=100.0/60000.0, motor_power=5000.0, efficiency=0.85)
    p1.active = False  # Set to inactive
    t2 = Tank("Sink", fluid_level=1.0, elevation=0.0, temperature=293.15, fluid_type="water")

    nodes = {"t1": t1, "p1": p1, "t2": t2}
    edges = [
        {"source": "t1", "target": "p1", "pipe": Pipe("p1", 1.0, 0.05)},
        {"source": "p1", "target": "t2", "pipe": Pipe("p2", 1.0, 0.05)}
    ]
    
    network = HydraulicNetwork(nodes=nodes, edges=edges)
    for n in nodes.values(): n.global_settings = gs
    for e in edges: e['pipe'].global_settings = gs

    solver = NetworkSolver(network)
    solver.solve()

    q = p1.inlets[0].flow_rate
    
    # Flow rate should be extremely close to 0 because the inactive volumetric pump blocks it
    assert abs(q) < 1e-6

def test_inactive_heat_exchanger():
    """
    Verify that an inactive heat exchanger has no cooling/heating effect (Ti == To).
    """
    gs = GlobalSettings(fluid_type="water")
    
    t1 = Tank("Source", fluid_level=2.0, elevation=0.0, temperature=330.15, fluid_type="water") # Hot inlet 57°C
    hx = HeatExchanger(
        name="Cooler",
        rated_cooling_kw=50.0,
        rated_flow_lmin=100.0,
        design_inlet_temp_c=50.0,
        medium_temp_c=10.0,
        pressure_drop_factor=10.0
    )
    hx.active = False  # Set to inactive
    t2 = Tank("Sink", fluid_level=1.0, elevation=0.0, temperature=293.15, fluid_type="water")

    nodes = {"t1": t1, "hx": hx, "t2": t2}
    edges = [
        {"source": "t1", "target": "hx", "pipe": Pipe("p1", 1.0, 0.05)},
        {"source": "hx", "target": "t2", "pipe": Pipe("p2", 1.0, 0.05)}
    ]
    
    network = HydraulicNetwork(nodes=nodes, edges=edges)
    for n in nodes.values(): n.global_settings = gs
    for e in edges: e['pipe'].global_settings = gs

    solver = NetworkSolver(network)
    solver.solve()

    t_in = hx.inlets[0].temperature
    t_out = hx.outlets[0].temperature
    
    assert abs(t_in - t_out) < 1e-6
    assert hx.actual_duty_kw == 0.0
