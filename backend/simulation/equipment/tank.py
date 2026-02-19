from simulation.equipment.base_node import HydraulicNode

class Tank(HydraulicNode):
    """
    A Tank acts as a boundary condition in the hydraulic network.
    It maintains a constant pressure based on its fluid level and elevation.
    """
    def __init__(self, name: str, elevation: float = 0.0, fluid_level: float = 1.0):
        # Call the parent class constructor to set up the ID and lists
        super().__init__(name, node_type="tank")
        
        self.elevation = elevation      # Height of the tank bottom from ground (meters)
        self.fluid_level = fluid_level  # Height of the liquid inside the tank (meters)
        
        # A tank typically acts as a source or sink, so we give it one default connection port
        self.add_outlet()

    def calculate(self):
        """
        Calculates the absolute static pressure at the bottom of the tank.
        Math: P = P_atm + (density * gravity * total_height)
        """
        port = self.outlets[0]
        gravity = 9.81
        
        # Calculate the total hydraulic head (elevation + fluid level)
        total_head = self.elevation + self.fluid_level
        
        # Calculate static pressure (Standard atm pressure is 101325 Pascals)
        port.pressure = 101325.0 + (port.density * gravity * total_head)
        
        return port.pressure