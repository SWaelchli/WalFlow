from simulation.equipment.base_node import NeutralPortNode

class Junction(NeutralPortNode):
    """
    A junction of 3 to 8 neutral ports (port-0 .. port-(N-1)), each usable as inlet or outlet.
    Physically:
    - One total pressure at all ports (no tee loss).
    - Sum of mass flows into the node = 0 (solver node row).

    Ports, slots and telemetry: see NeutralPortNode.
    """
    MIN_PORTS = 3
    MAX_PORTS = 8

    def __init__(self, name: str, num_ports: int = 3):
        super().__init__(name, node_type="junction", num_ports=num_ports)

    def calculate(self):
        """
        One pressure at all ports. Temperatures come from calculate_temperature (enthalpy mix of the ports with
        inward flow) and are not overwritten; the outward ports get density and viscosity at that temperature.
        Without inflow (stagnant junction) the ports take the temperature of the lowest connected port-k, so the
        result does not depend on the drawn pipe directions.
        """
        ports = self.inlets + self.outlets
        if not ports:
            return 0.0
        ref = self.port(min(self.port_slots)) if self.port_slots else ports[0]
        stagnant = not self.has_inflow()
        for port in ports:
            if port is ref:
                continue
            port.pressure = ref.pressure
            if stagnant:
                port.temperature = ref.temperature
        self.update_outward_properties()
        return 0.0
