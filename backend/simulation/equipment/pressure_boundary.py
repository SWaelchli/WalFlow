from simulation.equipment.base_node import NeutralPortNode
from simulation.fluid_utils import FluidProperties

class PressureBoundary(NeutralPortNode):
    """
    Constant Pressure Boundary — imposes a Dirichlet pressure boundary condition.

    All ports are clamped to set_pressure (Pa). Flow direction and magnitude
    are determined by the rest of the network.

    Ports: 1 to 8 neutral ports (port-0 .. port-(N-1), see NeutralPortNode).
    """

    def __init__(
        self,
        name: str,
        set_pressure: float = 600_000.0,   # 6 bara default
        temperature: float = 293.15,       # 20 °C default
        num_ports: int = 1,
    ):
        super().__init__(name, node_type="pressure_boundary", num_ports=num_ports)

        self.set_pressure = float(set_pressure)   # Pa
        self.temperature = float(temperature)     # K

        self.is_pressure_boundary = True
        self.blocks_flow_on_shutdown = False

        self.is_relief_driver = True
        self._ramp_nominal_pressure = None

    def apply_relief_ramp(self, lam: float) -> None:
        """Pressure ramp from atmospheric pressure (lam = 0) to the case value (lam = 1)."""
        if self._ramp_nominal_pressure is None:
            self._ramp_nominal_pressure = self.set_pressure
        p_atm = getattr(self.global_settings, 'atmospheric_pressure', 101325.0) if self.global_settings else 101325.0
        self.set_pressure = p_atm + lam * (self._ramp_nominal_pressure - p_atm)

    def reset_relief_ramp(self) -> None:
        if self._ramp_nominal_pressure is not None:
            self.set_pressure = self._ramp_nominal_pressure
            self._ramp_nominal_pressure = None

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
            port.pressure = self.set_pressure
            self._set_port_fluid_properties(port, self.temperature)
        return self.set_pressure
