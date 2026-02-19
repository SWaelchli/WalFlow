from simulation.equipment.base_node import HydraulicNode

class Valve(HydraulicNode):
    """
    A control valve that creates a variable pressure drop based on its opening percentage.
    """
    def __init__(self, name: str, max_cv: float, opening_pct: float = 100.0):
        super().__init__(name, node_type="valve")
        self.max_cv = max_cv            # Maximum flow coefficient capacity
        self.opening_pct = opening_pct  # 0.0 (closed) to 100.0 (fully open)
        
        self.add_inlet()
        self.add_outlet()

    def calculate_delta_p(self, flow_rate: float, density: float) -> float:
        """
        Calculates pressure drop across the valve based on its current position.
        """
        # Prevent division by zero mathematically. 
        # A "closed" valve is just simulated as having an incredibly small opening.
        effective_opening = max(0.001, self.opening_pct / 100.0)
        
        # Calculate the effective Cv (assuming a linear trim for simplicity)
        cv_eff = self.max_cv * effective_opening
        
        # Calculate pressure drop. We use (flow_rate * abs(flow_rate)) to preserve flow direction stability
        dp = (density / 2.0) * (flow_rate * abs(flow_rate)) / (cv_eff**2)
        
        return abs(dp)

    def calculate(self):
        """
        Updates the outlet port's state based on the friction loss.
        """
        inlet = self.inlets[0]
        outlet = self.outlets[0]
        
        dp = self.calculate_delta_p(inlet.flow_rate, inlet.density)
        
        outlet.pressure = inlet.pressure - dp
        outlet.flow_rate = inlet.flow_rate
        outlet.density = inlet.density
        
        return dp