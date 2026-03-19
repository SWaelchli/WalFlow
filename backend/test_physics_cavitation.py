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

def test_centrifugal_pump_cavitation():
    print("\n--- Test: Centrifugal Pump Cavitation ---")
    gs = GlobalSettings(fluid_type="water") # Water vapor pressure is significant at high T
    
    # Scenario: Low suction pressure (Low tank level)
    # At 20C (293.15K), water vapor pressure is ~2338 Pa
    # Margin 1.2 * 2338 = 2805 Pa
    # Atmospheric pressure is 101325 Pa.
    # We need suction pressure < 2805 Pa.
    # This is impossible with an open tank at sea level unless we have a massive vacuum or it's very hot.
    
    # Let's test with a VERY hot fluid to increase vapor pressure.
    # At 100C (373.15K), water vapor pressure is 101325 Pa.
    # Safety margin 1.2 * 101325 = 121590 Pa.
    # Since suction pressure is atm + head, and head is small, 101325 + 9810 * 1 = 111135 Pa.
    # 111135 < 121590 => Cavitation warning should trigger.
    
    t1 = Tank("Source", fluid_level=1.0, elevation=0, temperature=373.15, fluid_type="water")
    p1 = CentrifugalPump("Pump", A=20, B=0, C=0)
    t2 = Tank("Sink", fluid_level=1.0, elevation=0, temperature=373.15, fluid_type="water")
    
    nodes = {"t1": t1, "p1": p1, "t2": t2}
    edges = [
        {"source": "t1", "target": "p1", "pipe": Pipe("p1", 1, 0.05)},
        {"source": "p1", "target": "t2", "pipe": Pipe("p2", 1, 0.05)}
    ]
    
    network = HydraulicNetwork(nodes=nodes, edges=edges)
    for n in nodes.values(): n.global_settings = gs
    for e in edges: e['pipe'].global_settings = gs
    
    solver = NetworkSolver(network)
    solver.solve()
    
    print(f"  Fluid Temp: {t1.temperature - 273.15:.1f} C")
    print(f"  Suction Pressure: {p1.inlets[0].pressure:.1f} Pa")
    print(f"  Cavitation Warning: {p1.cavitation_warning}")
    
    assert p1.cavitation_warning == True
    print("  RESULT: SUCCESS")

def test_volumetric_pump_cavitation():
    print("\n--- Test: Volumetric Pump Cavitation ---")
    gs = GlobalSettings(fluid_type="water")
    
    # Same scenario for Volumetric Pump
    t1 = Tank("Source", fluid_level=1.0, elevation=0, temperature=373.15, fluid_type="water")
    p1 = VolumetricPump("Pump", flow_rated=0.001, motor_power=5000, efficiency=0.85)
    t2 = Tank("Sink", fluid_level=1.0, elevation=0, temperature=373.15, fluid_type="water")
    
    nodes = {"t1": t1, "p1": p1, "t2": t2}
    edges = [
        {"source": "t1", "target": "p1", "pipe": Pipe("p1", 1, 0.05)},
        {"source": "p1", "target": "t2", "pipe": Pipe("p2", 1, 0.05)}
    ]
    
    network = HydraulicNetwork(nodes=nodes, edges=edges)
    for n in nodes.values(): n.global_settings = gs
    for e in edges: e['pipe'].global_settings = gs
    
    solver = NetworkSolver(network)
    solver.solve()
    
    print(f"  Fluid Temp: {t1.temperature - 273.15:.1f} C")
    print(f"  Suction Pressure: {p1.inlets[0].pressure:.1f} Pa")
    print(f"  Cavitation Warning: {p1.cavitation_warning}")
    
    assert p1.cavitation_warning == True
    print("  RESULT: SUCCESS")

if __name__ == "__main__":
    test_centrifugal_pump_cavitation()
    test_volumetric_pump_cavitation()
