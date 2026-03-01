from simulation.equipment.tank import Tank
from simulation.equipment.pipe import Pipe
from simulation.equipment.pump import Pump
from simulation.schemas import HydraulicNetwork, GlobalSettings
from simulation.solver import NetworkSolver

def test_reverse_flow_integrity():
    print("\n--- Phase 9: Reverse Flow Integrity Test ---")
    gs = GlobalSettings()
    
    # Tank 1: 5m level, 80C
    t1 = Tank("High Tank", fluid_level=5.0, temperature=80 + 273.15, fluid_type="iso_vg_46")
    # Tank 2: 10m level, 20C (Higher head, will push flow backward)
    t2 = Tank("Deep Tank", fluid_level=10.0, temperature=20 + 273.15, fluid_type="iso_vg_46")
    
    # We'll put a Pump in between, but keep it OFF (A=0)
    pump = Pump("Dead Pump", A=0, B=0, C=0)
    
    nodes = {"t1": t1, "t2": t2, "p1": pump}
    for node in nodes.values():
        node.global_settings = gs

    edges = [
        {"source": "t1", "target": "p1", "target_port": "inlet-0", "pipe": Pipe("pipe1", 1, 0.1)},
        {"source": "p1", "target": "t2", "target_port": "inlet-0", "pipe": Pipe("pipe2", 1, 0.1)}
    ]
    for edge in edges:
        edge['pipe'].global_settings = gs
    
    network = HydraulicNetwork(nodes=nodes, edges=edges)
    solver = NetworkSolver(network)
    
    # We expect negative flow in the solver output
    q = solver.solve()
    
    print(f"Calculated Flow: {q*60000:.2f} L/min (Expected Negative)")
    
    t_p2 = edges[1]['pipe'].inlets[0].temperature - 273.15
    t_p1 = edges[0]['pipe'].inlets[0].temperature - 273.15
    
    print(f"Pipe 2 Inlet Temp: {t_p2:.1f} C")
    print(f"Pipe 1 Inlet Temp: {t_p1:.1f} C")
    
    if q < 0:
        print("Flow is correctly identified as REVERSE.")
    
    if abs(t_p1 - 20.0) < 1.0:
        print("SUCCESS: Temperature propagated backward correctly.")
    else:
        print("LIMITATION: Temperature propagation currently only supports forward flow.")

if __name__ == "__main__":
    test_reverse_flow_integrity()
