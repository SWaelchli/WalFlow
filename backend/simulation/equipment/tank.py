from simulation.equipment.base_node import HydraulicNode
from simulation.fluid_utils import FluidProperties

class Tank(HydraulicNode):
    """
    A Tank acts as a boundary condition in the hydraulic network.
    It maintains a constant pressure based on its fluid level and elevation.
    """
    def __init__(self, name: str, elevation: float = 0.0, fluid_level: float = 1.0, temperature: float = 293.15, fluid_type: str = "water"):
        # Call the parent class constructor to set up the ID and lists
        super().__init__(name, node_type="tank")
        
        self.elevation = elevation      # Height of the tank bottom from ground (meters)
        self.fluid_level = fluid_level  # Height of the liquid inside the tank (meters)
        self.temperature = temperature  # Kelvin
        self.fluid_type = fluid_type    # "water" or "iso_vg_46"
        
        # A tank typically acts as a source or sink, so we give it one default connection port
        self.add_inlet()
        self.add_outlet()

    def calculate(self):
        """
        Calculates the absolute static pressure at the bottom of the tank.
        Math: P = P_atm + (density * gravity * total_height)
        """
        gravity = 9.81
        
        # Calculate properties based on tank temperature
        density = FluidProperties.get_density(self.fluid_type, self.temperature)
        viscosity = FluidProperties.get_viscosity(self.fluid_type, self.temperature)
        
        # Apply properties and pressure to ALL ports
        # (A tank is a large reservoir, so all connections share the same state)
        for port in self.inlets + self.outlets:
            port.temperature = self.temperature
            port.density = density
            port.viscosity = viscosity
            
            # Calculate the total hydraulic head (elevation + fluid level)
            total_head = self.elevation + self.fluid_level
            port.pressure = 101325.0 + (density * gravity * total_head)
        
        return self.outlets[0].pressure