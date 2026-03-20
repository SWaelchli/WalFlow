from simulation.equipment.base_node import HydraulicNode
from simulation.fluid_utils import FluidProperties

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
        Uses the standard liquid Cv formula: Q [GPM] = Cv * sqrt(dP [PSI] / SG)
        Converted to SI: dP [Pa] = (1.732e9 * rho * Q^2) / Cv^2
        """
        # Prevent division by zero mathematically. 
        # A "closed" valve is just simulated as having an incredibly small opening.
        effective_opening = max(0.001, self.opening_pct / 100.0)
        
        # Calculate the effective Cv (assuming a linear trim)
        cv_eff = self.max_cv * effective_opening
        
        # Conversion constant: (15850.32^2 * 6894.76 / 1000) approx 1.732e9
        K_CV_SI = 1.732e9
        
        dp = (K_CV_SI * density * flow_rate * abs(flow_rate)) / (cv_eff**2)
        
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
        
        self.calculate_temperature()
        
        return dp
