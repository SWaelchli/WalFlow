import sys
import os
import math

# Add backend to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from simulation.equipment.tank import Tank
from simulation.equipment.pipe import Pipe
from simulation.equipment.pump import Pump
from simulation.equipment.linear_regulator import LinearRegulator
from simulation.schemas import HydraulicNetwork, GlobalSettings
from simulation.solver import NetworkSolver

def run_regulator_test(name, nodes, edges, set_pa, is_backpressure):
    print(f"\n>>> Running Regulator Test: {name} <<<")
    gs = GlobalSettings()
    network = HydraulicNetwork(nodes=nodes, edges=edges)
    
    for node in nodes.values():
        node.global_settings = gs
    for edge in edges:
        edge['pipe'].global_settings = gs

    solver = NetworkSolver(network)
    try:
        solver.solve()
        
        # Diagnostics
        reg = nodes['reg']
        p_in = reg.inlets[0].pressure
        p_out = reg.outlets[0].pressure
        sensed = p_in if is_backpressure else p_out
        opening = reg.opening_pct
        q = reg.inlets[0].flow_rate
        
        # Velocity in a 1" NPS Pipe (ID approx 26.6mm)
        area = math.pi * (0.0266 / 2)**2
        velocity = abs(q) / area if area > 0 else 0
        
        error_bar = (sensed - set_pa) / 100000.0
        
        print(f"  Flow:          {q*60000:.1f} L/min")
        print(f"  Velocity:      {velocity:.2f} m/s")
        print(f"  Final Sensed:  {sensed/100000:.2f} bar (Target: {set_pa/100000:.2f})")
        print(f"  Valve Opening: {opening:.1f} %")
        print(f"  Error:         {error_bar:.3f} bar")

        # Success Logic
        if abs(error_bar) < 0.1: # 100 mbar tolerance
            print("  RESULT: SUCCESS (Regulated)")
            return True
        elif opening >= 99.9:
            print("  RESULT: SUCCESS (Saturated - Fully Open)")
            return True
        elif opening <= 0.15:
            print("  RESULT: SUCCESS (Saturated - Fully Closed)")
            return True
        else:
            print("  RESULT: FAILURE")
            return False

    except Exception as e:
        print(f"  Solver Error: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_all_scenarios():
    # 1" NPS ID is approx 0.0266 m
    id_1inch = 0.0266
    
    # 1. PRV Baseline (Source 6 bar -> Set 3 bar)
    # Source 50m head -> ~6 bar abs
    set_pa = 3.0 * 100000 + 101325
    t1 = Tank("Source", fluid_level=50.0) 
    reg = LinearRegulator("PRV", max_cv=5.0, set_pressure=set_pa, backpressure=False)
    t2 = Tank("Sink", fluid_level=0.0)
    nodes = {"t1": t1, "reg": reg, "t2": t2}
    edges = [
        {"source": "t1", "target": "reg", "pipe": Pipe("p1", 5, id_1inch)},
        {"source": "reg", "target": "t2", "pipe": Pipe("p2", 5, id_1inch)}
    ]
    run_regulator_test("PRV Throttling", nodes, edges, set_pa, False)

    # 2. BPR Baseline (Pump ~11 bar -> Set 8 bar)
    set_pa = 8.0 * 100000 + 101325
    t1 = Tank("Source", fluid_level=1.0)
    p1 = Pump("Feed Pump", A=100.0, B=0, C=0) # 100m head ~ 10bar + 1atm
    reg = LinearRegulator("BPR", max_cv=5.0, set_pressure=set_pa, backpressure=True)
    t2 = Tank("Sink", fluid_level=1.0)
    nodes = {"t1": t1, "p1": p1, "reg": reg, "t2": t2}
    edges = [
        {"source": "t1", "target": "p1", "pipe": Pipe("p1", 1, id_1inch)},
        {"source": "p1", "target": "reg", "pipe": Pipe("p2", 1, id_1inch)},
        {"source": "reg", "target": "t2", "pipe": Pipe("p3", 1, id_1inch)}
    ]
    run_regulator_test("BPR Throttling", nodes, edges, set_pa, True)

if __name__ == "__main__":
    test_all_scenarios()
