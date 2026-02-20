from simulation.equipment.tank import Tank
from simulation.equipment.pipe import Pipe
from simulation.equipment.pump import Pump
from simulation.schemas import HydraulicNetwork
from simulation.solver import NetworkSolver

def test_viscosity_impact():
    print("\n--- Phase 9: Temperature/Viscosity Impact Test ---")
    
    # We'll use ISO VG 46 Oil
    # At 20°C (293.15 K), viscosity is high.
    # At 80°C (353.15 K), viscosity is low.
    
    def solve_for_temp(temp_c):
        temp_k = temp_c + 273.15
        
        # Setup: Tank -> Pump -> Pipe -> Tank
        tank_source = Tank("Oil Tank", fluid_level=2.0, temperature=temp_k, fluid_type="iso_vg_46")
        pump = Pump("Main Pump", A=100.0, B=0, C=-1000.0)
        pipe = Pipe("Long Pipe", length=100.0, diameter=0.05)
        tank_sink = Tank("Return Tank", fluid_level=1.0, temperature=temp_k, fluid_type="iso_vg_46")
        
        nodes = {
            "t1": tank_source,
            "p1": pump,
            "pipe1": pipe,
            "t2": tank_sink
        }
        
        edges = [
            {"source": "t1", "target": "p1", "pipe": Pipe("p0", 1, 0.05)},
            {"source": "p1", "target": "t2", "pipe": pipe}
        ]
        
        network = HydraulicNetwork(nodes=nodes, edges=edges)
        solver = NetworkSolver(network)
        
        q = solver.solve()
        
        # Check source tank viscosity
        tank_mu = tank_source.outlets[0].viscosity
        print(f"Tank Viscosity: {tank_mu*1000:.2f} mPa.s")
        
        # Get pipe viscosity and pressure drop
        mu = pipe.inlets[0].viscosity
        dp = pipe.calculate()
        
        print(f"Temp: {temp_c}C | Viscosity: {mu*1000:.2f} mPa.s | Flow: {q*60000:.2f} L/min | Pipe dP: {dp/1000:.2f} kPa")
        return q, dp

    print("Running simulation at 20C (Cold Oil)...")
    q_cold, dp_cold = solve_for_temp(20)
    
    print("\nRunning simulation at 60C (Warm Oil)...")
    q_warm, dp_warm = solve_for_temp(60)
    
    print("\nResults Analysis:")
    if q_warm > q_cold:
        print("SUCCESS: Flow rate increased as oil warmed up (lower viscosity).")
    else:
        print("FAILURE: Flow rate did not increase with temperature.")

if __name__ == "__main__":
    test_viscosity_impact()
