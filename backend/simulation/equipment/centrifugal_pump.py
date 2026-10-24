from simulation.equipment.base_node import HydraulicNode, pump_heat_factor, pump_shaft_power
from simulation.fluid_utils import FluidProperties

GRAVITY = 9.81  # m/s², same value as Tank
# Share of the locked-rotor loss that is linear in Q (viscous at low velocity). Keeps the
# resistance well defined at zero flow; the loss at rated flow stays exactly the rated head.
LOCKED_ROTOR_LINEAR_SHARE = 0.05


class CentrifugalPump(HydraulicNode):
    """
    A Centrifugal Pump that adds head to the network.
    Uses the "Duty Point" methodology for engineering intuition.

    Curve in head: H(Q) = H0 + C·Q², with H0 = H_rated·(1 + rise/100), so the
    pressure rise ΔP = ρ·g·H(Q) follows the fluid density.
    - Running, reverse flow: H = H0 − C·Q² (rises again), so a weaker parallel
      pump dead-heads instead of passing reverse flow at shut-off head.
    - Stopped (D2): locked-rotor resistance in both directions,
      ΔP = −ρ·g·H_rated·[(1−ε)·x·|x| + ε·x], x = Q/Q_rated, ε = 5 % (rated head lost at rated flow).
    - efficiency: hydraulic pump efficiency, excluding the motor (pump heat, shaft power).
    """
    def __init__(self, name: str, flow_rated: float, head_rated: float, rise_to_shutoff_pct: float = 20.0, efficiency: float = 0.75,
                 npshr_m: float = 0.0, npsh_margin_m: float = 0.5):
        super().__init__(name, node_type="centrifugal_pump")

        # Engineering Specs (SI Units)
        self.flow_rated = flow_rated         # m3/s
        self.head_rated = head_rated         # m
        self.rise_pct = rise_to_shutoff_pct  # %
        self.efficiency = efficiency         # 0.0 to 1.0
        self.cavitation_warning = False
        self.npshr_m = npshr_m              # required NPSH from the datasheet (m), 0 = not entered
        self.npsh_margin_m = npsh_margin_m  # margin on top of NPSHr (m)
        self.npsha_m = None                 # available NPSH at the current operating point (m)

        # Internal curve coefficients (head)
        self.head_shutoff = self.head_rated * (1.0 + self.rise_pct / 100.0)
        if self.flow_rated > 0:
            self.C_coeff = (self.head_rated - self.head_shutoff) / (self.flow_rated**2)  # m/(m³/s)², ≤ 0
        else:
            self.C_coeff = 0.0

        self.is_relief_driver = True
        self._ramp_nominal = None

        self.add_inlet()
        self.add_outlet()

    def apply_relief_ramp(self, lam: float) -> None:
        """Speed ramp by the affinity laws: Q ∝ n, H ∝ n² (C_coeff stays the same)."""
        if not getattr(self, 'active', True):
            return  # a stopped pump is a resistance, not a driver
        if self._ramp_nominal is None:
            self._ramp_nominal = (self.flow_rated, self.head_rated, self.head_shutoff)
        q, h, h0 = self._ramp_nominal
        self.flow_rated = q * lam
        self.head_rated = h * lam * lam
        self.head_shutoff = h0 * lam * lam

    def reset_relief_ramp(self) -> None:
        if self._ramp_nominal is not None:
            self.flow_rated, self.head_rated, self.head_shutoff = self._ramp_nominal
            self._ramp_nominal = None

    def _locked_rotor_head(self, flow_rate: float) -> float:
        """Head loss (m, signed with the flow) of the stopped pump."""
        if self.flow_rated <= 0:
            return 0.0
        x = flow_rate / self.flow_rated
        e = LOCKED_ROTOR_LINEAR_SHARE
        return self.head_rated * ((1.0 - e) * x * abs(x) + e * x)

    def _locked_rotor_head_derivative(self, flow_rate: float) -> float:
        if self.flow_rated <= 0:
            return 0.0
        x = flow_rate / self.flow_rated
        e = LOCKED_ROTOR_LINEAR_SHARE
        return self.head_rated * (2.0 * (1.0 - e) * abs(x) + e) / self.flow_rated

    def calculate_delta_p(self, flow_rate: float, density: float, viscosity: float = 0.001) -> float:
        """Pressure rise (Pa) at the given flow; negative when the pump acts as a resistance."""
        rho_g = density * GRAVITY
        if not getattr(self, 'active', True):
            return -rho_g * self._locked_rotor_head(flow_rate)
        # C ≤ 0: falling curve for forward flow, mirrored (rising) for reverse flow
        return rho_g * (self.head_shutoff + self.C_coeff * flow_rate * abs(flow_rate))

    def calculate_dp_derivative(self, flow_rate: float, density: float, viscosity: float = 0.001) -> float:
        rho_g = density * GRAVITY
        if not getattr(self, 'active', True):
            return -rho_g * self._locked_rotor_head_derivative(flow_rate)
        return 2.0 * rho_g * self.C_coeff * abs(flow_rate)

    def shaft_power(self) -> float:
        """Shaft power (W) at the current operating point (`pump_shaft_power`); 0 when stopped."""
        if not self.inlets or not self.outlets:
            return 0.0
        return pump_shaft_power(self.inlets[0].flow_rate, self.outlets[0].pressure - self.inlets[0].pressure,
                                self.efficiency, getattr(self, 'active', True))

    def calculate(self):
        """
        Updates the outlet port's state.
        """
        inlet = self.inlets[0]
        outlet = self.outlets[0]

        # NPSH check
        fluid_type = self.global_settings.fluid_type if self.global_settings else 'water'
        self.update_npsh(inlet)

        # Calculate the generated pressure
        dp = self.calculate_delta_p(inlet.flow_rate, inlet.density, inlet.viscosity)

        # Update outlet conditions
        outlet.pressure = inlet.pressure + dp
        outlet.flow_rate = inlet.flow_rate
        outlet.density = inlet.density
        outlet.viscosity = inlet.viscosity

        # Pump heat: dT = |dP|/(rho·cp)·(1−η)/η while the pump raises the pressure; a stopped or braking
        # pump (dP < 0) is a pure resistance, so all its pressure loss becomes heat (throttling)
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
