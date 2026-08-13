from simulation.equipment.base_node import HydraulicNode
from simulation.fluid_utils import FluidProperties

class PressureSource(HydraulicNode):
    """
    Constant Pressure Source — imposes a Dirichlet pressure boundary condition.

    All ports are clamped to source_pressure (Pa). Flow direction and magnitude
    are determined by the rest of the network.

    Ports
    -----
    inlet-0  : left handle
    outlet-0 : right handle
    """

    def __init__(
        self,
        name: str,
        source_pressure: float = 600_000.0,   # 6 bara default
        temperature: float = 293.15,          # 20 °C default
    ):
        super().__init__(name, node_type="pressure_source")

        self.source_pressure = float(source_pressure)   # Pa
        self.temperature = float(temperature)           # K

        self.is_pressure_boundary = True
        self.is_flow_boundary = False
        self.blocks_flow_on_shutdown = False

        # 1 inlet + 1 outlet
        self.add_inlet()
        self.add_outlet()

    def _get_fluid_type(self) -> str:
        return getattr(self.global_settings, 'fluid_type', 'water')

    def _set_port_fluid_properties(self, port, temp_k: float) -> None:
        fluid_type = self._get_fluid_type()
        port.temperature = temp_k
        port.density = FluidProperties.get_density(fluid_type, temp_k)
        port.viscosity = FluidProperties.get_viscosity(fluid_type, temp_k)

    def calculate(self) -> float:
        """
        Pressure Mode: clamp all ports to the set pressure.
        """
        for port in self.inlets + self.outlets:
            port.pressure = self.source_pressure
            self._set_port_fluid_properties(port, self.temperature)
        return self.source_pressure
