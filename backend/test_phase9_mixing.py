from simulation.equipment.tank import Tank
from simulation.equipment.pipe import Pipe
from simulation.equipment.mixer import Mixer
from simulation.schemas import HydraulicNetwork
from simulation.solver import NetworkSolver

def test_thermal_mixing():
    print("\n--- Phase 9: Thermal Mixing Integrity Test ---")
    
    # Tank 1: Hot Oil (80C), 10m head
    t_hot = Tank("Hot Tank", fluid_level=10.0, temperature=80 + 273.15, fluid_type="iso_vg_46")
    # Tank 2: Cold Oil (20C), 5m head
    t_cold = Tank("Cold Tank", fluid_level=5.0, temperature=20 + 273.15, fluid_type="iso_vg_46")
    
    mix = Mixer("Mixing Junction", num_inlets=2)
    t_sink = Tank("Return Tank", fluid_level=0.0, temperature=20 + 273.15, fluid_type="iso_vg_46")
    
    nodes = {"t1": t_hot, "t2": t_cold, "mix": mix, "t3": t_sink}
    
    # We use different diameters to get different flow rates
    edges = [
        {"source": "t1", "target": "mix", "target_port": "inlet-0", "pipe": Pipe("p_hot", 5, 0.05)},
        {"source": "t2", "target": "mix", "target_port": "inlet-1", "pipe": Pipe("p_cold", 5, 0.08)}, # Larger pipe for cold side
        {"source": "mix", "target": "t3", "target_port": "inlet-0", "pipe": Pipe("p_out", 5, 0.08)}
    ]
    
    network = HydraulicNetwork(nodes=nodes, edges=edges)
    solver = NetworkSolver(network)
    solver.solve()
    
    # Get results from Mixer outlets
    q_h = edges[0]['pipe'].outlets[0].flow_rate
    rho_h = edges[0]['pipe'].outlets[0].density
    t_h = edges[0]['pipe'].outlets[0].temperature
    
    q_c = edges[1]['pipe'].outlets[0].flow_rate
    rho_c = edges[1]['pipe'].outlets[0].density
    t_c = edges[1]['pipe'].outlets[0].temperature
    
    q_out = mix.outlets[0].flow_rate
    t_mix_sim = mix.outlets[0].temperature
    
    # Theoretical Mixing Math: T_out = (m1*T1 + m2*T2) / (m1 + m2)
    m_h = q_h * rho_h
    m_c = q_c * rho_c
    t_mix_theory = (m_h * t_h + m_c * t_c) / (m_h + m_c)
    
    print(f"Hot Stream:  {q_h*60000:6.1f} L/min @ {t_h-273.15:4.1f} C")
    print(f"Cold Stream: {q_c*60000:6.1f} L/min @ {t_c-273.15:4.1f} C")
    print(f"Mixed Out:   {q_out*60000:6.1f} L/min")
    print("-" * 40)
    print(f"Simulated Mix Temp:  {t_mix_sim - 273.15:.2f} C")
    print(f"Theoretical Mix Temp: {t_mix_theory - 273.15:.2f} C")
    
    error = abs(t_mix_sim - t_mix_theory)
    if error < 0.1:
        print("\nSUCCESS: Thermal mixing energy balance verified!")
    else:
        print(f"\nFAILURE: Mixing error too high ({error:.4f} K)")

if __name__ == "__main__":
    test_thermal_mixing()
