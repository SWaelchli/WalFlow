from simulation.equipment.base_node import HydraulicNode, total_of
from simulation.fluid_utils import FluidProperties

FLOW_DIRECTIONS = ("supply", "draw")
# common_pressure: one pressure at all ports, the set flow is the total and the split is solved;
# total_split: the set flow is the total, each connected port takes an equal share at its own pressure;
# per_port: each connected port takes its own set flow (port_flows) at its own pressure
FLOW_SPLITS = ("common_pressure", "total_split", "per_port")


class FlowBoundary(HydraulicNode):
    """
    Constant Flow Boundary — supplies or draws a fixed volumetric flow rate.

    Uses a high-stiffness spring formulation to force the flow through each of its outlets to the set flow (m³/s),
    signed: out of the boundary for a supply, into it for a draw.

    Ports
    -----
    1 to 8 neutral ports (port-0 .. port-(N-1)) on the canvas. The parser puts hidden nodes at them (one shared node
    for common_pressure, one per connected port otherwise) and links each to an outlet of this node by a BoundaryLink;
    port_hubs maps a canvas port to its hidden node and port there.
    """

    MIN_PORTS = 1
    MAX_PORTS = 8
    _BASE_STIFFNESS_PA_PER_M3S = 1e10
    # Numerical guard only: limits the pressure change the spring can impose against the set direction (solver search
    # steps). The user-facing limits are max_discharge_pressure (supply) and min_suction_pressure (draw).
    _HARD_CAP_PA = 20_000_000.0

    def __init__(
        self,
        name: str,
        set_flow: float = 8.333e-4,           # 50 L/min default
        temperature: float = 293.15,          # 20 °C default
        max_discharge_pressure: float = 50e5, # Pa(a): supply pressure limit, 50 bar(a) default
        min_suction_pressure: float = 0.0,    # Pa(a): draw pressure limit, 0 bar(a) default
        direction: str = "supply",
        flow_split: str = "common_pressure",
        num_ports: int = 1,
        port_flows: list = None,              # m³/s per canvas port (per_port); None gives every port set_flow
    ):
        super().__init__(name, node_type="flow_boundary")

        self.set_flow = abs(float(set_flow))            # m³/s, magnitude; direction gives the sign
        self.temperature = float(temperature)           # K
        self.max_discharge_pressure = float(max_discharge_pressure)  # Pa(a)
        self.min_suction_pressure = float(min_suction_pressure)      # Pa(a)
        self.direction = direction
        self.flow_split = flow_split
        self.num_ports = num_ports
        self.port_flows = [abs(float(q)) for q in port_flows] if port_flows is not None else None
        self.port_hubs = {}   # canvas port index -> (hidden node, its port index), set by the parser
        self.outlet_ports = []   # outlet index -> its canvas port, set by the parser

        self.pressure_cap_reached = False    # supply: outlet pressure held at max_discharge_pressure
        self.suction_limit_reached = False   # draw: outlet pressure held at min_suction_pressure

        self.is_pressure_boundary = False
        self.blocks_flow_on_shutdown = False

        # A draw only lowers pressures when ramped up, so it drives no relief
        self.is_relief_driver = direction == "supply"
        self._ramp_nominal_flow = None

    @property
    def is_draw(self) -> bool:
        return self.direction == "draw"

    def apply_relief_ramp(self, lam: float) -> None:
        """Flow ramp: set flow ∝ lam."""
        if self._ramp_nominal_flow is None:
            self._ramp_nominal_flow = self.set_flow
        self.set_flow = self._ramp_nominal_flow * lam

    def reset_relief_ramp(self) -> None:
        if self._ramp_nominal_flow is not None:
            self.set_flow = self._ramp_nominal_flow
            self._ramp_nominal_flow = None

    def _link_flow(self, total: float, outlet: int = 0) -> float:
        """Signed flow of one outlet (link): the total, its equal share over the links for total_split, or its port's
        own set flow for per_port (scaled like set_flow by a relief ramp)."""
        if self.flow_split == "per_port" and self.port_flows is not None and outlet < len(self.outlet_ports):
            nominal = self._ramp_nominal_flow if self._ramp_nominal_flow is not None else self.set_flow
            q = self.port_flows[self.outlet_ports[outlet]] * (total / nominal if nominal > 0.0 else 1.0)
        elif self.flow_split == "total_split":
            q = total / max(1, len(self.outlets))
        else:
            q = total
        return -q if self.is_draw else q

    def target_flow(self, outlet: int = 0) -> float:
        """Signed set flow of an outlet, positive out of the boundary."""
        return self._link_flow(self.set_flow, outlet)

    def _stiffness(self, outlet: int = 0) -> float:
        # 10 MPa per 1 % flow deviation, referenced to the case flow (unchanged by a relief ramp)
        q_ref = self._link_flow(self._ramp_nominal_flow if self._ramp_nominal_flow is not None else self.set_flow,
                                outlet)
        if abs(q_ref) < 1e-6:
            return self._BASE_STIFFNESS_PA_PER_M3S
        return 1.0e7 / (0.01 * abs(q_ref))

    def _atm(self) -> float:
        return getattr(self.global_settings, 'atmospheric_pressure', 101325.0) if self.global_settings else 101325.0

    def _dp_limits(self) -> tuple:
        """(lowest, highest) spring dp; the outlet pressure is P_atm - dp (the solver pins the node to P_atm)."""
        if self.is_draw:
            return -self._HARD_CAP_PA, self._atm() - self.min_suction_pressure
        return -max(0.0, self.max_discharge_pressure - self._atm()), self._HARD_CAP_PA

    def refresh_warnings(self) -> None:
        """Flags set when the flow is limited by the pressure limit of its direction (the solve caps total pressure)."""
        totals = [total_of(p) for p in self.outlets]
        self.pressure_cap_reached = bool(not self.is_draw and totals
                                         and max(totals) >= self.max_discharge_pressure - 1.0)
        self.suction_limit_reached = bool(self.is_draw and totals and min(totals) <= self.min_suction_pressure + 1.0)

    def _get_fluid_type(self) -> str:
        return getattr(self.global_settings, 'fluid_type', 'water')

    def _set_port_fluid_properties(self, port, temp_k: float) -> None:
        fluid_type = self._get_fluid_type()
        port.temperature = temp_k
        port.density = FluidProperties.get_density(fluid_type, temp_k)
        port.viscosity = FluidProperties.get_viscosity(fluid_type, temp_k)

    def calculate_delta_p(self, flow_rate: float, density: float, viscosity: float = 0.001, outlet: int = 0) -> float:
        """
        Flow Mode: spring curve forcing the flow of outlet `outlet` (signed, out of the boundary) to its set flow.
        dp = stiffness * (Q_actual - Q_target), 10 MPa per 1 % flow deviation, within the pressure limits.
        """
        # A plain clamp: a slope k again for flow against the direction (no reverse flow on a limit) would put a kink at
        # zero flow, where the solve starts, and fails the line search (Jeppson 48-pipe network)
        dp = self._stiffness(outlet) * (flow_rate - self.target_flow(outlet))
        lo, hi = self._dp_limits()
        return max(lo, min(hi, dp))

    def calculate_dp_derivative(self, flow_rate: float, density: float = 0.0, viscosity: float = 0.001,
                                outlet: int = 0) -> float:
        """d(calculate_delta_p)/dq: the stiffness inside the pressure limits, 0 on a limit. Analytic, because a
        difference step of 0.01 % of the flow moves the spring dp by 100 kPa and crosses the suction limit of a draw."""
        lo, hi = self._dp_limits()
        k = self._stiffness(outlet)
        dp = k * (flow_rate - self.target_flow(outlet))
        return k if lo < dp < hi else 0.0

    def calculate(self) -> float:
        """Stamps the set temperature and its fluid properties on the outlets (the solver pins the node pressure)."""
        for outlet in self.outlets:
            self._set_port_fluid_properties(outlet, self.temperature)
        return 0.0

    # Canvas ports, read from the hidden nodes (telemetry, sensing)
    def port(self, port_idx: int):
        """The port of the pipe on canvas port port_idx (at its hidden node), or None when no pipe is on it."""
        hub = self.port_hubs.get(port_idx)
        return hub[0].port(hub[1]) if hub else None

    def port_flow_into(self, port_idx: int) -> float:
        """Volume flow into the boundary through port_idx (negative for a supply; 0 without a pipe)."""
        hub = self.port_hubs.get(port_idx)
        return hub[0].port_flow_into(hub[1]) if hub else 0.0
