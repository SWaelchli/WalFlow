from simulation.equipment.tank import Tank
from simulation.equipment.pipe import Pipe
from simulation.equipment.pump import Pump
from simulation.equipment.filter import Filter
from simulation.schemas import HydraulicNetwork, GlobalSettings
from simulation.solver import NetworkSolver

def test_filter_viscosity():
    print("\n--- Phase 9: Filter Viscosity Impact Test ---")
    
    def solve_with_filter(temp_c):
        temp_k = temp_c + 273.15
        gs = GlobalSettings()
        
        tank_source = Tank("Oil Tank", fluid_level=2.0, temperature=temp_k, fluid_type="iso_vg_46")
        pump = Pump("Main Pump", A=100.0, B=0, C=-1000.0)
        # Filter with high resistance to make it dominant
        filt = Filter("Oil Filter", resistance_clean=1e7)
        tank_sink = Tank("Return Tank", fluid_level=1.0, temperature=temp_k, fluid_type="iso_vg_46")
        
        nodes = {"t1": tank_source, "p1": pump, "f1": filt, "t2": tank_sink}
        for node in nodes.values():
            node.global_settings = gs

        edges = [
            {"source": "t1", "target": "p1", "pipe": Pipe("p1", 1, 0.05)},
            {"source": "p1", "target": "f1", "pipe": Pipe("p2", 1, 0.05)},
            {"source": "f1", "target": "t2", "pipe": Pipe("p3", 1, 0.05)}
        ]
        for edge in edges:
            edge['pipe'].global_settings = gs
        
        network = HydraulicNetwork(nodes=nodes, edges=edges)
        solver = NetworkSolver(network)
        q = solver.solve()
        
        mu = filt.inlets[0].viscosity
        dp = filt.calculate()
        
        print(f"Temp: {temp_c}C | Viscosity: {mu*1000:.2f} mPa.s | Filter dP: {dp/1000:.2f} kPa")
        return dp

    print("Cold Oil (20C):")
    dp_cold = solve_with_filter(20)
    
    print("\nWarm Oil (60C):")
    dp_warm = solve_with_filter(60)
    
    if dp_warm < dp_cold:
        print("\nSUCCESS: Filter pressure drop decreased as oil warmed up.")
    else:
        print("\nFAILURE: Filter pressure drop did not decrease.")

if __name__ == "__main__":
    test_filter_viscosity()
