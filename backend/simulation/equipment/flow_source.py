from simulation.equipment.base_node import HydraulicNode
from simulation.fluid_utils import FluidProperties

class FlowSource(HydraulicNode):
    """
    Constant Flow Source — enforces a fixed volumetric flow rate.

    Uses a high-stiffness spring formulation to force the flow rate leaving
    the outlet to equal source_flow (m³/s).

    Ports
    -----
    outlet-0 : right handle (only port)
    """

    _BASE_STIFFNESS_PA_PER_M3S = 1e10
    _HARD_CAP_PA = 20_000_000.0           # 200 bar cap

    def __init__(
        self,
        name: str,
        source_flow: float = 8.333e-4,        # 50 L/min default
        temperature: float = 293.15,          # 20 °C default
    ):
        super().__init__(name, node_type="flow_source")

        self.source_flow = float(source_flow)           # m³/s
        self.temperature = float(temperature)           # K

        self.is_pressure_boundary = False
        self.is_flow_boundary = False
        self.blocks_flow_on_shutdown = False

        # 0 inlets + 1 outlet
        self.add_outlet()

    def _get_fluid_type(self) -> str:
        return getattr(self.global_settings, 'fluid_type', 'water')

    def _set_port_fluid_properties(self, port, temp_k: float) -> None:
        fluid_type = self._get_fluid_type()
        port.temperature = temp_k
        port.density = FluidProperties.get_density(fluid_type, temp_k)
        port.viscosity = FluidProperties.get_viscosity(fluid_type, temp_k)

    def calculate_delta_p(self, flow_rate: float, density: float, viscosity: float = 0.001) -> float:
        """
        Flow Mode: spring curve forcing actual flow to equal target flow.
        dp = stiffness * (Q_actual - Q_target)
        We define a high stiffness (10 MPa per 1% flow deviation).
        """
        target_flow = self.source_flow
        if abs(target_flow) < 1e-6:
            stiffness = self._BASE_STIFFNESS_PA_PER_M3S
        else:
            stiffness = 1.0e7 / (0.01 * abs(target_flow))

        dp = stiffness * (flow_rate - target_flow)
        
        # Clamp delta pressure to avoid extreme values during solver search
        dp = max(-self._HARD_CAP_PA, min(self._HARD_CAP_PA, dp))
        return dp

    def calculate_dp_derivative(self, flow_rate: float, density: float, viscosity: float = 0.001) -> float:
        """
        Analytical derivative of the spring curve pressure drop w.r.t flow rate.
        """
        target_flow = self.source_flow
        if abs(target_flow) < 1e-6:
            stiffness = self._BASE_STIFFNESS_PA_PER_M3S
        else:
            stiffness = 1.0e7 / (0.01 * abs(target_flow))

        # Check if clamped; if so, derivative is zero
        dp = stiffness * (flow_rate - target_flow)
        if dp <= -self._HARD_CAP_PA or dp >= self._HARD_CAP_PA:
            return 0.0

        return stiffness

    def calculate(self) -> float:
        """
        Propagates pressure and thermal state to the outlet.
        """
        outlet = self.outlets[0]
        # In flow mode, the inlet pressure is pinned to atmospheric pressure (atm_p) by the solver,
        # which corresponds to the node pressure. We read it from the outlet's inlet-side connection.
        # However, to be robust, we fetch it from the node's local properties or use a default.
        # Typically the solver stamps the outlet pressure directly.
        self._set_port_fluid_properties(outlet, self.temperature)
        return 0.0
