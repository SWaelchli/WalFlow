import math
import sys
import os

# Add the project root to sys.path for importing simulation modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from simulation.equipment.tank import Tank
from simulation.equipment.pipe import Pipe
from simulation.equipment.pump import Pump
from simulation.equipment.valve import Valve
from simulation.equipment.orifice import Orifice
from simulation.equipment.filter import Filter
from simulation.equipment.heat_exchanger import HeatExchanger
from simulation.equipment.mixer import Mixer
from simulation.equipment.splitter import Splitter
from simulation.schemas import HydraulicNetwork
from simulation.solver import NetworkSolver
from simulation.fluid_utils import FluidProperties

def run_validation_test(name, nodes, edges):
    print(f"\n>>> Running Validation Test: {name} <<<")
    network = HydraulicNetwork(nodes=nodes, edges=edges)
    solver = NetworkSolver(network)
    
    try:
        q = solver.solve()
        # Return q_edges for better analysis
        return True, nodes, edges
    except Exception as e:
        print(f"  Solver Failed: {str(e)}")
        return False, None, None

def test_tank_static_pressure():
    """Verify static head: P = P_atm + rho * g * h"""
    print("\n--- Test 1: Tank Static Pressure ---")
    h, elev = 2.0, 5.0
    t1 = Tank("Source Tank", fluid_level=h, elevation=elev, temperature=293.15, fluid_type="iso_vg_46")
    v1 = Valve("Closed Valve", max_cv=0.0000001, opening_pct=0.1) 
    t2 = Tank("Sink Tank", fluid_level=0, elevation=0, temperature=293.15, fluid_type="iso_vg_46")
    
    nodes = {"t1": t1, "v1": v1, "t2": t2}
    edges = [
        {"source": "t1", "target": "v1", "pipe": Pipe("p1", 1, 0.05)},
        {"source": "v1", "target": "t2", "pipe": Pipe("p2", 1, 0.05)}
    ]
    
    success, _, _ = run_validation_test("Tank Static Head", nodes, edges)
    if not success: return

    rho = FluidProperties.get_density("iso_vg_46", 293.15)
    g = 9.81
    expected_p = 101325.0 + rho * g * (h + elev)
    actual_p = t1.outlets[0].pressure
    
    print(f"  Expected Static Pressure: {expected_p/100000:.4f} bar")
    print(f"  Actual Static Pressure:   {actual_p/100000:.4f} bar")
    
    if abs(expected_p - actual_p) < 100:
        print("  RESULT: SUCCESS")
    else:
        print("  RESULT: FAILURE")

def test_pump_curve():
    """Verify Pump Performance: dP = rho * g * (A + BQ + CQ^2)"""
    print("\n--- Test 2: Pump Curve Validation ---")
    A, B, C = 80.0, 0.0, -2000.0 
    t1 = Tank("Source", fluid_level=1.0, elevation=0, temperature=293.15, fluid_type="iso_vg_46")
    p1 = Pump("Pump", A=A, B=B, C=C)
    v1 = Valve("Valve", max_cv=0.05, opening_pct=100.0)
    t2 = Tank("Sink", fluid_level=1.0, elevation=0, temperature=293.15, fluid_type="iso_vg_46")
    
    nodes = {"t1": t1, "p1": p1, "v1": v1, "t2": t2}
    edges = [
        {"source": "t1", "target": "p1", "pipe": Pipe("p1", 1, 0.05)},
        {"source": "p1", "target": "v1", "pipe": Pipe("p2", 1, 0.05)},
        {"source": "v1", "target": "t2", "pipe": Pipe("p3", 1, 0.05)}
    ]
    
    success, _, _ = run_validation_test("Pump Curve", nodes, edges)
    if not success: return

    q = p1.outlets[0].flow_rate
    dp_pump = p1.outlets[0].pressure - p1.inlets[0].pressure
    rho = p1.inlets[0].density
    g = 9.81
    expected_head = A + B*q + C*(q**2)
    expected_dp = rho * g * expected_head
    
    print(f"  Flow Rate: {q*60000:.2f} L/min")
    print(f"  Expected dP: {expected_dp/100000:.4f} bar")
    print(f"  Actual dP:   {dp_pump/100000:.4f} bar")
    
    if abs(expected_dp - dp_pump) < 1000:
        print("  RESULT: SUCCESS")
    else:
        print("  RESULT: FAILURE")

def test_heat_exchanger():
    """Verify Heat Exchanger Energy Balance"""
    print("\n--- Test 4: Heat Exchanger Energy Balance ---")
    duty_kw = -10.0 # 10 kW cooling
    t1 = Tank("Source", fluid_level=5.0, elevation=0, temperature=333.15, fluid_type="iso_vg_46")
    # Low flow to see temperature change clearly
    v1 = Valve("Restriction", max_cv=0.001, opening_pct=100.0)
    p1 = Pump("Pump", A=20.0, B=0, C=0)
    hx = HeatExchanger("Cooler", heat_duty=duty_kw * 1000.0)
    t2 = Tank("Sink", fluid_level=1.0, elevation=0, temperature=293.15, fluid_type="iso_vg_46")
    
    nodes = {"t1": t1, "p1": p1, "v1": v1, "hx": hx, "t2": t2}
    edges = [
        {"source": "t1", "target": "p1", "pipe": Pipe("p1", 1, 0.05)},
        {"source": "p1", "target": "v1", "pipe": Pipe("pv", 1, 0.05)},
        {"source": "v1", "target": "hx", "pipe": Pipe("phx", 1, 0.05)},
        {"source": "hx", "target": "t2", "pipe": Pipe("p2", 1, 0.05)}
    ]
    
    success, _, _ = run_validation_test("Heat Exchanger", nodes, edges)
    if not success: return

    t_in, t_out = hx.inlets[0].temperature, hx.outlets[0].temperature
    rho, cp = hx.inlets[0].density, 2000.0
    q = hx.inlets[0].flow_rate
    mass_flow = q * rho
    
    expected_dt = (duty_kw * 1000.0) / (mass_flow * cp) if mass_flow > 0 else 0
    actual_dt = t_out - t_in
    
    print(f"  Flow Rate: {q*60000:.2f} L/min, Mass Flow: {mass_flow:.4f} kg/s")
    print(f"  Actual DT: {actual_dt:.2f} K, Expected DT: {expected_dt:.2f} K")
    
    if abs(expected_dt - actual_dt) < 0.1:
        print("  RESULT: SUCCESS")
    else:
        print(f"  RESULT: FAILURE (HX Delta T mismatch. Density={rho:.1f})")

def test_mass_balance():
    """Verify Mixer Mass Balance"""
    print("\n--- Test 5: Mixer Mass Balance ---")
    t1 = Tank("T1", fluid_level=10, temperature=300, fluid_type="iso_vg_46")
    t2 = Tank("T2", fluid_level=8, temperature=300, fluid_type="iso_vg_46") # Same temp to isolate mass vs vol
    mix = Mixer("Mixer")
    v_load = Valve("Load", max_cv=0.01, opening_pct=100.0)
    t_out = Tank("Out", fluid_level=0, temperature=300, fluid_type="iso_vg_46")
    
    nodes = {"t1": t1, "t2": t2, "mix": mix, "vl": v_load, "out": t_out}
    edges = [
        {"source": "t1", "target": "mix", "target_port": "inlet-0", "pipe": Pipe("p1", 1, 0.05)},
        {"source": "t2", "target": "mix", "target_port": "inlet-1", "pipe": Pipe("p2", 1, 0.05)},
        {"source": "mix", "target": "vl", "pipe": Pipe("p3", 1, 0.05)},
        {"source": "vl", "target": "out", "pipe": Pipe("p4", 1, 0.05)}
    ]
    
    success, _, _ = run_validation_test("Mixer Balance", nodes, edges)
    if not success: return

    q1, q2 = mix.inlets[0].flow_rate, mix.inlets[1].flow_rate
    q_out = mix.outlets[0].flow_rate
    
    print(f"  Q_in1: {q1*60000:.2f} L/min, Q_in2: {q2*60000:.2f} L/min")
    print(f"  Sum Q_in: {(q1+q2)*60000:.2f} L/min")
    print(f"  Q_out:   {q_out*60000:.2f} L/min")
    
    if abs((q1 + q2) - q_out) < 1e-9:
        print("  RESULT: SUCCESS")
    else:
        print("  RESULT: FAILURE (Volumetric balance mismatch)")

def test_orifice_scaling():
    """Verify Orifice Diameter Scaling"""
    print("\n--- Test 6: Orifice Scaling ---")
    t1 = Tank("S", fluid_level=5, fluid_type="iso_vg_46")
    o1 = Orifice("O1", pipe_diameter=0.1, orifice_diameter=0.05)
    t2 = Tank("T", fluid_level=0, fluid_type="iso_vg_46")
    
    nodes = {"t1": t1, "o1": o1, "t2": t2}
    edges = [
        {"source": "t1", "target": "o1", "pipe": Pipe("p1", 1, 0.05)},
        {"source": "o1", "target": "t2", "pipe": Pipe("p2", 1, 0.05)}
    ]
    
    run_validation_test("Orifice 50mm", nodes, edges)
    q1 = o1.outlets[0].flow_rate
    dp1 = o1.inlets[0].pressure - o1.outlets[0].pressure
    
    o1.orifice_diameter = 0.025
    run_validation_test("Orifice 25mm", nodes, edges)
    q2 = o1.outlets[0].flow_rate
    dp2 = o1.inlets[0].pressure - o1.outlets[0].pressure
    
    print(f"  50mm: {q1*60000:.2f} L/min, dP: {dp1/100000:.4f} bar")
    print(f"  25mm: {q2*60000:.2f} L/min, dP: {dp2/100000:.4f} bar")
    
    if dp2 > dp1 and q2 < q1:
        print("  RESULT: SUCCESS")
    else:
        print("  RESULT: FAILURE")

if __name__ == "__main__":
    test_tank_static_pressure()
    test_pump_curve()
    test_heat_exchanger()
    test_mass_balance()
    test_orifice_scaling()
