from simulation.equipment.base_node import HydraulicNode

class MeasurePoint(HydraulicNode):
    """
    In-line measurement tap: a location in a line that instruments and remote control valves can sense.
    Physically:
    - 1 inlet, 1 outlet, no pressure drop (P_in = P_out, mass flow in = mass flow out).
    - Like the junction it has no calculate_delta_p, so the solver treats it as a junction node.
    """
    def __init__(self, name: str):
        super().__init__(name, node_type="measure_point")
        self.add_inlet()
        self.add_outlet()

    def calculate(self):
        """Passes the inlet pressure to the outlet. The temperature follows the flow (calculate_temperature),
        as in the junction; density and viscosity of the outward port at its temperature."""
        inlet = self.inlets[0]
        outlet = self.outlets[0]
        outlet.pressure = inlet.pressure
        if not self.has_inflow():
            outlet.temperature = inlet.temperature
        self.update_outward_properties()
        return 0.0
