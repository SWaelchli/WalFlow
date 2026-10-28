import math
from simulation.schemas import Port
from simulation.fluid_utils import FluidProperties
from simulation.equipment.base_node import Q_DEAD_LEG


def canvas_id(node_id: str) -> str:
    """The canvas id of a solver node: an in-line component's hidden port node `<id>#port-k` maps to `<id>`."""
    return node_id.split('#')[0]


class ComponentLink:
    """
    The solver edge of an in-line component with neutral ports (orifice, calibrated restriction, filter), as EPANET
    models a valve: a link from the hidden node at the component's port 0 to the hidden node at its port 1. Both
    nodes are solved, so each port has a solved pressure like any node port. The drop is odd in the flow, so the
    flow sign picks the upstream port; the port order only sets the sign of the edge flow.

    The solver uses it like a Pipe: two end ports (inlets / outlets, port 0 / port 1), the total-pressure drop and
    its slope, the end velocity heads and a property pass. The component is evaluated at its upstream volume flow
    and the fluid of its upstream port, as it was as a node.
    """
    # Its ends are hidden nodes, never a reservoir
    inlet_at_reservoir = False
    outlet_at_reservoir = False

    def __init__(self, component, global_settings):
        self.component = component
        self.global_settings = global_settings
        self.inlets, self.outlets = [Port()], [Port()]
        self.adjacent = [None, None]   # the pipe on port 0 / port 1 (None on a free port), for the velocity heads

    def upstream_port(self) -> Port:
        """The end the flow enters by (last property pass)."""
        return self.inlets[0] if self.inlets[0].flow_rate >= 0 else self.outlets[0]

    def _scale(self) -> float:
        """Edge flow -> upstream volume flow: the edge flow is at the density where it arrives (last property pass)."""
        up = self.upstream_port()
        down = self.outlets[0] if up is self.inlets[0] else self.inlets[0]
        return down.density / max(1e-9, up.density)

    def _dp(self, q: float, density: float, viscosity: float) -> float:
        return math.copysign(self.component.calculate_delta_p(abs(q), density, viscosity), q)

    def stagnation_delta_p(self, flow_rate: float, density: float, viscosity: float) -> float:
        """Total-pressure drop from port 0 to port 1, the edge row of the solve, at the upstream fluid."""
        return self._dp(flow_rate * self._scale(), density, viscosity)

    def stagnation_dp_derivative(self, flow_rate: float, density: float, viscosity: float) -> float:
        scale = self._scale()
        q = flow_rate * scale
        h = max(1e-10, 1e-6 * abs(q))
        return (self._dp(q + h, density, viscosity) - self._dp(q - h, density, viscosity)) / (2.0 * h) * scale

    def end_heads(self, flow_rate: float):
        """Velocity heads at the two ends: those of the adjacent pipes, so a hidden node reports one static pressure."""
        rho = self.upstream_port().density
        return tuple(p.velocity_head(flow_rate, rho) if p is not None else 0.0 for p in self.adjacent)

    def calculate(self):
        """Property pass: the downstream end gets the upstream fluid plus the throttling heat dT = |dp| / (rho cp).
        A component with a pipe bore (orifice beta, calibrated restriction) takes the bore of the upstream pipe, the
        downstream one on a free port, held fixed until the next pass like the fluid. Without flow (below Q_DEAD_LEG)
        the bore stays, so solver noise around zero does not swap it between passes."""
        q = self.inlets[0].flow_rate
        up, down = (self.inlets[0], self.outlets[0]) if q >= 0 else (self.outlets[0], self.inlets[0])
        pipe = self.adjacent[0 if q >= 0 else 1] or self.adjacent[1 if q >= 0 else 0]
        if (abs(q) > Q_DEAD_LEG and pipe is not None and pipe.diameter > 0
                and hasattr(self.component, 'pipe_diameter')):
            self.component.pipe_diameter = pipe.diameter
        dp = self.component.calculate_delta_p(abs(q * self._scale()), up.density, up.viscosity)
        fluid = getattr(self.global_settings, 'fluid_type', 'water')
        down.temperature = up.temperature + dp / (up.density * FluidProperties.get_specific_heat(fluid, up.temperature))
        down.density = FluidProperties.get_density(fluid, down.temperature)
        down.viscosity = FluidProperties.get_viscosity(fluid, down.temperature)

    def report(self, port0: Port, port1: Port):
        """Fills the component's ports from the hidden nodes' reported ports (static and total pressure, fluid) and
        the edge flow at each port's density, flow_rate positive into the component."""
        q = self.inlets[0].flow_rate
        mass = q * (self.outlets[0].density if q >= 0 else self.inlets[0].density)   # at the arrival density
        for port, node_port, sign in ((self.component.ports[0], port0, 1.0), (self.component.ports[1], port1, -1.0)):
            port.pressure, port.total_pressure = node_port.pressure, node_port.total_pressure
            port.temperature, port.density, port.viscosity = node_port.temperature, node_port.density, node_port.viscosity
            port.stagnant = node_port.stagnant
            port.flow_rate = sign * mass / max(1e-9, port.density)
