from simulation.equipment.tank import Tank
from simulation.equipment.pipe import Pipe
from simulation.equipment.orifice import Orifice
from simulation.solver import NetworkSolver

print("--- Starting WalFlow Solver Test - Version Orifice ---")

# 1. Build the Equipment
# Tank A is 10 meters up in the air (High Pressure)
tank_a = Tank(name="Source Tank", elevation=10.0, fluid_level=5.0)

# The Pipe is 100 meters long, with an internal diameter of 0.1 meters
pipe = Pipe(name="Main Line", length=100.0, diameter=0.1, friction_factor=0.02)

# The Orifice is 0.05 meters in diameter
orifice = Orifice(name="Orifice", pipe_diameter=0.1, orifice_diameter=0.07)

# Tank B is on the ground (Low Pressure)
tank_b = Tank(name="Destination Tank", elevation=0.0, fluid_level=2.0)

print(f"Tank A static pressure: {tank_a.calculate():.2f} Pa")
print(f"Tank B static pressure: {tank_b.calculate():.2f} Pa")

# 2. Initialize Solver
solver = NetworkSolver(nodes=[tank_a, pipe, orifice, tank_b])

# 3. Run the Math
try:
    flow_rate = solver.solve()
    print(f"\nSUCCESS! The network stabilized at a flow rate of: {flow_rate:.5f} m^3/s")
    
    # Calculate velocity to see if it makes sense (v = Q / A)
    import math
    area = math.pi * (0.1 / 2)**2
    velocity = flow_rate / area
    print(f"Fluid Velocity in pipe: {velocity:.2f} m/s")

    print(f"Pressure drop across pipe: {pipe.calculate():.2f} Pa")
    print(f"Pressure drop across orifice: {orifice.calculate():.2f} Pa")
    
except Exception as e:
    print(f"Error: {e}")