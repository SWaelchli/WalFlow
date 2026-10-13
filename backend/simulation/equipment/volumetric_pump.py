from simulation.equipment.base_node import HydraulicNode
from simulation.fluid_utils import FluidProperties
import math

HARD_CAP_PA = 20_000_000.0  # 200 bar numerical guard (a real system needs a relief valve)

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
    """
    def __init__(self, name: str, flow_rated: float, motor_power: float, efficiency: float, drive_type: str = DRIVE_FIXED_SPEED):
        super().__init__(name, node_type="volumetric_pump")
        self.blocks_flow_on_shutdown = True

        self.flow_rated = flow_rated    # Displacement flow (m³/s)
        self.motor_power = motor_power  # Motor rating (W)
        self.efficiency = efficiency    # Decimal pump efficiency (excl. motor)
        self.drive_type = drive_type if drive_type in (DRIVE_FIXED_SPEED, DRIVE_VFD_POWER_LIMIT) else DRIVE_FIXED_SPEED
        self.cavitation_warning = False
        self.motor_overload = False
        self.motor_load_pct = 0.0
        self.power_limited = False
        self.pressure_cap_reached = False

        self.add_inlet()
        self.add_outlet()

    def _stiffness(self) -> float:
        # 100 bar per 1 % flow error: behaves like a true PD pump
        return 10_000_000.0 / (0.01 * self.flow_rated) if self.flow_rated > 0 else 1e12

    def _power_limit_dp(self, flow_rate: float) -> float:
        available_power = self.motor_power * self.efficiency
        return available_power / math.sqrt(flow_rate**2 + 1e-10)

    def _uses_power_limit(self) -> bool:
        return self.drive_type == DRIVE_VFD_POWER_LIMIT and self.motor_power > 0

    def calculate_delta_p(self, flow_rate: float, density: float, viscosity: float = 0.001) -> float:
        """Pressure rise (Pa); negative when the pump is pushed faster than its displacement."""
        stiffness = self._stiffness()
        if not getattr(self, 'active', True):
            # Stopped PD pump blocks flow
            return -1e11 * flow_rate

        if flow_rate < 0:
            # Reverse flow: acts like a stiff check valve
            return HARD_CAP_PA - stiffness * flow_rate

        delta_p = stiffness * (self.flow_rated - flow_rate)  # both signs (F1-35)
        if self._uses_power_limit():
            delta_p = min(delta_p, self._power_limit_dp(flow_rate))
        return min(delta_p, HARD_CAP_PA)

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
                if dp_power > HARD_CAP_PA:
                    return 0.0
                available_power = self.motor_power * self.efficiency
                return -available_power * flow_rate / ((flow_rate**2 + 1e-10)**1.5)
        if dp_displacement > HARD_CAP_PA:
            return 0.0
        return -stiffness

    def _update_warnings(self, flow_rate: float, dp: float):
        active = getattr(self, 'active', True)
        shaft_w = max(0.0, flow_rate * dp) / max(0.05, self.efficiency) if active else 0.0
        self.motor_load_pct = 100.0 * shaft_w / self.motor_power if self.motor_power > 0 else 0.0
        self.motor_overload = active and self.drive_type == DRIVE_FIXED_SPEED and self.motor_power > 0 \
            and shaft_w > self.motor_power * 1.001
        self.power_limited = active and self._uses_power_limit() and flow_rate > 0 \
            and self._power_limit_dp(flow_rate) < self._stiffness() * (self.flow_rated - flow_rate)
        self.pressure_cap_reached = active and dp >= HARD_CAP_PA * 0.999

    def refresh_warnings(self):
        """Recompute the warnings from the final (reported) port state."""
        if self.inlets and self.outlets:
            self._update_warnings(self.inlets[0].flow_rate, self.outlets[0].pressure - self.inlets[0].pressure)

    def shaft_power(self) -> float:
        """Shaft power Q·ΔP/η (W) at the current operating point; 0 when stopped."""
        if not getattr(self, 'active', True) or not self.inlets or not self.outlets:
            return 0.0
        q = self.inlets[0].flow_rate
        dp = self.outlets[0].pressure - self.inlets[0].pressure
        return max(0.0, q * dp) / max(0.05, self.efficiency)

    def calculate(self):

        inlet = self.inlets[0]
        outlet = self.outlets[0]

        # Cavitation Check
        fluid_type = self.global_settings.fluid_type if self.global_settings else 'water'
        vapor_pressure = FluidProperties.get_vapor_pressure(fluid_type, inlet.temperature)

        npsh_safety_margin = 1.2
        if inlet.pressure < (vapor_pressure * npsh_safety_margin):
            self.cavitation_warning = True
        else:
            self.cavitation_warning = False

        dp = self.calculate_delta_p(inlet.flow_rate, inlet.density, inlet.viscosity)
        self._update_warnings(inlet.flow_rate, dp)

        outlet.pressure = inlet.pressure + dp
        outlet.flow_rate = inlet.flow_rate
        outlet.density = inlet.density
        outlet.viscosity = inlet.viscosity

        # Pump Waste Heat: dT = (dP / (rho * Cp)) * ((1 - eta) / eta)
        # Apply heat to the EXITING port
        cp = FluidProperties.get_specific_heat(fluid_type, inlet.temperature)
        eff_factor = (1.0 - self.efficiency) / max(0.1, self.efficiency)
        dt = (abs(dp) / (inlet.density * cp)) * eff_factor

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
