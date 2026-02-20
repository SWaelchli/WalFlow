from simulation.equipment.base_node import HydraulicNode

class HeatExchanger(HydraulicNode):
    """
    A Heat Exchanger that adds or removes thermal energy from the fluid.
    """
    def __init__(self, name: str, heat_duty: float = 0.0, pressure_drop_factor: float = 0.01):
        """
        heat_duty: Watts (Positive = Heating, Negative = Cooling)
        pressure_drop_factor: Simple K-factor for resistance calculation
        """
        super().__init__(name, node_type="heat_exchanger")
        self.heat_duty = heat_duty
        self.k_factor = pressure_drop_factor
        
        self.add_inlet()
        self.add_outlet()

    def calculate_delta_p(self, flow_rate: float, density: float, viscosity: float) -> float:
        """
        Simple quadratic pressure drop for the HX internals.
        """
        # DeltaP = K * rho * v^2 / 2. Simplified to K * Q^2 for HX.
        return self.k_factor * density * (flow_rate ** 2)

    def calculate_temperature(self):
        """
        Overrides base to add/remove heat.
        Q_dot = m_dot * Cp * delta_T
        delta_T = Q_dot / (m_dot * Cp)
        """
        # print(f"DEBUG HX: Calling calculate_temperature for {self.name}")
        # First, do standard mixing if there are multiple inlets
        super().calculate_temperature()
        
        inlet = self.inlets[0]
        outlet = self.outlets[0]
        
        mass_flow = abs(inlet.flow_rate) * inlet.density
        
        if mass_flow > 0.0001:
            # Specific heat capacity (Cp). 
            cp = 4180 if inlet.density > 950 else 2000
            
            delta_t = self.heat_duty / (mass_flow * cp)
            outlet.temperature = inlet.temperature + delta_t
        else:
            outlet.temperature = inlet.temperature

    def calculate(self):
        inlet = self.inlets[0]
        outlet = self.outlets[0]
        
        dp = self.calculate_delta_p(inlet.flow_rate, inlet.density, inlet.viscosity)
        
        outlet.pressure = inlet.pressure - dp
        outlet.flow_rate = inlet.flow_rate
        outlet.density = inlet.density
        outlet.viscosity = inlet.viscosity
        
        self.calculate_temperature()
        
        return dp
