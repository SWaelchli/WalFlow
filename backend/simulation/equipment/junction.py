from simulation.equipment.base_node import HydraulicNode

class Junction(HydraulicNode):
    """
    A junction of 3 to 8 neutral ports (port-0 .. port-(N-1)), each usable as inlet or outlet.
    Physically:
    - One total pressure at all ports (no tee loss).
    - Sum of mass flows into the node = 0 (solver node row).

    The solver works with inlets and outlets: the parser gives each connected port an inlet slot when the pipe is
    drawn into the junction and an outlet slot when it is drawn out of it (assign_port). Flows are signed, so the
    drawn direction only sets the sign. port_slots maps a port index to its slot for the telemetry.
    """
    MIN_PORTS = 3
    MAX_PORTS = 8
    # All ports share one total pressure: the dead-port rule of the static pressure report takes all of them as one side
    single_side = True

    def __init__(self, name: str, num_ports: int = 3):
        super().__init__(name, node_type="junction")
        self.num_ports = num_ports
        self.port_slots = {}   # port index -> ("inlet" | "outlet", slot index)

    def assign_port(self, port_idx: int, as_inlet: bool) -> str:
        """Slot handle ("inlet-i" / "outlet-i") for a pipe on port_idx, drawn into (as_inlet) or out of the junction."""
        if port_idx in self.port_slots:
            raise ValueError(f"Port {port_idx + 1} takes one pipe")  # 1-based, as on the canvas
        if as_inlet:
            self.add_inlet()
            slot = ("inlet", len(self.inlets) - 1)
        else:
            self.add_outlet()
            slot = ("outlet", len(self.outlets) - 1)
        self.port_slots[port_idx] = slot
        return f"{slot[0]}-{slot[1]}"

    def port(self, port_idx: int):
        """The slot port of port_idx, or None when no pipe is on it."""
        slot = self.port_slots.get(port_idx)
        if slot is None:
            return None
        return (self.inlets if slot[0] == "inlet" else self.outlets)[slot[1]]

    def port_flow_into(self, port_idx: int) -> float:
        """Volume flow into the junction through port_idx (positive in, negative out; 0 without a pipe)."""
        slot = self.port_slots.get(port_idx)
        if slot is None:
            return 0.0
        q = self.port(port_idx).flow_rate
        return q if slot[0] == "inlet" else -q

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
