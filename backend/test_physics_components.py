import sys
import os
import unittest

# Add backend to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from simulation.equipment.tank import Tank
from simulation.equipment.pipe import Pipe
from simulation.equipment.centrifugal_pump import CentrifugalPump
from simulation.equipment.linear_control_valve import LinearControlValve  
from simulation.equipment.orifice import Orifice
from simulation.equipment.filter import Filter
from simulation.equipment.heat_exchanger import HeatExchanger
from simulation.equipment.mixer import Mixer
from simulation.equipment.splitter import Splitter
from simulation.schemas import HydraulicNetwork, GlobalSettings
from simulation.solver import NetworkSolver

def test_tank_static_pressure():
    """
    Test 1: Verify static head calculation for a non-flowing system.
    P_static = rho * g * h + P_atm
    """
    print("\n--- Test 1: Tank Static Pressure ---")
    h, elev = 2.0, 5.0
    # Global settings will manage fluid properties
    gs = GlobalSettings(fluid_type="iso_vg_46")
    
    t1 = Tank("Source Tank", fluid_level=h, elevation=elev, temperature=293.15, fluid_type="iso_vg_46")
    v1 = LinearControlValve("Closed LinearControlValve", max_cv=0.0000001, opening_pct=0.1) 
    t2 = Tank("Sink Tank", fluid_level=0, elevation=0, temperature=293.15, fluid_type="iso_vg_46")

    nodes = {"t1": t1, "v1": v1, "t2": t2}
    edges = [
        {"source": "t1", "target": "v1", "pipe": Pipe("p1", 1.0, 0.05)},
        {"source": "v1", "target": "t2", "pipe": Pipe("p2", 1.0, 0.05)}
    ]
    
    network = HydraulicNetwork(nodes=nodes, edges=edges)
    for n in nodes.values(): n.global_settings = gs
    for e in edges: e['pipe'].global_settings = gs

    solver = NetworkSolver(network)
    solver.solve()

    p_expected = (870.0 * 9.81 * (h + elev)) + 101325.0
    p_actual = nodes["t1"].outlets[0].pressure

    print(f"  Expected P (SI): {p_expected:.1f} Pa")
    print(f"  Actual P (SI):   {p_actual:.1f} Pa")
    
    assert abs(p_expected - p_actual) < 500.0
    print("  RESULT: SUCCESS")

def test_pump_curve():
    """
    Test 2: Verify Pump head calculation.
    """
    print("\n--- Test 2: Pump Performance ---")
    gs = GlobalSettings(fluid_type="iso_vg_46")
    
    # 100 L/min at 5 bar duty point
    t1 = Tank("Source", fluid_level=1.0, elevation=0, temperature=293.15, fluid_type="iso_vg_46")
    p1 = CentrifugalPump("Pump", flow_rated=100.0/60000.0, pressure_rated=5.0*100000.0, rise_to_shutoff_pct=20.0)
    v1 = LinearControlValve("LinearControlValve", max_cv=50.0, opening_pct=100.0)
    t2 = Tank("Sink", fluid_level=1.0, elevation=0, temperature=293.15, fluid_type="iso_vg_46")

    nodes = {"t1": t1, "p1": p1, "v1": v1, "t2": t2}
    edges = [
        {"source": "t1", "target": "p1", "pipe": Pipe("p1", 1.0, 0.05)},
        {"source": "p1", "target": "v1", "pipe": Pipe("p2", 1.0, 0.05)},
        {"source": "v1", "target": "t2", "pipe": Pipe("p3", 1.0, 0.05)}
    ]
    
    network = HydraulicNetwork(nodes=nodes, edges=edges)
    for n in nodes.values(): n.global_settings = gs
    for e in edges: e['pipe'].global_settings = gs

    solver = NetworkSolver(network)
    q = solver.solve()

    dp_pump = p1.outlets[0].pressure - p1.inlets[0].pressure
    head_calc = dp_pump / (870.0 * 9.81)
    
    print(f"  Flow Rate: {q*60000:.1f} L/min")
    print(f"  Pump Boost: {dp_pump/100000:.2f} bar")
    print(f"  Calc Head: {head_calc:.2f} m")
    
    assert q > 0
    print("  RESULT: SUCCESS")

def test_heat_exchanger():
    """
    Test 3: Verify Heat Exchanger cooling logic.
    """
    print("\n--- Test 3: Heat Exchanger Cooling ---")
    gs = GlobalSettings(fluid_type="iso_vg_46")
    
    duty_kw = -10.0 # 10 kW cooling
    t1 = Tank("Source", fluid_level=5.0, elevation=0, temperature=333.15, fluid_type="iso_vg_46")
    # Low flow to see temperature change clearly
    v1 = LinearControlValve("Restriction", max_cv=0.001, opening_pct=100.0)
    p1 = CentrifugalPump("Pump", flow_rated=100.0/60000.0, pressure_rated=2.0*100000.0, rise_to_shutoff_pct=20.0)
    hx = HeatExchanger("Cooler", heat_duty=duty_kw * 1000.0)
    t2 = Tank("Sink", fluid_level=1.0, elevation=0, temperature=293.15, fluid_type="iso_vg_46")

    nodes = {"t1": t1, "v1": v1, "p1": p1, "hx": hx, "t2": t2}
    edges = [
        {"source": "t1", "target": "v1", "pipe": Pipe("p1", 1, 0.05)},
        {"source": "v1", "target": "p1", "pipe": Pipe("p2", 1, 0.05)},
        {"source": "p1", "target": "hx", "pipe": Pipe("p3", 1, 0.05)},
        {"source": "hx", "target": "t2", "pipe": Pipe("p4", 1, 0.05)}
    ]

    network = HydraulicNetwork(nodes=nodes, edges=edges)
    for n in nodes.values(): n.global_settings = gs
    for e in edges: e['pipe'].global_settings = gs

    solver = NetworkSolver(network)
    q = solver.solve()

    t_in = hx.inlets[0].temperature
    t_out = hx.outlets[0].temperature
    
    print(f"  Flow: {q*60000:.2f} L/min")
    print(f"  Temp In:  {t_in - 273.15:.1f} C")
    print(f"  Temp Out: {t_out - 273.15:.1f} C")

    assert t_out < t_in
    print("  RESULT: SUCCESS")

def test_mass_balance():
    """
    Test 4: Verify Mass Balance at a Junction (Mixer).
    """
    print("\n--- Test 4: Mass Balance (Mixer) ---")
    gs = GlobalSettings(fluid_type="iso_vg_46")
    
    t1 = Tank("T1", fluid_level=10, temperature=300, fluid_type="iso_vg_46")
    t2 = Tank("T2", fluid_level=8, temperature=300, fluid_type="iso_vg_46") # Same temp to isolate mass vs vol
    mix = Mixer("Mixer")
    v_load = LinearControlValve("Load", max_cv=0.01, opening_pct=100.0)   
    t_out = Tank("Out", fluid_level=0, temperature=300, fluid_type="iso_vg_46")

    nodes = {"t1": t1, "t2": t2, "mix": mix, "vl": v_load, "out": t_out}  
    edges = [
        {"source": "t1",  "target": "mix", "target_port": "inlet-0", "pipe": Pipe("p1", 1, 0.05)},
        {"source": "t2",  "target": "mix", "target_port": "inlet-1", "pipe": Pipe("p2", 1, 0.05)},
        {"source": "mix", "target": "vl",  "pipe": Pipe("p3", 1, 0.05)},
        {"source": "vl",  "target": "out", "pipe": Pipe("p4", 1, 0.05)}
    ]

    network = HydraulicNetwork(nodes=nodes, edges=edges)
    for n in nodes.values(): n.global_settings = gs
    for e in edges: e['pipe'].global_settings = gs

    solver = NetworkSolver(network)
    solver.solve()

    q1 = edges[0]['pipe'].inlets[0].flow_rate
    q2 = edges[1]['pipe'].inlets[0].flow_rate
    q_sum = q1 + q2
    q_out = edges[2]['pipe'].inlets[0].flow_rate

    print(f"  Branch 1: {q1*60000:.2f} L/min")
    print(f"  Branch 2: {q2*60000:.2f} L/min")
    print(f"  Total Out: {q_out*60000:.2f} L/min")

    assert abs(q_sum - q_out) < 1e-10
    print("  RESULT: SUCCESS")

if __name__ == "__main__":
    test_tank_static_pressure()
    test_pump_curve()
    test_heat_exchanger()
    test_mass_balance()
