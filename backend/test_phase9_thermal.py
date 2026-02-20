from simulation.equipment.tank import Tank
from simulation.equipment.pipe import Pipe
from simulation.equipment.pump import Pump
from simulation.equipment.heat_exchanger import HeatExchanger
from simulation.schemas import HydraulicNetwork
from simulation.solver import NetworkSolver

def test_thermal_balance():
    print("\n--- Phase 9: Thermal Balance Test ---")
    
    # Setup: Tank(40C) -> Pump -> HeatExchanger(Cooling) -> Tank
    temp_initial_c = 40.0
    temp_initial_k = temp_initial_c + 273.15
    
    tank_source = Tank("Hot Oil Tank", fluid_level=2.0, temperature=temp_initial_k, fluid_type="iso_vg_46")
    pump = Pump("Main Pump", A=100.0, B=0, C=-1000.0)
    # Cooling duty: -1,000,000 Watts (1 MW)
    hx = HeatExchanger("Oil Cooler", heat_duty=-1000000.0, pressure_drop_factor=0.005)
    tank_sink = Tank("Return Tank", fluid_level=1.0, temperature=temp_initial_k, fluid_type="iso_vg_46")
    
    nodes = {
        "t1": tank_source,
        "p1": pump,
        "hx1": hx,
        "t2": tank_sink
    }
    
    edges = [
        {"source": "t1", "target": "p1", "pipe": Pipe("p1", 1, 0.05)},
        {"source": "p1", "target": "hx1", "pipe": Pipe("p2", 1, 0.05)},
        {"source": "hx1", "target": "t2", "pipe": Pipe("p3", 1, 0.05)}
    ]
    
    network = HydraulicNetwork(nodes=nodes, edges=edges)
    solver = NetworkSolver(network)
    
    q = solver.solve()
    
    # Check source tank temp
    tank_t = tank_source.outlets[0].temperature - 273.15
    print(f"Tank Source Temp: {tank_t:.2f} C")
    
    t_in = hx.inlets[0].temperature - 273.15
    t_out = hx.outlets[0].temperature - 273.15
    mass_flow = q * hx.inlets[0].density
    
    print(f"Flow Rate: {q*60000:.2f} L/min ({mass_flow:.2f} kg/s)")
    print(f"HX Inlet Temp: {t_in:.2f} C")
    print(f"HX Outlet Temp: {t_out:.2f} C")
    print(f"Temperature Drop: {t_in - t_out:.2f} C")
    
    if t_out < t_in:
        print("SUCCESS: Temperature decreased across the cooler.")
    else:
        print("FAILURE: Temperature did not decrease.")

if __name__ == "__main__":
    test_thermal_balance()
