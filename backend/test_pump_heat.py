import sys
import os

# Add backend to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from simulation.equipment.tank import Tank
from simulation.equipment.pipe import Pipe
from simulation.equipment.centrifugal_pump import CentrifugalPump
from simulation.equipment.volumetric_pump import VolumetricPump
from simulation.schemas import HydraulicNetwork, GlobalSettings
from simulation.solver import NetworkSolver

def test_pump_heat():
    print("\n--- Test: Pump Waste Heat (Efficiency Loss) ---")
    gs = GlobalSettings(fluid_type="iso_vg_46")
    
    # 1. Centrifugal Pump @ 50% efficiency
    t1 = Tank("Source", elevation=0.0, fluid_level=1.0, fluid_type="iso_vg_46", temperature=293.15)
    t2 = Tank("Sink", elevation=10.0, fluid_level=0.0, fluid_type="iso_vg_46", temperature=293.15)
    
    pump = CentrifugalPump("Pump", flow_rated=0.01, pressure_rated=1000000.0, efficiency=0.5)
    
    nodes = {"t1": t1, "t2": t2, "p1": pump}
    edges = [
        {"id": "e1", "source": "t1", "target": "p1", "source_port": "outlet-0", "target_port": "inlet-0", "pipe": Pipe("P1", 1.0, 0.1)},
        {"id": "e2", "source": "p1", "target": "t2", "source_port": "outlet-0", "target_port": "inlet-0", "pipe": Pipe("P2", 1.0, 0.1)}
    ]
    
    network = HydraulicNetwork(nodes=nodes, edges=edges)
    network.global_settings = gs
    
    solver = NetworkSolver(network)
    solver.solve()
    
    dt = pump.outlets[0].temperature - pump.inlets[0].temperature
    dp = pump.outlets[0].pressure - pump.inlets[0].pressure
    
    print(f"  Centrifugal (50% Eff):")
    print(f"    Boost: {dp/100000:.2f} bar")
    print(f"    Temp Rise: {dt:.4f} K")
    
    assert dt > 0
    
    # 2. Volumetric Pump @ 10% efficiency
    p2 = VolumetricPump("PD-Pump", flow_rated=0.001, motor_power=50000.0, efficiency=0.1)
    nodes_v = {"t1": t1, "t2": t2, "p2": p2}
    edges_v = [
        {"id": "e1", "source": "t1", "target": "p2", "source_port": "outlet-0", "target_port": "inlet-0", "pipe": Pipe("P1", 1.0, 0.1)},
        {"id": "e2", "source": "p2", "target": "t2", "source_port": "outlet-0", "target_port": "inlet-0", "pipe": Pipe("P2", 1.0, 0.1)}
    ]
    network_v = HydraulicNetwork(nodes=nodes_v, edges=edges_v)
    network_v.global_settings = gs
    
    solver_v = NetworkSolver(network_v)
    solver_v.solve()
    
    dt_v = p2.outlets[0].temperature - p2.inlets[0].temperature
    print(f"  Volumetric (10% Eff):")
    print(f"    Boost: {(p2.outlets[0].pressure - p2.inlets[0].pressure)/100000:.2f} bar")
    print(f"    Temp Rise: {dt_v:.4f} K")
    
    assert dt_v > dt
    print("  SUCCESS: Pump heating logic verified.")

if __name__ == "__main__":
    test_pump_heat()
