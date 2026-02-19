from simulation.equipment.base_node import HydraulicNode
import math

class Orifice(HydraulicNode):
    """
    A Orifice acts as a restriction in the hydraulic network. It calculates the pressure drop caused by the restriction in area.
    """
    def __init__(self, name: str, pipe_diameter: float, orifice_diameter: float = 0.0):
        # Call the parent class constructor to set up the ID and lists
        super().__init__(name, node_type="orifice")
        
        self.pipe_diameter = pipe_diameter
        self.orifice_diameter = orifice_diameter
        
        # A orifice requires exactly one inlet and one outlet
        self.add_inlet()
        self.add_outlet()

    def calculate_delta_p(self, flow_rate: float, density: float) -> float:
        """
        Calculates pressure drop using the Bernoulli's equation.
        """
        if self.pipe_diameter <= 0:
            raise ValueError("Pipe diameter must be strictly positive.")
        
        if self.orifice_diameter <= 0:
            raise ValueError("Orifice diameter must be strictly positive.")
            
        # 1. Calculate beta ration (b = d / D)
        beta_ratio = self.orifice_diameter / self.pipe_diameter

        # 2. Calulate velocity of the pipe upstream of the orifice (v1 = Q / A1)
        area_pipe = math.pi * (self.pipe_diameter / 2)**2
        velocity = flow_rate / area_pipe

        
        # 3. Calculate Dynamic Pressure term (0.5 * rho * v^2)
        dynamic_pressure = 0.5 * density * velocity * abs(velocity)  # abs to preserve direction of flow for pressure drop sign

        # 4. Calculate the Geometry/Flow Factor (1 - beta^4) / (C_d^2 * beta^4)

        # For simplicity, we will assume a discharge coefficient (C_d) of 0.6 for sharp-edged orifices
        discharge_coefficient = 0.6
        geometry_factor = (1 - beta_ratio**4) / (discharge_coefficient**2 * beta_ratio**4)
        
        # 5. Calculate recoverable pressure drop at taps (Delta P = Dynamic Pressure * Geometry Factor) 
        rec_delta_p = dynamic_pressure * geometry_factor

        # 6. Calculate Permanent Pressure Loss (unrecoverable loss)

        perm_delta_p = rec_delta_p * (1 - beta_ratio**2)

        return  perm_delta_p


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