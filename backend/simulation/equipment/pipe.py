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

    def calculate_delta_p(self, flow_rate: float, density: float) -> float:
        """
        Calculates pressure drop using the Darcy-Weisbach equation.
        """
        if self.diameter <= 0:
            raise ValueError("Pipe diameter must be strictly positive.")
            
        # 1. Calculate cross-sectional area (A = pi * r^2)
        area = math.pi * (self.diameter / 2)**2
        
        # 2. Calculate fluid velocity (v = Q / A)
        velocity = flow_rate / area
        
        # 3. Calculate pressure drop (Delta P = f * (L/D) * (rho * v^2 / 2))
        # We multiply by the absolute value of velocity to preserve the +/- direction of the flow
        delta_p = self.friction_factor * (self.length / self.diameter) * (density * velocity * abs(velocity) / 2)
        
        return delta_p
        
    def calculate(self):
        """
        Updates the outlet port's state based on the inlet port's state and the calculated drop.
        """
        inlet = self.inlets[0]
        outlet = self.outlets[0]
        
        # Calculate the pressure drop based on the current flow rate passing through
        dp = self.calculate_delta_p(inlet.flow_rate, inlet.density)
        
        # Update the outlet conditions
        outlet.pressure = inlet.pressure - dp
        outlet.flow_rate = inlet.flow_rate  # Incompressible flow means Q_in = Q_out
        outlet.density = inlet.density
        
        return dp