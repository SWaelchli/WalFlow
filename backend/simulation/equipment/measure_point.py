from simulation.equipment.junction import Junction


class MeasurePoint(Junction):
    """
    In-line measurement tap: a location in a line that instruments and remote control valves can sense.
    A junction of two neutral ports (port-0, port-1): one total pressure, mass flow in = mass flow out. The pin
    signal-port-0 senses the node.
    """
    def __init__(self, name: str):
        super().__init__(name, num_ports=2)
        self.node_type = "measure_point"
