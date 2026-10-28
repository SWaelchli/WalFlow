"""Hypothesis strategies for the property tests: fluid states, flows and equipment built through the parser.

Equipment is generated as the node `data` a saved file would hold and built with GraphParser.create_node,
so the parser's defaults, unit conversions and input checks apply exactly as in the app. Parameter ranges
cover what a user can plausibly enter; widen a range when a bug shows it was too narrow.
"""
import math

from hypothesis import strategies as st

from simulation.equipment.junction import Junction
from simulation.fluid_utils import FluidProperties
from simulation.graph_parser import GraphParser
from simulation.schemas import GlobalSettings, ReactFlowNode

FLUIDS = sorted(FluidProperties.FLUIDS)


def log_uniform(lo: float, hi: float):
    """Floats spread evenly over the decades between lo and hi (both > 0)."""
    return st.floats(math.log(lo), math.log(hi)).map(math.exp)


@st.composite
def fluid_states(draw, fluids=FLUIDS):
    """(fluid id, temperature K, density, viscosity) inside the fluid's correlation range."""
    fluid = draw(st.sampled_from(fluids))
    t_min, t_max = FluidProperties.temperature_range_c(fluid)
    temp_k = draw(st.floats(max(t_min, -20.0), min(t_max, 150.0))) + 273.15
    return fluid, temp_k, FluidProperties.get_density(fluid, temp_k), FluidProperties.get_viscosity(fluid, temp_k)


def flows(lo: float = 1e-7, hi: float = 0.2, signed: bool = True):
    """Volumetric flow (m³/s) from 0.006 L/min to 12 000 L/min, both directions when signed."""
    magnitude = log_uniform(lo, hi)
    if not signed:
        return magnitude
    return st.tuples(st.sampled_from([-1.0, 1.0]), magnitude).map(lambda t: t[0] * t[1])


def flow_ratios(lo: float = 1e-3, hi: float = 3.0):
    """Signed multiple of a component's rated flow. Use it where behaviour switches near the rating
    (pump curves, limits): absolute flows over many decades rarely land in those branches."""
    return st.tuples(st.sampled_from([-1.0, 1.0]), log_uniform(lo, hi)).map(lambda t: t[0] * t[1])


def _diameter_pair(lo=0.02, hi=0.3, beta=(0.2, 0.75)):
    return st.tuples(log_uniform(lo, hi), st.floats(*beta)).map(lambda t: (t[0], t[0] * t[1]))


# Node `data` of every two-port resistance: dP(Q) depends only on Q, density and viscosity.
RESISTANCE_DATA = {
    "orifice": _diameter_pair().flatmap(lambda d: st.fixed_dictionaries({
        "pipe_diameter_m": st.just(d[0]), "orifice_diameter_m": st.just(d[1]),
        "standard": st.sampled_from(["iso_5167", "classic_cd"])})),
    "linear_control_valve": st.fixed_dictionaries({
        "max_cv": log_uniform(0.01, 50.0), "opening_pct": st.floats(0.0, 100.0),
        "fl": st.floats(0.3, 1.0), "fd": st.floats(0.1, 1.0)}),
    "linear_regulator": st.fixed_dictionaries({"max_cv": log_uniform(0.01, 50.0)}),
    "remote_control_valve": st.fixed_dictionaries({
        "max_cv": log_uniform(0.01, 50.0), "fl": st.floats(0.3, 1.0), "fd": st.floats(0.1, 1.0)}),
    "filter": log_uniform(0.02, 1.0).flatmap(lambda clean: st.fixed_dictionaries({
        "dp_clean_bar": st.just(clean), "dp_terminal_bar": st.floats(1.5, 10.0).map(lambda k: clean * k),
        "flow_ref_lmin": log_uniform(10.0, 2000.0), "clogging_pct": st.floats(0.0, 100.0)})),
    "heat_exchanger": st.fixed_dictionaries({
        "rated_flow_lmin": log_uniform(10.0, 2000.0), "rated_dp_bar": log_uniform(0.02, 2.0)}),
    "reducer": st.fixed_dictionaries({
        "diameter_in_m": log_uniform(0.02, 0.3), "diameter_out_m": log_uniform(0.02, 0.3),
        "length_m": log_uniform(0.05, 0.5), "standard": st.just("CUSTOM")}),
    "check_valve_orifice": st.fixed_dictionaries({
        "cv": log_uniform(0.1, 50.0), "cracking_pressure_bar": st.floats(0.0, 1.0),
        "pipe_diameter_m": st.just(0.05), "orifice_diameter_m": log_uniform(0.002, 0.03)}),
    "calibrated_restriction": log_uniform(1.0, 5.0).flatmap(lambda p_out: st.fixed_dictionaries({
        "flow_base_lmin": log_uniform(1.0, 500.0), "outlet_pressure_base_bara": st.just(p_out),
        "inlet_pressure_base_bara": log_uniform(0.05, 20.0).map(lambda dp: p_out + dp),
        "temp_base_c": st.floats(0.0, 90.0),
        "restriction_model": st.sampled_from(["orifice", "laminar", "turbulent"])})),
}

# Valves whose opening the solver sets (controllers); the strategy draws it like a converged state.
CONTROLLED_OPENING = {"linear_regulator", "remote_control_valve"}

PUMP_DATA = {
    "centrifugal_pump": st.fixed_dictionaries({
        "flow_rated_lmin": log_uniform(10.0, 5000.0), "head_rated_m": log_uniform(5.0, 200.0),
        "rise_to_shutoff_pct": st.floats(5.0, 40.0), "active": st.booleans()}),
    "volumetric_pump": st.fixed_dictionaries({
        "flow_rated_lmin": log_uniform(1.0, 2000.0), "motor_power_kw": log_uniform(0.5, 200.0),
        "efficiency_pct": st.floats(30.0, 95.0), "max_discharge_pressure_bara": log_uniform(2.0, 300.0),
        "drive_type": st.sampled_from(["fixed_speed", "vfd_power_limit"]), "active": st.booleans()}),
}


def build(node_type: str, data: dict, fluid: str = "water"):
    """Equipment as the parser builds it from a saved node, with the system fluid in the global settings."""
    gs = GlobalSettings(fluid_type=fluid)
    node_data = ReactFlowNode(id="n", type=node_type, position={"x": 0, "y": 0}, data={"label": node_type, **data})
    return GraphParser.create_node(node_data, gs)


@st.composite
def pipes(draw):
    """Pipe with either end possibly at a reservoir (entry velocity head)."""
    from simulation.equipment.pipe import Pipe
    pipe = Pipe("pipe", length=draw(log_uniform(0.1, 500.0)), diameter=draw(log_uniform(0.005, 0.5)),
                roughness=draw(st.one_of(st.just(0.0), log_uniform(1e-6, 1e-3))))
    pipe.inlet_at_reservoir = draw(st.booleans())
    pipe.outlet_at_reservoir = draw(st.booleans())
    return pipe


# Every two-port resistance including the pipe (an edge, not a canvas node)
TWO_PORT_TYPES = sorted([*RESISTANCE_DATA, "pipe"])


@st.composite
def two_ports(draw, node_type: str):
    """(built node, fluid state) of one two-port resistance type. Tests parametrize over the type so each
    gets the full example budget and a failure names the component."""
    state = draw(fluid_states())
    if node_type == "pipe":
        return draw(pipes()), state
    node = build(node_type, draw(RESISTANCE_DATA[node_type]), state[0])
    if node_type in CONTROLLED_OPENING:
        node.opening_pct = draw(st.floats(0.0, 100.0))
    return node, state


@st.composite
def pumps(draw, node_type: str):
    """(built pump, fluid state) of one pump type, running or stopped."""
    state = draw(fluid_states())
    return build(node_type, draw(PUMP_DATA[node_type]), state[0]), state


# --- networks ------------------------------------------------------------------------------------

# Components placed inside generated networks. Their behaviour is a function of the local flow only,
# so every generated network has exactly one steady state; controllers, relief devices and the 3-way TCV
# have their own scenarios. The reducer joins pipes of different bores: the solve works on total pressures, so
# junctions of different diameters neither create nor lose kinetic energy.
NETWORK_COMPONENTS = {
    "reducer": RESISTANCE_DATA["reducer"],
    "orifice": RESISTANCE_DATA["orifice"],
    "linear_control_valve": st.fixed_dictionaries({
        "max_cv": log_uniform(0.5, 50.0), "opening_pct": st.floats(5.0, 100.0)}),
    "filter": RESISTANCE_DATA["filter"],
    "calibrated_restriction": RESISTANCE_DATA["calibrated_restriction"],
    "heat_exchanger": RESISTANCE_DATA["heat_exchanger"].flatmap(lambda d: st.fixed_dictionaries({
        **{k: st.just(v) for k, v in d.items()}, "medium_temp_c": st.floats(5.0, 60.0)})),
    "check_valve": st.fixed_dictionaries({"cv": log_uniform(0.5, 50.0), "cracking_pressure_bar": st.floats(0.0, 0.3)}),
    "measure_point": st.just({}),
}
# Components with two neutral ports (port-0, port-1): the in-line components (each a link between two hidden
# junctions) and the measure point (a two-port junction)
NEUTRAL_TWO_PORT = {"orifice", "filter", "calibrated_restriction", "measure_point"}
# Components that add no heat source or sink of their own other than dissipation
DISSIPATIVE_ONLY = set(NETWORK_COMPONENTS) - {"heat_exchanger"}


def _pipe_data():
    return st.fixed_dictionaries({"length_m": log_uniform(0.5, 200.0), "diameter_m": log_uniform(0.015, 0.2),
                                  "roughness_mm": st.sampled_from([0.0, 0.045, 0.5])})


@st.composite
def networks(draw, max_depth: int = 3, components=tuple(sorted(NETWORK_COMPONENTS))):
    """A saved-file graph (dict for ReactFlowGraph): a pressure source, a tank with a centrifugal pump, or two
    pressure sources at different temperatures joined in a junction, feeding a random series-parallel arrangement
    of components (junction pairs with 2 or 3 branches) into a tank. Every edge is a pipe with its own geometry.
    A junction has 1 to 2 ports more than it uses, its pipes sit on shuffled ports, a pipe between two neutral ports is drawn in either
    direction and the in-line components are entered by either neutral port. Node ids are n0, n1, ... in creation order."""
    nodes, edges = [], []

    def add_node(node_type, data):
        node_id = f"n{len(nodes)}"
        nodes.append({"id": node_id, "type": node_type, "position": {"x": 0, "y": 0},
                      "data": {"label": node_id, **data}})
        return node_id

    def add_junction(used):
        """A junction with `used` pipes: returns (id, the port handles in shuffled order)."""
        num_ports = min(Junction.MAX_PORTS, max(Junction.MIN_PORTS, used) + draw(st.integers(0, 2)))
        handles = [f"port-{k}" for k in draw(st.permutations(range(num_ports)))]
        return add_node("junction", {"num_ports": num_ports}), handles

    def connect(src, dst):
        if src[1].startswith("port-") and dst[1].startswith("port-") and draw(st.booleans()):
            src, dst = dst, src   # between two neutral ports a pipe can be drawn from either end; a role port fixes it
        (s, s_port), (t, t_port) = src, dst
        edges.append({"id": f"e{len(edges)}", "source": s, "target": t, "sourceHandle": s_port,
                      "targetHandle": t_port, "data": draw(_pipe_data())})

    def component_ports(node_type, node):
        """(entry, exit) handles of a placed component: a role port pair, or the two neutral ports of an in-line
        component or measure point in either order (which side the flow enters is not fixed by the drawing)."""
        if node_type not in NEUTRAL_TWO_PORT:
            return (node, "inlet-0"), (node, "outlet-0")
        entry, leave = ("port-0", "port-1") if draw(st.booleans()) else ("port-1", "port-0")
        return (node, entry), (node, leave)

    def place(src, dst, depth):
        """Connect port src to port dst through a random sub-network."""
        kind = draw(st.sampled_from(["pipe", "component", "series", "parallel"] if depth < max_depth
                                    else ["pipe", "component"]))
        if kind == "pipe":
            connect(src, dst)
        elif kind == "component":
            node_type = draw(st.sampled_from(components))
            node = add_node(node_type, draw(NETWORK_COMPONENTS[node_type]))
            entry, leave = component_ports(node_type, node)
            connect(src, entry)
            connect(leave, dst)
        elif kind == "series":
            node_type = draw(st.sampled_from(components))
            node = add_node(node_type, draw(NETWORK_COMPONENTS[node_type]))
            entry, leave = component_ports(node_type, node)
            place(src, entry, depth + 1)
            place(leave, dst, depth + 1)
        else:
            branches = draw(st.sampled_from([2, 2, 3]))
            split, split_ports = add_junction(branches + 1)
            mix, mix_ports = add_junction(branches + 1)
            connect(src, (split, split_ports[0]))
            for k in range(branches):
                place((split, split_ports[k + 1]), (mix, mix_ports[k]), depth + 1)
            connect((mix, mix_ports[branches]), dst)

    fluid, temp_k, _, _ = draw(fluid_states())
    supply = draw(st.sampled_from(["source", "pump", "two_sources"]))
    if supply == "source":
        source = add_node("pressure_source", {"source_pressure_bara": draw(st.floats(1.5, 20.0)),
                                              "temperature_k": temp_k})
        start = (source, "outlet-0")
    elif supply == "two_sources":
        # Streams at different temperatures meet: the mixing energy balance is only visible this way
        _, other_temp_k, _, _ = draw(fluid_states(fluids=[fluid]))
        mix, mix_ports = add_junction(3)
        # A source is sometimes low (down to 1 bara) so the sink tank can sit above it: flow then runs backwards
        # through the junction's outlet-side port and an inlet-side one
        for k, t in enumerate((temp_k, other_temp_k)):
            source = add_node("pressure_source", {
                "source_pressure_bara": draw(st.one_of(st.floats(1.5, 20.0), st.floats(1.0, 1.6))),
                "temperature_k": t})
            place((source, "outlet-0"), (mix, mix_ports[k]), max_depth)
        start = (mix, mix_ports[2])
    else:
        feed = add_node("tank", {"level_m": draw(st.floats(0.5, 5.0)), "temperature_k": temp_k})
        pump = add_node("centrifugal_pump", {"flow_rated_lmin": draw(log_uniform(20.0, 2000.0)),
                                             "head_rated_m": draw(log_uniform(10.0, 120.0))})
        connect((feed, "outlet-0"), (pump, "inlet-0"))
        start = (pump, "outlet-0")
    sink = add_node("tank", {"level_m": draw(st.floats(0.5, 5.0)), "temperature_k": temp_k})
    place(start, (sink, "inlet-0"), 0)
    return {"nodes": nodes, "edges": edges, "globalSettings": {"fluid_type": fluid}}
