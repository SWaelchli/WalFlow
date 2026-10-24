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
        Equal pressure at all ports. Temperatures come from calculate_temperature (enthalpy mix of the
        ports with inward flow) and are not overwritten here; the outward ports get density and
        viscosity at that temperature. Flow distribution is set by the connected resistances.
        """
        inlet = self.inlets[0]
        stagnant = not self.has_inflow()
        for outlet in self.outlets:
            outlet.pressure = inlet.pressure
            if stagnant:
                outlet.temperature = inlet.temperature
        self.update_outward_properties()
        return 0.0
