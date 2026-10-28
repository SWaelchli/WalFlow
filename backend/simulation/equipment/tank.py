from simulation.equipment.base_node import NeutralPortNode
from simulation.fluid_utils import FluidProperties

class Tank(NeutralPortNode):
    """
    A Tank acts as a boundary condition in the hydraulic network.
    It maintains a constant pressure based on its fluid level and elevation.

    Ports: 1 to 8 neutral nozzles (port-0 .. port-(N-1), see NeutralPortNode), all at the bottom pressure.
    """
    def __init__(self, name: str, elevation: float = 0.0, fluid_level: float = 1.0, temperature: float = 293.15,
                 fluid_type: str = "water", num_ports: int = 1):
        super().__init__(name, node_type="tank", num_ports=num_ports)
        self.is_pressure_boundary = True

        self.elevation = elevation      # Height of the tank bottom from ground (meters)
        self.fluid_level = fluid_level  # Height of the liquid inside the tank (meters)
        self.temperature = temperature  # Kelvin
        self.fluid_type = fluid_type    # "water" or "iso_vg_46"

    def calculate(self):
        """
        Calculates the absolute static pressure at the bottom of the tank.
        Math: P = P_atm + (density * gravity * total_height)
        """
        gravity = 9.81
        atm_p = 101325.0
        if self.global_settings:
            atm_p = getattr(self.global_settings, 'atmospheric_pressure', 101325.0)

        # Calculate properties based on tank temperature
        density = FluidProperties.get_density(self.fluid_type, self.temperature)
        viscosity = FluidProperties.get_viscosity(self.fluid_type, self.temperature)

        # Total hydraulic head (elevation + fluid level)
        pressure = atm_p + (density * gravity * (self.elevation + self.fluid_level))

        # Apply properties and pressure to ALL ports
        # (A tank is a large reservoir, so all connections share the same state)
        for port in self.inlets + self.outlets:
            port.temperature = self.temperature
            port.density = density
            port.viscosity = viscosity
            port.pressure = pressure
        return pressure
