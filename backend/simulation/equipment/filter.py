from simulation.equipment.base_node import HydraulicNode

class Filter(HydraulicNode):
    """
    A Filter with a pressure drop dependent on flow, viscosity, and clogging.
    """
    def __init__(self, name: str, resistance_clean: float = 1e6, clogging_factor: float = 1.0):
        """
        resistance_clean: Pa/(m^3/s * Pa*s) - Resistance when clean
        clogging_factor: Multiplier for resistance (1.0 = clean, higher = dirty)
        """
        super().__init__(name, node_type="filter")
        self.resistance_clean = resistance_clean
        self.clogging_factor = clogging_factor
        
        self.add_inlet()
        self.add_outlet()

    def calculate_delta_p(self, flow_rate: float, density: float, viscosity: float) -> float:
        """
        Laminar-style pressure drop: DeltaP = R * mu * Q
        """
        return self.resistance_clean * self.clogging_factor * viscosity * abs(flow_rate)

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
