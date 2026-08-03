from simulation.equipment.base_node import HydraulicNode
from simulation.fluid_utils import FluidProperties
import math

class RemoteControlValve(HydraulicNode):
    """
    A Control Valve that maintains a set point at a REMOTE location.
    Its opening_pct is adjusted by the solver to reach the target pressure
    at the connected SensingNode.
    """
    def __init__(self, name: str, max_cv: float, set_pressure: float = 500000.0, backpressure: bool = False):
        super().__init__(name, node_type="remote_control_valve")
        self.max_cv = max_cv
        self.set_pressure = set_pressure
        self.backpressure = backpressure
        
        # Configuration for remote sensing: {"node_id": str, "port_type": "inlet"|"outlet", "port_idx": int}
        self.remote_sensing_config = None
        
        # Current physical opening (adjusted by solver)
        self.opening_pct = 100.0
        self.sensed_pressure = 0.0
        
        self.add_inlet()
        self.add_outlet()

    def calculate_delta_p(self, flow_rate: float, density: float, viscosity: float = 0.001) -> float:
        """Standard Cv-based dP using current opening_pct with IEC viscosity correction."""
        # Clamp opening to physical limits
        eff_opening = max(0.001, min(100.0, self.opening_pct)) / 100.0
        cv_eff = self.max_cv * eff_opening
        
        # Viscosity correction via Valve Reynolds number (IEC 60534-2-1 principle)
        d_v = max(0.002, 0.01 * math.sqrt(cv_eff))
        v_v = flow_rate / (0.25 * math.pi * d_v**2)
        re_v = (density * abs(v_v) * d_v) / max(1e-7, viscosity)
        
        fr = FluidProperties.get_valve_fr(re_v)
        cv_eff_adj = max(0.0001, cv_eff * fr)
        
        K_CV_SI = 1.732e9
        dp = (K_CV_SI * density * flow_rate * abs(flow_rate)) / (cv_eff_adj**2)
        
        return dp

    def calculate_dp_derivative(self, flow_rate: float, density: float, viscosity: float = 0.001) -> float:
        eff_opening = max(0.001, min(100.0, self.opening_pct)) / 100.0
        cv_eff = self.max_cv * eff_opening
        d_v = max(0.002, 0.01 * math.sqrt(cv_eff))
        v_v = flow_rate / (0.25 * math.pi * d_v**2)
        re_v = (density * abs(v_v) * d_v) / max(1e-7, viscosity)
        fr = FluidProperties.get_valve_fr(re_v)
        cv_eff_adj = max(0.0001, cv_eff * fr)
        K_CV_SI = 1.732e9
        return (2.0 * K_CV_SI * density * abs(flow_rate)) / (cv_eff_adj**2)

    def calculate(self):

        inlet = self.inlets[0]
        outlet = self.outlets[0]
        dp = self.calculate_delta_p(inlet.flow_rate, inlet.density, inlet.viscosity)
        outlet.pressure = inlet.pressure - dp
        outlet.flow_rate = inlet.flow_rate
        outlet.density = inlet.density
        outlet.viscosity = inlet.viscosity
        
        # Throttling Heat: dT = abs(dP) / (rho * Cp)
        fluid_type = getattr(self.global_settings, 'fluid_type', 'water')
        from simulation.fluid_utils import FluidProperties
        
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
