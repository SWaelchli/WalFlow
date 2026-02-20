from simulation.equipment.base_node import HydraulicNode

class Splitter(HydraulicNode):
    """
    A Junction Node that splits 1 inlet into multiple outlets.
    Physically: 
    - Pressure at all ports is identical (neglecting internal friction).
    - Inflow = Sum(Outflows)
    """
    def __init__(self, name: str, num_outlets: int = 2):
        super().__init__(name, node_type="splitter")
        self.add_inlet()
        for _ in range(num_outlets):
            self.add_outlet()

    def calculate(self):
        """
        Updates outlet states based on inlet state.
        In the final solver, the splitter acts as a constraint node.
        """
        inlet = self.inlets[0]
        for outlet in self.outlets:
            outlet.pressure = inlet.pressure
            outlet.density = inlet.density
            # Flow distribution is determined by the downstream resistance, 
            # not by the splitter itself.
        return 0.0
