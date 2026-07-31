from simulation.equipment.base_node import HydraulicNode
from simulation.fluid_utils import FluidProperties
import math

class LinearControlValve(HydraulicNode):
    """
    A control valve with a linear trim characteristic.
    Effective Cv = Max Cv * (Opening / 100)
    """
    def __init__(self, name: str, max_cv: float, opening_pct: float = 100.0):
        super().__init__(name, node_type="linear_control_valve")
        self.max_cv = max_cv            # Maximum flow coefficient capacity
        self.opening_pct = opening_pct  # 0.0 (closed) to 100.0 (fully open)
        
        self.add_inlet()
        self.add_outlet()

    def calculate_delta_p(self, flow_rate: float, density: float, viscosity: float = 0.001) -> float:
        """
        Calculates pressure drop across the valve based on its current position.
        Uses the liquid Cv formula with IEC 60534-2-1 viscosity correction (Fr).
        """
        if self.opening_pct == 0.0:
            # Block flow completely using a very high linear resistance
            stiffness = 1e12
            return stiffness * flow_rate

        # Prevent division by zero mathematically. 
        # A "closed" valve is just simulated as having an incredibly small opening.
        effective_opening = max(0.001, self.opening_pct / 100.0)
        
        # Calculate the effective Cv (assuming a linear trim)
        cv_eff = self.max_cv * effective_opening
        
        # Viscosity correction via Valve Reynolds number (IEC 60534-2-1 principle)
        d_v = max(0.002, 0.01 * math.sqrt(cv_eff))
        v_v = flow_rate / (0.25 * math.pi * d_v**2)
        re_v = (density * abs(v_v) * d_v) / max(1e-7, viscosity)
        
        fr = FluidProperties.get_valve_fr(re_v)
        cv_eff_adj = max(0.0001, cv_eff * fr)
        
        # Conversion constant: (15850.32^2 * 6894.76 / 1000) approx 1.732e9
        K_CV_SI = 1.732e9
        
        dp = (K_CV_SI * density * flow_rate * abs(flow_rate)) / (cv_eff_adj**2)
        
        return dp

    def calculate(self):
        """
        Updates the outlet port's state based on the friction loss.
        """
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
