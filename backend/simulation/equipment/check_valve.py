from simulation.equipment.base_node import HydraulicNode
from simulation.fluid_utils import FluidProperties
import math

class CheckValve(HydraulicNode):
    """
    A check valve (non-return valve) that permits fluid flow in only one direction.
    Requires a minimum cracking pressure to open in the forward direction.
    """
    def __init__(self, name: str, cv: float = 10.0, cracking_pressure_bar: float = 0.05):
        super().__init__(name, node_type="check_valve")
        self.cv = max(0.001, cv)
        self.cracking_pressure_bar = max(0.0, cracking_pressure_bar)
        
        self.add_inlet()
        self.add_outlet()

    def calculate_delta_p(self, flow_rate: float, density: float, viscosity: float = 0.001) -> float:
        """
        Calculates pressure drop across the check valve with viscosity correction.
        Uses hyperbolic tangent smoothing around Q = 0 to prevent jump discontinuities in derivatives.
        """
        K_CV_SI = 1.732e9
        cracking_pa = self.cracking_pressure_bar * 100000.0

        # Width scale for transition (1e-5 m3/s = 0.6 L/min)
        scale = 1e-5

        # Smoothed cracking pressure term
        cracking_term = cracking_pa * math.tanh(flow_rate / scale)

        # Sigmoid blend factor for valve open/closed state
        s = 0.5 * (1.0 + math.tanh(flow_rate / scale))

        effective_cv = self.cv
        d_v = max(0.002, 0.01 * math.sqrt(effective_cv))
        v_v = flow_rate / (0.25 * math.pi * d_v**2) if d_v > 0 else 0.0
        re_v = (density * abs(v_v) * d_v) / max(1e-7, viscosity)
        fr = FluidProperties.get_valve_fr(re_v)
        cv_adj = max(0.0001, effective_cv * fr)

        # Blended Cv: transitions smoothly from open cv_adj to closed leak cv (1e-4)
        cv_blended = s * cv_adj + (1.0 - s) * 1e-4

        dp_friction = (K_CV_SI * density * flow_rate * abs(flow_rate)) / (cv_blended ** 2)
        return cracking_term + dp_friction

    def calculate(self):
        """
        Updates outlet conditions and status telemetry based on flow state.
        """
        inlet = self.inlets[0]
        outlet = self.outlets[0]

        dp = self.calculate_delta_p(inlet.flow_rate, inlet.density, inlet.viscosity)

        outlet.pressure = inlet.pressure - dp
        outlet.flow_rate = inlet.flow_rate
        outlet.density = inlet.density
        outlet.viscosity = inlet.viscosity

        fluid_type = getattr(self.global_settings, 'fluid_type', 'water')
        if inlet.flow_rate >= 0:
            cp = FluidProperties.get_specific_heat(fluid_type, inlet.temperature)
            dt = abs(dp) / (inlet.density * cp)
            outlet.temperature = inlet.temperature + dt
        else:
            cp = FluidProperties.get_specific_heat(fluid_type, outlet.temperature)
            dt = abs(dp) / (outlet.density * cp)
            inlet.temperature = outlet.temperature + dt

        # Dynamically update local properties based on temperature feedback
        outlet.density = FluidProperties.get_density(fluid_type, outlet.temperature)
        outlet.viscosity = FluidProperties.get_viscosity(fluid_type, outlet.temperature)
        inlet.density = FluidProperties.get_density(fluid_type, inlet.temperature)
        inlet.viscosity = FluidProperties.get_viscosity(fluid_type, inlet.temperature)

        self.calculate_temperature()
        return dp
