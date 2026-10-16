from simulation.equipment.base_node import HydraulicNode

class MeasurePoint(HydraulicNode):
    """
    In-line measurement tap: a location in a line that instruments and remote control valves can sense.
    Physically:
    - 1 inlet, 1 outlet, no pressure drop (P_in = P_out, Q_in = Q_out).
    - Like the splitter it has no calculate_delta_p, so the solver treats it as a junction.
    """
    def __init__(self, name: str):
        super().__init__(name, node_type="measure_point")
        self.add_inlet()
        self.add_outlet()

    def calculate(self):
        """Passes the inlet state to the outlet unchanged."""
        inlet = self.inlets[0]
        outlet = self.outlets[0]
        outlet.pressure = inlet.pressure
        outlet.density = inlet.density
        outlet.viscosity = inlet.viscosity
        outlet.temperature = inlet.temperature
        return 0.0
