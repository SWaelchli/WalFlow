from simulation.equipment.base_node import HydraulicNode

class Mixer(HydraulicNode):
    """
    A Junction Node that combines multiple inlets into 1 outlet.
    Physically:
    - Sum(mass inflows) = mass outflow (solver node row)
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
        The mixer is a constraint node; the port flows are the solved edge flows.
        """
        outlet = self.outlets[0]

        # All inlets must be at the same pressure as the outlet
        # In the solver, this will be used to calculate the residual error.
        outlet.pressure = self.inlets[0].pressure
        
        self.calculate_temperature()

        # Every port with outward flow reports density and viscosity at the mixed temperature: the outlet,
        # and inlets that carry reverse flow back to their pipe
        self.update_outward_properties()

        return 0.0
