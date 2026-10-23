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
    # Numerical guard only: limits the pressure DROP the spring can impose when the flow is above target
    # (solver search steps). The user-facing limit is max_discharge_pressure (pressure rise).
    _HARD_CAP_PA = 20_000_000.0

    def __init__(
        self,
        name: str,
        source_flow: float = 8.333e-4,        # 50 L/min default
        temperature: float = 293.15,          # 20 °C default
        max_discharge_pressure: float = 50e5, # Pa(a): outlet pressure limit, 50 bar(a) default
    ):
        super().__init__(name, node_type="flow_source")

        self.source_flow = float(source_flow)           # m³/s
        self.temperature = float(temperature)           # K
        self.max_discharge_pressure = float(max_discharge_pressure)  # Pa(a)

        self.pressure_cap_reached = False   # outlet pressure held at max_discharge_pressure (F1-24)

        self.is_pressure_boundary = False
        self.blocks_flow_on_shutdown = False

        self.is_relief_driver = True
        self._ramp_nominal_flow = None

        # 0 inlets + 1 outlet
        self.add_outlet()

    def apply_relief_ramp(self, lam: float) -> None:
        """Flow ramp: source flow ∝ lam."""
        if self._ramp_nominal_flow is None:
            self._ramp_nominal_flow = self.source_flow
        self.source_flow = self._ramp_nominal_flow * lam

    def reset_relief_ramp(self) -> None:
        if self._ramp_nominal_flow is not None:
            self.source_flow = self._ramp_nominal_flow
            self._ramp_nominal_flow = None

    def _stiffness(self) -> float:
        # 10 MPa per 1 % flow deviation, referenced to the case flow (unchanged by a relief ramp)
        q_ref = self._ramp_nominal_flow if self._ramp_nominal_flow is not None else self.source_flow
        if abs(q_ref) < 1e-6:
            return self._BASE_STIFFNESS_PA_PER_M3S
        return 1.0e7 / (0.01 * abs(q_ref))

    def _max_rise_pa(self) -> float:
        """Largest pressure rise over the reference (atmospheric, where the solver pins the source node)."""
        atm = getattr(self.global_settings, 'atmospheric_pressure', 101325.0) if self.global_settings else 101325.0
        return max(0.0, self.max_discharge_pressure - atm)

    def refresh_warnings(self) -> None:
        """Flag set when the delivered flow is limited by the discharge pressure limit."""
        p_out = self.outlets[0].pressure if self.outlets else 0.0
        self.pressure_cap_reached = bool(p_out >= self.max_discharge_pressure - 1.0)

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
        stiffness = self._stiffness()

        dp = stiffness * (flow_rate - target_flow)

        # Clamp delta pressure to avoid extreme values during solver search
        # Outlet limited to max_discharge_pressure (dp < 0 is a pressure rise)
        dp = max(-self._max_rise_pa(), min(self._HARD_CAP_PA, dp))
        return dp

    def calculate_dp_derivative(self, flow_rate: float, density: float, viscosity: float = 0.001) -> float:
        """
        Analytical derivative of the spring curve pressure drop w.r.t flow rate.
        """
        target_flow = self.source_flow
        stiffness = self._stiffness()

        # Check if clamped; if so, derivative is zero
        dp = stiffness * (flow_rate - target_flow)
        if dp <= -self._max_rise_pa() or dp >= self._HARD_CAP_PA:
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
