from simulation.equipment.base_node import HydraulicNode, pump_heat_factor, pump_shaft_power
from simulation.fluid_utils import FluidProperties
import math

DEFAULT_MAX_DISCHARGE_PA = 50e5  # 50 bar(a)
LIMIT_ACCUMULATION = 0.01        # 1 % above the limit at full recirculation (dead-head)

DRIVE_FIXED_SPEED = "fixed_speed"
DRIVE_VFD_POWER_LIMIT = "vfd_power_limit"


class VolumetricPump(HydraulicNode):
    """
    A Volumetric (Positive Displacement) Pump.

    The flow is set by the displacement: a stiff "spring" ΔP = k·(Q_rated − Q) acts in both
    directions, so a pump fed from a pressurised header brakes the flow instead of passing
    it freely (F1-35).

    Drive (D3, F1-36):
    - fixed_speed (default): an induction motor keeps (almost) its speed when overloaded, so
      the flow stays at displacement. If the shaft power Q·ΔP/η exceeds the motor rating,
      `motor_overload` is set (the motor would overheat and trip).
    - vfd_power_limit: a drive with a power/torque limit slows the pump down, so the flow is
      reduced to the power limit (ΔP·Q = P_motor·η); `power_limited` is set.
    `efficiency` is the pump efficiency excluding the motor; `motor_power` is the motor rating.

    Pressure limit: the outlet pressure is capped at `max_discharge_pressure` (Pa, absolute), like an
    integral relief valve recirculating to suction; the flow then drops below displacement and
    `pressure_cap_reached` is set.
    """
    def __init__(self, name: str, flow_rated: float, motor_power: float, efficiency: float, drive_type: str = DRIVE_FIXED_SPEED,
                 max_discharge_pressure: float = DEFAULT_MAX_DISCHARGE_PA,
                 npshr_m: float = 0.0, npsh_margin_m: float = 0.5):
        super().__init__(name, node_type="volumetric_pump")
        self.blocks_flow_on_shutdown = True

        self.flow_rated = flow_rated    # Displacement flow (m³/s)
        self.motor_power = motor_power  # Motor rating (W)
        self.efficiency = efficiency    # Decimal pump efficiency (excl. motor)
        self.drive_type = drive_type if drive_type in (DRIVE_FIXED_SPEED, DRIVE_VFD_POWER_LIMIT) else DRIVE_FIXED_SPEED
        self.max_discharge_pressure = max_discharge_pressure  # Pa(a)
        self.cavitation_warning = False
        self.npshr_m = npshr_m              # required NPSH from the datasheet (m), 0 = not entered
        self.npsh_margin_m = npsh_margin_m  # margin on top of NPSHr (m)
        self.npsha_m = None                 # available NPSH at the current operating point (m)
        self.motor_overload = False
        self.motor_load_pct = 0.0
        self.power_limited = False
        self.pressure_cap_reached = False

        self.is_relief_driver = True
        self._ramp_nominal_flow = None

        self.add_inlet()
        self.add_outlet()

    def apply_relief_ramp(self, lam: float) -> None:
        """Speed ramp: displacement flow ∝ speed."""
        if not getattr(self, 'active', True):
            return
        if self._ramp_nominal_flow is None:
            self._ramp_nominal_flow = self.flow_rated
        self.flow_rated = self._ramp_nominal_flow * lam

    def reset_relief_ramp(self) -> None:
        if self._ramp_nominal_flow is not None:
            self.flow_rated = self._ramp_nominal_flow
            self._ramp_nominal_flow = None

    def _stiffness(self) -> float:
        # 100 bar per 1 % flow error: behaves like a true PD pump. Referenced to the case flow,
        # so a relief ramp does not make the spring arbitrarily stiff at low speed.
        q_ref = self._ramp_nominal_flow if self._ramp_nominal_flow is not None else self.flow_rated
        return 10_000_000.0 / (0.01 * q_ref) if q_ref > 0 else 1e12

    def _power_limit_dp(self, flow_rate: float) -> float:
        available_power = self.motor_power * self.efficiency
        return available_power / math.sqrt(flow_rate**2 + 1e-10)

    def _uses_power_limit(self) -> bool:
        return self.drive_type == DRIVE_VFD_POWER_LIMIT and self.motor_power > 0

    def _limit_ratio(self) -> float:
        """Slope of the pressure-limited curve relative to the displacement spring. The limit has a
        small accumulation (like a relief valve): full recirculation needs LIMIT_ACCUMULATION above
        the limit. A flat cap would leave Newton without a slope (stalls on a cold start)."""
        q_ref = self._ramp_nominal_flow if self._ramp_nominal_flow is not None else self.flow_rated
        slope = LIMIT_ACCUMULATION * self.max_discharge_pressure / max(q_ref, 1e-9)
        return slope / self._stiffness()

    def _unlimited_dp(self, flow_rate: float) -> float:
        delta_p = self._stiffness() * (self.flow_rated - flow_rate)  # both signs (F1-35)
        if self._uses_power_limit():
            delta_p = min(delta_p, self._power_limit_dp(flow_rate))
        return delta_p

    def calculate_delta_p(self, flow_rate: float, density: float, viscosity: float = 0.001, p_in_pa: float = None) -> float:
        """Pressure rise (Pa); negative when the pump is pushed faster than its displacement.
        With p_in_pa the outlet is held at max_discharge_pressure (plus accumulation) once reached."""
        if not getattr(self, 'active', True):
            # Stopped PD pump blocks flow
            return -1e11 * flow_rate

        if flow_rate < 0:
            # Reverse flow: acts like a stiff check valve, continuous with the rise at zero flow
            return self.calculate_delta_p(0.0, density, viscosity, p_in_pa) - self._stiffness() * flow_rate

        delta_p = self._unlimited_dp(flow_rate)
        if p_in_pa is not None:
            rise_limit = self.max_discharge_pressure - p_in_pa
            if delta_p > rise_limit:
                delta_p = rise_limit + self._limit_ratio() * (delta_p - rise_limit)
        return delta_p

    def outlet_derivatives(self, flow_rate: float, p_in_pa: float, density: float, viscosity: float = 0.001):
        """(d p_out / d p_in, d p_out / d Q) of p_out = p_in + calculate_delta_p(Q, p_in) for the Jacobian."""
        if not getattr(self, 'active', True):
            return 1.0, -1e11
        limited = self._unlimited_dp(max(0.0, flow_rate)) > self.max_discharge_pressure - p_in_pa
        ratio = self._limit_ratio() if limited else 1.0
        d_q = self.calculate_dp_derivative(flow_rate, density, viscosity)
        return ratio, (d_q if flow_rate < 0 else ratio * d_q)

    def calculate_dp_derivative(self, flow_rate: float, density: float, viscosity: float = 0.001) -> float:
        stiffness = self._stiffness()
        if not getattr(self, 'active', True):
            return -1e11
        if flow_rate < 0:
            return -stiffness

        dp_displacement = stiffness * (self.flow_rated - flow_rate)
        if self._uses_power_limit():
            dp_power = self._power_limit_dp(flow_rate)
            if dp_power < dp_displacement:
                available_power = self.motor_power * self.efficiency
                return -available_power * flow_rate / ((flow_rate**2 + 1e-10)**1.5)
        return -stiffness

    def _update_warnings(self, flow_rate: float, dp: float, p_out: float):
        active = getattr(self, 'active', True)
        shaft_w = pump_shaft_power(flow_rate, dp, self.efficiency, active)
        self.motor_load_pct = 100.0 * shaft_w / self.motor_power if self.motor_power > 0 else 0.0
        # bool(): flow_rate/dp are numpy floats, and numpy.bool_ is not JSON serializable
        self.motor_overload = bool(active and self.drive_type == DRIVE_FIXED_SPEED and self.motor_power > 0
                                   and shaft_w > self.motor_power * 1.001)
        self.power_limited = bool(active and self._uses_power_limit() and flow_rate > 0
                                  and self._power_limit_dp(flow_rate) < self._stiffness() * (self.flow_rated - flow_rate))
        self.pressure_cap_reached = bool(active and p_out >= self.max_discharge_pressure - 1.0)

    def refresh_warnings(self):
        """Recompute the warnings from the final (reported) port state."""
        if self.inlets and self.outlets:
            self._update_warnings(self.inlets[0].flow_rate, self.outlets[0].pressure - self.inlets[0].pressure,
                                  self.outlets[0].pressure)

    def shaft_power(self) -> float:
        """Shaft power |Q|·ΔP/η (W) at the current operating point (`pump_shaft_power`); 0 when stopped."""
        if not self.inlets or not self.outlets:
            return 0.0
        return pump_shaft_power(self.inlets[0].flow_rate, self.outlets[0].pressure - self.inlets[0].pressure,
                                self.efficiency, getattr(self, 'active', True))

    def calculate(self):

        inlet = self.inlets[0]
        outlet = self.outlets[0]

        # NPSH check (F1-28)
        fluid_type = self.global_settings.fluid_type if self.global_settings else 'water'
        self.update_npsh(inlet)

        dp = self.calculate_delta_p(inlet.flow_rate, inlet.density, inlet.viscosity, p_in_pa=inlet.pressure)
        self._update_warnings(inlet.flow_rate, dp, inlet.pressure + dp)

        outlet.pressure = inlet.pressure + dp
        outlet.flow_rate = inlet.flow_rate
        outlet.density = inlet.density
        outlet.viscosity = inlet.viscosity

        # Pump Waste Heat: dT = (dP / (rho * Cp)) * ((1 - eta) / eta) while the pump raises the pressure; a braking
        # pump (driven by the fluid, dP < 0) turns all of |dP| into heat. Apply heat to the EXITING port
        cp = FluidProperties.get_specific_heat(fluid_type, inlet.temperature)
        dt = (abs(dp) / (inlet.density * cp)) * pump_heat_factor(dp, self.efficiency, getattr(self, 'active', True))

        if inlet.flow_rate >= 0:
            outlet.temperature = inlet.temperature + dt
        else:
            inlet.temperature = outlet.temperature + dt

        # Dynamically update local properties based on temperature feedback
        outlet.density = FluidProperties.get_density(fluid_type, outlet.temperature)
        outlet.viscosity = FluidProperties.get_viscosity(fluid_type, outlet.temperature)
        inlet.density = FluidProperties.get_density(fluid_type, inlet.temperature)
        inlet.viscosity = FluidProperties.get_viscosity(fluid_type, inlet.temperature)

        return dp
