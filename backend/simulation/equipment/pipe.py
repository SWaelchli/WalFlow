from simulation.equipment.base_node import HydraulicNode
from simulation.fluid_utils import FluidProperties
import math

class Pipe(HydraulicNode):
    """
    A Pipe connects two nodes and calculates the pressure drop caused by fluid friction.
    It also calculates temperature rise due to viscous dissipation.

    An end attached to a reservoir (tank or pressure source, fluid at rest) adds the entry velocity
    head (1 + K) rho v² / 2 while the flow leaves the reservoir there; the network sets the flags.
    """
    RESERVOIR_ENTRY_K = 0.5   # sharp-edged entrance (Crane TP 410, A-29)
    def __init__(
        self,
        name: str,
        length: float,
        diameter: float,
        roughness: float = 0.000045,
        friction_factor: float = 0.02
    ):
        # Call the parent class constructor to set up the ID and lists        
        super().__init__(name, node_type="pipe")
        
        self.length = length                    # Pipe length (meters)
        self.diameter = diameter                # Internal diameter (meters)
        self.roughness = roughness              # Absolute surface roughness (meters)
        self.friction_factor = friction_factor  # Darcy friction factor (f)
        
        # Precalculate invariant geometric terms
        self.area = math.pi * (self.diameter / 2.0)**2 if self.diameter > 0 else 1e-6
        eps = self.roughness if (self.roughness is not None and self.roughness > 0) else 0.000045
        self.rel_roughness_term = eps / (3.7 * self.diameter) if self.diameter > 0 else 0.0

        # Set by HydraulicNetwork for the ends connected to a pressure boundary
        self.inlet_at_reservoir = False
        self.outlet_at_reservoir = False

        # A pipe requires exactly one inlet and one outlet
        self.add_inlet()
        self.add_outlet()

    def _friction_factor(self, re: float) -> float:
        """Darcy friction factor from the Churchill (1977) equation (F1-21): one continuous expression for
        laminar (64/Re), transition and turbulent (Colebrook-like) flow, so the solver sees no blend band."""
        if re < 10.0:
            return 64.0 / re
        eps_over_d = self.rel_roughness_term * 3.7
        a = (2.457 * math.log(1.0 / ((7.0 / re) ** 0.9 + 0.27 * eps_over_d))) ** 16
        b = (37530.0 / re) ** 16
        return 8.0 * ((8.0 / re) ** 12 + 1.0 / (a + b) ** 1.5) ** (1.0 / 12.0)

    def _leaves_reservoir(self, flow_rate: float) -> bool:
        """True when the flow enters the pipe from a reservoir end (inlet side for q > 0, outlet side for q < 0)."""
        return (flow_rate > 0 and self.inlet_at_reservoir) or (flow_rate < 0 and self.outlet_at_reservoir)

    def _entry_dp(self, flow_rate: float, density: float) -> float:
        """Signed entry velocity head (1 + K) rho v|v| / 2, zero unless the flow leaves a reservoir end.
        Zero value and slope at q = 0, so the switch between the two ends is C1-continuous."""
        if not self._leaves_reservoir(flow_rate):
            return 0.0
        velocity = flow_rate / self.area
        return (1.0 + self.RESERVOIR_ENTRY_K) * density * velocity * abs(velocity) / 2.0

    def _entry_dp_derivative(self, flow_rate: float, density: float) -> float:
        """d(_entry_dp)/dQ."""
        if not self._leaves_reservoir(flow_rate):
            return 0.0
        return (1.0 + self.RESERVOIR_ENTRY_K) * density * abs(flow_rate) / self.area ** 2

    def _friction_dp(self, flow_rate: float, density: float, viscosity: float) -> float:
        """Darcy-Weisbach with the Churchill friction factor, continuous from laminar to fully turbulent flow."""
        velocity = flow_rate / self.area
        abs_v = abs(velocity)

        if viscosity > 0 and abs_v > 0:
            re = (density * abs_v * self.diameter) / viscosity

            f = self._friction_factor(re)
        else:
            f = 0.0

        return f * (self.length / self.diameter) * (density * velocity * abs_v / 2.0)

    def calculate_delta_p(self, flow_rate: float, density: float, viscosity: float) -> float:
        """
        Static pressure drop: wall friction plus the entry velocity head at a reservoir end.
        """
        if self.diameter <= 0:
            raise ValueError("Pipe diameter must be strictly positive.")
        return self._friction_dp(flow_rate, density, viscosity) + self._entry_dp(flow_rate, density)

    def calculate(self):
        inlet = self.inlets[0]
        outlet = self.outlets[0]
        if self.diameter <= 0:
            raise ValueError("Pipe diameter must be strictly positive.")
        dp_friction = self._friction_dp(inlet.flow_rate, inlet.density, inlet.viscosity)
        dp_entry = self._entry_dp(inlet.flow_rate, inlet.density)
        dp = dp_friction + dp_entry
        # Accelerating the fluid from rest is reversible; only friction and the entrance loss become heat
        k = self.RESERVOIR_ENTRY_K
        dp_loss = dp_friction + dp_entry * k / (1.0 + k)

        outlet.pressure = inlet.pressure - dp
        outlet.flow_rate = inlet.flow_rate

        fluid_type = getattr(self.global_settings, 'fluid_type', 'water')
        if inlet.flow_rate >= 0:
            cp = FluidProperties.get_specific_heat(fluid_type, inlet.temperature)
            dt = abs(dp_loss) / (inlet.density * cp)
            outlet.temperature = inlet.temperature + dt
            outlet.density = FluidProperties.get_density(fluid_type, outlet.temperature)
            outlet.viscosity = FluidProperties.get_viscosity(fluid_type, outlet.temperature)
            inlet.density = FluidProperties.get_density(fluid_type, inlet.temperature)
            inlet.viscosity = FluidProperties.get_viscosity(fluid_type, inlet.temperature)
        else:
            cp = FluidProperties.get_specific_heat(fluid_type, outlet.temperature)
            dt = abs(dp_loss) / (outlet.density * cp)
            inlet.temperature = outlet.temperature + dt
            inlet.density = FluidProperties.get_density(fluid_type, inlet.temperature)
            inlet.viscosity = FluidProperties.get_viscosity(fluid_type, inlet.temperature)
            outlet.density = FluidProperties.get_density(fluid_type, outlet.temperature)
            outlet.viscosity = FluidProperties.get_viscosity(fluid_type, outlet.temperature)
        return dp

    def calculate_dp_derivative(self, flow_rate: float, density: float, viscosity: float) -> float:
        if self.diameter <= 0:
            raise ValueError("Pipe diameter must be strictly positive.")
        return self._friction_dp_derivative(flow_rate, density, viscosity) + self._entry_dp_derivative(flow_rate, density)

    def _friction_dp_derivative(self, flow_rate: float, density: float, viscosity: float) -> float:
        velocity = flow_rate / self.area
        abs_v = abs(velocity)
        
        if viscosity > 0 and abs_v > 0:
            re = (density * abs_v * self.diameter) / viscosity

            # dP = f(Re) (L/D) rho Q|Q| / (2 A^2), Re ~ |Q|  ->  dP/dQ = (L/D) rho |Q| / (2 A^2) (2 f + dF/dlnRe)
            f = self._friction_factor(re)
            h = 1e-4
            dfdlnre = (self._friction_factor(re * (1.0 + h)) - self._friction_factor(re * (1.0 - h))) / (2.0 * h)
            return (self.length / self.diameter) * density * abs(flow_rate) / (2.0 * self.area ** 2) * (2.0 * f + dfdlnre)
        elif viscosity > 0:
            # Zero flow: laminar limit instead of a zero slope, so a dead leg keeps a usable Jacobian
            return 32.0 * viscosity * self.length / ((self.diameter ** 2) * self.area)
        else:
            return 0.0
