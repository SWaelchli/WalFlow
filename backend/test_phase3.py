from simulation.equipment.tank import Tank
from simulation.equipment.pipe import Pipe
from simulation.equipment.orifice import Orifice
from simulation.equipment.valve import Valve
from simulation.equipment.pump import Pump
from simulation.solver import NetworkSolver

print("--- Starting WalFlow Solver Test - Phase 3 (Full Assembly) ---")

# 1. Build the Equipment
# Source Tank is on the ground
tank_a = Tank(name="Source Tank", elevation=0.0, fluid_level=2.0)

# The Centrifugal Pump (Shutoff head: 50m. Curve steepness: -2000)
# Curve: H = 50 - 2000 * Q^2
pump = Pump(name="Main Booster Pump", A=50.0, B=0.0, C=-2000.0)

# The Pipe (100m long, 0.1m internal diameter)
pipe = Pipe(name="Main Line", length=100.0, diameter=0.1, friction_factor=0.02)

# The Orifice (0.07m bore inside the 0.1m pipe)
orifice = Orifice(name="Flow Metering Orifice", pipe_diameter=0.1, orifice_diameter=0.07)

# The Control Valve (Max Cv of 0.05 in metric SI units, throttled to 50% open)
valve = Valve(name="Control Valve", max_cv=0.05, opening_pct=50.0)

# Destination Tank is elevated 20 meters up in the air
tank_b = Tank(name="Destination Tank", elevation=50, fluid_level=2.0)


print(f"Tank A static pressure: {tank_a.calculate():.2f} Pa")
print(f"Tank B static pressure: {tank_b.calculate():.2f} Pa")
print("Solving network...")

# 2. Initialize Solver
solver = NetworkSolver(nodes=[tank_a, pump, pipe, orifice, valve, tank_b])

# 3. Run the Math
try:
    flow_rate = solver.solve()
    print(f"\nSUCCESS! The network stabilized at a flow rate of: {flow_rate:.5f} m^3/s")
    
    import math
    velocity = flow_rate / (math.pi * (0.1 / 2)**2)
    print(f"Fluid Velocity in pipe: {velocity:.2f} m/s\n")

    print("--- Energy Balance Check ---")
    print(f"Pump Pressure ADDED:        +{pump.calculate():.2f} Pa")
    print(f"Pipe Friction LOST:         -{pipe.calculate():.2f} Pa")
    print(f"Orifice Restriction LOST:   -{orifice.calculate():.2f} Pa")
    print(f"Valve Throttling LOST:      -{valve.calculate():.2f} Pa")
    
    total_dp = pump.calculate() - pipe.calculate() - orifice.calculate() - valve.calculate()
    print(f"Net Pressure Change:        {total_dp:+.2f} Pa")
    
    expected_change = tank_b.calculate() - tank_a.calculate()
    print(f"Required Static Head:       {expected_change:+.2f} Pa")
    
    # If Net Pressure Change == Required Static Head, the Newton-Raphson solver nailed it.
    
except Exception as e:
    print(f"Error: {e}")