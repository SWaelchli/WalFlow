import sys
import os

# Add backend to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from simulation.equipment.tank import Tank
from simulation.equipment.pipe import Pipe
from simulation.equipment.orifice import Orifice
from simulation.schemas import HydraulicNetwork, GlobalSettings
from simulation.solver import NetworkSolver

def run_test(name, gs, t1_elev, t2_elev):
    print(f"\n--- Test: {name} ---")
    
    # Setup: Tank -> Orifice -> Tank
    t1 = Tank("Tank1", elevation=t1_elev, fluid_level=0.0, fluid_type=gs.fluid_type, temperature=293.15)
    t2 = Tank("Tank2", elevation=t2_elev, fluid_level=0.0, fluid_type=gs.fluid_type, temperature=293.15)
    
    ori = Orifice("Restriction", pipe_diameter=0.05, orifice_diameter=0.005)
    
    nodes = {"t1": t1, "t2": t2, "ori": ori}
    edges = [
        {"id": "e1", "source": "t1", "target": "ori", "source_port": "outlet-0", "target_port": "inlet-0", "pipe": Pipe("P1", 1.0, 0.05)},
        {"id": "e2", "source": "ori", "target": "t2", "source_port": "outlet-0", "target_port": "inlet-0", "pipe": Pipe("P2", 1.0, 0.05)}
    ]
    
    network = HydraulicNetwork(nodes=nodes, edges=edges)
    network.global_settings = gs
    
    solver = NetworkSolver(network)
    solver.solve()
    
    q = ori.inlets[0].flow_rate
    p_in = ori.inlets[0].pressure
    p_out = ori.outlets[0].pressure
    t_in = ori.inlets[0].temperature
    t_out = ori.outlets[0].temperature
    
    print(f"  Flow: {q*60000:.2f} L/min")
    print(f"  P_in: {p_in/100000:.2f} bar, P_out: {p_out/100000:.2f} bar")
    print(f"  T_in: {t_in - 273.15:.4f} C, T_out: {t_out - 273.15:.4f} C")
    
    if q >= 0:
        # Forward: T_out should be higher
        dt = t_out - t_in
        print(f"  Forward Rise: {dt:.4f} K")
        assert dt > 0
    else:
        # Reverse: T_in should be higher
        dt = t_in - t_out
        print(f"  Reverse Rise: {dt:.4f} K")
        assert dt > 0
    
    print("  SUCCESS")

def test_throttling_heat():
    gs = GlobalSettings(fluid_type="iso_vg_46")
    
    # 1. Forward Flow (Tank1 at 1000m, Tank2 at 0m)
    run_test("Forward Flow Heat", gs, 1000.0, 0.0)
    
    # 2. Reverse Flow (Tank1 at 0m, Tank2 at 1000m)
    run_test("Reverse Flow Heat", gs, 0.0, 1000.0)

if __name__ == "__main__":
    test_throttling_heat()
