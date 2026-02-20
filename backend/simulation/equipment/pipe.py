from simulation.equipment.base_node import HydraulicNode
import math

class Pipe(HydraulicNode):
    """
    A Pipe connects two nodes and calculates the pressure drop caused by fluid friction.
    """
    def __init__(self, name: str, length: float, diameter: float, friction_factor: float = 0.02):
        # Call the parent class constructor to set up the ID and lists        
        super().__init__(name, node_type="pipe")
        
        self.length = length                    # Pipe length (meters)
        self.diameter = diameter                # Internal diameter (meters)
        self.friction_factor = friction_factor  # Darcy friction factor (f)
        
        # A pipe requires exactly one inlet and one outlet
        self.add_inlet()
        self.add_outlet()

    def calculate_delta_p(self, flow_rate: float, density: float, viscosity: float) -> float:
        """
        Calculates pressure drop using the Darcy-Weisbach equation.
        Friction factor is calculated based on Reynolds number.
        """
        if self.diameter <= 0:
            raise ValueError("Pipe diameter must be strictly positive.")
            
        # 1. Calculate cross-sectional area (A = pi * r^2)
        area = math.pi * (self.diameter / 2)**2
        
        # 2. Calculate fluid velocity (v = Q / A)
        velocity = flow_rate / area
        
        # 3. Calculate Reynolds Number (Re = rho * v * D / mu)
        abs_v = abs(velocity)
        if viscosity > 0 and abs_v > 0:
            re = (density * abs_v * self.diameter) / viscosity
            
            # 4. Determine friction factor (f)
            if re < 2300:
                # Laminar flow
                f = 64 / re
            else:
                # Turbulent flow (Simplified Haaland equation for smooth pipes)
                f = (1.8 * math.log10(re / 6.9))**-2
        else:
            f = 0
        
        # 5. Calculate pressure drop (Delta P = f * (L/D) * (rho * v^2 / 2))
        delta_p = f * (self.length / self.diameter) * (density * velocity * abs_v / 2)
        
        return delta_p
        
    def calculate(self):
        """
        Updates the outlet port's state based on the inlet port's state and the calculated drop.
        Now handles bi-directional property propagation.
        """
        inlet = self.inlets[0]
        outlet = self.outlets[0]
        
        # Calculate the pressure drop based on the current flow rate passing through
        dp = self.calculate_delta_p(inlet.flow_rate, inlet.density, inlet.viscosity)
        
        # Update pressures (standard inlet -> outlet delta)
        outlet.pressure = inlet.pressure - dp
        outlet.flow_rate = inlet.flow_rate
        
        # Bi-directional Property Propagation
        if inlet.flow_rate >= 0:
            # Forward Flow: Inlet -> Outlet
            outlet.temperature = inlet.temperature
            outlet.density = inlet.density
            outlet.viscosity = inlet.viscosity
        else:
            # Reverse Flow: Outlet -> Inlet
            inlet.temperature = outlet.temperature
            inlet.density = outlet.density
            inlet.viscosity = outlet.viscosity
        
        return dp