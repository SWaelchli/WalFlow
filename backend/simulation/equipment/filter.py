from simulation.equipment.base_node import HydraulicNode

class Filter(HydraulicNode):
    """
    A Filter/Strainer with clogging logic.
    User defines pressure drop at a reference flow for clean and dirty states.
    """
    def __init__(self, name: str, 
                 dp_clean_bar: float = 0.2, 
                 dp_terminal_bar: float = 1.0, 
                 flow_ref_lmin: float = 100.0,
                 clogging_pct: float = 0.0):
        super().__init__(name, node_type="filter")
        
        # Inputs
        self.dp_clean = dp_clean_bar * 100000.0
        self.dp_terminal = dp_terminal_bar * 100000.0
        self.flow_ref = flow_ref_lmin / 60000.0 # Convert to m3/s
        self.clogging_pct = clogging_pct
        
        self.add_inlet()
        self.add_outlet()

    def get_resistance_k(self):
        """Calculates current K factor based on clogging level."""
        # Density reference (assume water-like for K derivation if not provided, 
        # but we use the actual density in calculation)
        rho_ref = 1000.0 
        
        # K = dP / (rho * Q^2)
        # Avoid division by zero if flow_ref is 0
        q_ref = max(1e-9, self.flow_ref)
        k_clean = self.dp_clean / (rho_ref * q_ref**2)
        k_terminal = self.dp_terminal / (rho_ref * q_ref**2)
        
        # Linear interpolation of resistance
        clog_factor = self.clogging_pct / 100.0
        return k_clean + clog_factor * (k_terminal - k_clean)

    def calculate_delta_p(self, flow_rate: float, density: float, viscosity: float = 0.001) -> float:
        k_curr = self.get_resistance_k()
        return k_curr * density * flow_rate * abs(flow_rate)

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
        
        self.calculate_temperature()
        return dp
