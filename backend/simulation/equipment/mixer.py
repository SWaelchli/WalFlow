from simulation.equipment.base_node import HydraulicNode

class Mixer(HydraulicNode):
    """
    A Junction Node that combines multiple inlets into 1 outlet.
    Physically:
    - Sum(Inflows) = Outflow
    - Pressure at all inlets must equal the outlet pressure (neglecting internal friction).
    """
    def __init__(self, name: str, num_inlets: int = 2):
        super().__init__(name, node_type="mixer")
        for _ in range(num_inlets):
            self.add_inlet()
        self.add_outlet()

    def calculate(self):
        """
        Updates outlet based on inlets.
        The mixer is a constraint node.
        """
        inlet_sum_q = sum(inlet.flow_rate for inlet in self.inlets)
        outlet = self.outlets[0]
        
        # Outflow is the sum of all inflows
        outlet.flow_rate = inlet_sum_q
        
        # All inlets must be at the same pressure as the outlet
        # In the solver, this will be used to calculate the residual error.
        outlet.pressure = self.inlets[0].pressure
        outlet.density = self.inlets[0].density
        
        return 0.0
