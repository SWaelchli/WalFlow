from simulation.equipment.base_node import HydraulicNode
from simulation.fluid_utils import FluidProperties

P_SCALE = 100000.0
Q_SCALE = 0.001
RATED_OVERPRESSURE = 0.10     # full lift and rated capacity at 10 % overpressure (API 520 liquid service)
Q_COEFF_MIN = 1e-6            # m³/s: flow at which the open-device loss coefficient is evaluated near zero flow
DP_SQRT_REG = 1.0             # Pa: keeps d√Δp/dΔp finite at zero pressure difference
RELIEF_FORCED_STATES = ("auto", "forced_closed", "forced_open")


class ReliefDevice(HydraulicNode):
    """
    Shared model of the pressure relief devices (PSV, rupture disc).

    Set pressures are gauge (barg, API 520 / ISO 4126); a device opens when its inlet gauge pressure
    P_in − P_atm reaches the set pressure (F1-09). Whether a device is open is decided between hydraulic
    solves (update_relief_state) and held fixed during a Newton solve, so its branch never flips
    mid-iteration. Inside a solve the device is a flow equation

        Q = lift · √(Δp / c(Q)),   Δp = P_in − P_out > 0,  c(Q) = Δp_open(Q) / Q²

    with lift 0 (closed), 1 (full lift) or the modulating lift from the inlet overpressure. A closed device
    passes exactly no flow and a device never passes reverse flow.
    """

    def __init__(self, name: str, node_type: str, set_pressure_barg: float, forced_state: str):
        super().__init__(name, node_type=node_type)
        self.set_pressure_barg = max(0.01, float(set_pressure_barg))
        self.forced_state = forced_state if forced_state in RELIEF_FORCED_STATES else "auto"
        self.capacity_utilization_pct = 0.0
        self.rated_flow_lmin = 0.0
        self.lift_pct = 0.0
        self.add_inlet()
        self.add_outlet()

    # --- pressures -------------------------------------------------------------------------------
    @property
    def p_atm(self) -> float:
        return getattr(self.global_settings, 'atmospheric_pressure', 101325.0) if self.global_settings else 101325.0

    @property
    def set_pressure_pa(self) -> float:
        """Set pressure as absolute pressure (Pa), for comparison with port pressures."""
        return self.set_pressure_barg * P_SCALE + self.p_atm

    @property
    def set_pressure_bara(self) -> float:
        return self.set_pressure_pa / P_SCALE

    @property
    def full_lift_overpressure_pa(self) -> float:
        return max(1000.0, RATED_OVERPRESSURE * self.set_pressure_barg * P_SCALE)

    # --- to be provided by the device ------------------------------------------------------------
    def open_dp(self, flow_rate: float, density: float, viscosity: float) -> float:
        """Pressure loss of the fully open device at flow_rate (Pa)."""
        raise NotImplementedError

    def lift_mode(self) -> str:
        """'closed', 'full' or 'modulating' for the current (held) device state."""
        raise NotImplementedError

    def update_relief_state(self, p_in_pa: float) -> bool:
        """Between hydraulic solves: change the held state from the solved inlet pressure. True if changed."""
        return False

    def reset_run_state(self):
        self.capacity_utilization_pct = 0.0
        self.rated_flow_lmin = 0.0
        self.lift_pct = 0.0

    # --- flow equation ---------------------------------------------------------------------------
    def lift(self, p_in_pa: float) -> float:
        mode = self.lift_mode()
        if mode == "closed":
            return 0.0
        if mode == "full":
            return 1.0
        return min(1.0, max(0.0, (p_in_pa - self.set_pressure_pa) / self.full_lift_overpressure_pa))

    def _loss_coefficient(self, flow_rate: float, density: float, viscosity: float) -> float:
        q = max(abs(flow_rate), Q_COEFF_MIN)
        return self.open_dp(q, density, viscosity) / (q * q)

    def model_flow(self, flow_rate, density, viscosity, p_in_pa, p_out_pa) -> float:
        lift = self.lift(p_in_pa)
        dp = p_in_pa - p_out_pa
        if lift <= 0.0 or dp <= 0.0:
            return 0.0
        c = self._loss_coefficient(flow_rate, density, viscosity)
        return lift * dp / ((dp + DP_SQRT_REG) ** 0.5 * c ** 0.5)

    def rated_flow(self, flow_rate, density, viscosity, p_out_pa) -> float:
        """Flow at full lift with the inlet at 110 % of set pressure (gauge) against the actual outlet (F1-38)."""
        dp_rated = self.set_pressure_pa + RATED_OVERPRESSURE * self.set_pressure_barg * P_SCALE - p_out_pa
        if dp_rated <= 0.0:
            return 0.0
        return (dp_rated / self._loss_coefficient(flow_rate, density, viscosity)) ** 0.5

    def calculate_delta_p(self, flow_rate: float, density: float, viscosity: float = 0.001,
                          p_in_pa: float = None, p_out_pa: float = None, update_state: bool = True) -> float:
        p_in = p_in_pa if p_in_pa is not None else self.inlets[0].pressure
        p_out = p_out_pa if p_out_pa is not None else self.outlets[0].pressure
        dp_valve = p_in - p_out
        g = (flow_rate - self.model_flow(flow_rate, density, viscosity, p_in, p_out)) / Q_SCALE
        if update_state:
            self.report(flow_rate, density, viscosity, p_in, p_out)
        # The solver's edge row for this device then reads g = 0 (flow form, see class docstring)
        return dp_valve - P_SCALE * g

    def calculate_dp_derivative(self, flow_rate: float, density: float, viscosity: float = 0.001) -> float:
        # The solver differentiates this device's row numerically (complementarity rows, F1-12)
        return P_SCALE / Q_SCALE

    # --- reporting -------------------------------------------------------------------------------
    def report(self, flow_rate, density, viscosity, p_in_pa, p_out_pa):
        """Status, capacity and lift for telemetry; never changes the held open/closed state."""
        q = max(0.0, flow_rate)
        self.lift_pct = 100.0 * self.lift(p_in_pa)
        if self.lift_mode() == "closed" or q <= 1e-9:
            self.capacity_utilization_pct = 0.0
            self.rated_flow_lmin = 0.0
            self.status = self.closed_status()
            return
        rated = self.rated_flow(q, density, viscosity, p_out_pa)
        self.rated_flow_lmin = rated * 60000.0
        self.capacity_utilization_pct = min(999.0, 100.0 * q / rated) if rated > 0 else 999.0
        if self.capacity_utilization_pct > 100.0 + 1e-6:
            self.status = "overcapacity"
        else:
            self.status = self.open_status()

    def closed_status(self) -> str:
        return "closed"

    def open_status(self) -> str:
        return "cracked"

    def is_closed(self) -> bool:
        return self.forced_state == "forced_closed" or self.status in ("closed", "intact")

    def calculate(self):
        inlet = self.inlets[0]
        outlet = self.outlets[0]
        if self.is_closed() or inlet.flow_rate <= 0.0:
            inlet.flow_rate = 0.0
            outlet.flow_rate = 0.0
            dp = 0.0
        else:
            dp = max(0.0, inlet.pressure - outlet.pressure)
        outlet.flow_rate = inlet.flow_rate
        outlet.density = inlet.density
        outlet.viscosity = inlet.viscosity

        fluid_type = getattr(self.global_settings, 'fluid_type', 'water')
        cp = FluidProperties.get_specific_heat(fluid_type, inlet.temperature)
        outlet.temperature = inlet.temperature + dp / (inlet.density * cp)

        # Dynamically update local properties based on temperature feedback
        outlet.density = FluidProperties.get_density(fluid_type, outlet.temperature)
        outlet.viscosity = FluidProperties.get_viscosity(fluid_type, outlet.temperature)

        # Outlet temperature already includes the throttling heat (F1-16); do not overwrite it
        return dp
