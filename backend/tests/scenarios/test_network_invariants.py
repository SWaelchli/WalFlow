"""Laws every solved network obeys, checked on generated series-parallel networks (helpers/strategies.networks).

One property here covers every topology and component mix at once: a bug in assembly, residuals, telemetry,
property propagation or warm start breaks a law for some network, whichever component it hides in.
Topology-specific behaviour (controllers, relief, islands) stays in the other scenario modules.
"""
import contextlib
import io
import math
import random
from collections import Counter

from networks import on_neutral_ports
import pytest
from hypothesis import example, given, strategies as st

from physics_refs import pipe_end_total
from strategies import DISSIPATIVE_ONLY, networks
from simulation.equipment.base_node import InlineNode, NeutralPortNode, total_of
from simulation.equipment.flow_boundary import FlowBoundary
from simulation.equipment.junction import Junction
from simulation.fluid_utils import FluidProperties
from simulation.graph_parser import GraphParser
from simulation.schemas import ReactFlowGraph
from simulation.solver import NetworkSolver

BOUNDARY_TYPES = {"tank", "pressure_boundary", "flow_boundary"}
STATIC_DROP_EXEMPT = {"centrifugal_pump"} | BOUNDARY_TYPES
FLOW_TOL = 1e-8          # m³/s; the mass rows converge to ~2e-10 m³/s per node
PRESSURE_TOL = 5.0       # Pa
TEMPERATURE_TOL = 0.1    # K; the property loop stops at 0.01-0.05 K changes
MIXING_FLOW_TOL = 1e-9   # m³/s; the solver's dead-leg threshold (both mixing tests): a trickle above it still mixes into the outlet


def solve_graph(graph: dict, cold: bool = True):
    """Parse and solve like the app; returns (network, stats). cold clears the shared warm-start cache."""
    if cold:
        NetworkSolver.clear_warm_start_cache()
    with contextlib.redirect_stdout(io.StringIO()):
        network = GraphParser.parse_graph(ReactFlowGraph(**graph))
        stats = NetworkSolver(network).solve()
    return network, stats


def solved(graph: dict):
    network, stats = solve_graph(graph)
    assert stats["success"], f"no steady state found: {stats.get('error')}"
    assert stats["properties_converged"], f"outer loop did not settle in {stats.get('outer_iterations')} iterations"
    return network


class _NodeTypes(dict):
    """Canvas type per node id; the hidden junctions at in-line component ports are plain junctions."""
    def __missing__(self, key):
        return "junction"


def node_types(graph: dict) -> dict:
    return _NodeTypes({n["id"]: n["type"] for n in graph["nodes"]})


def pipe_edges(network):
    """(edge id, pipe) of every pipe edge, in its drawn direction; the component links are left out."""
    return [(edge["id"], edge["pipe"]) for edge in network.edges if hasattr(edge["pipe"], "calculate_delta_p")]


def snapshot(network) -> dict:
    """(pressure, flow, temperature) of every node port and pipe end, keyed by node / edge id. A junction lists
    its ports in port-k order with the flow into it, so the slot order (the order of the pipes) does not show, and so
    do a tank, a pressure boundary and a flow boundary; an in-line component lists port-0, port-1 (flow into it)."""
    def ports(obj):
        if isinstance(obj, (NeutralPortNode, FlowBoundary)):
            return [(obj.port(k).pressure, obj.port_flow_into(k), obj.port(k).temperature)
                    for k in range(obj.num_ports) if obj.port(k) is not None]
        if isinstance(obj, InlineNode):
            return [(p.pressure, p.flow_rate, p.temperature) for p in obj.ports]
        return [(p.pressure, p.flow_rate, p.temperature) for p in [*obj.inlets, *obj.outlets]]
    result = {node_id: ports(node) for node_id, node in {**network.nodes, **network.inline_nodes}.items()
              if not getattr(node, "hidden", False)}
    result.update({edge_id: ports(pipe) for edge_id, pipe in pipe_edges(network)})
    return result


def assert_same_state(a: dict, b: dict):
    assert a.keys() == b.keys()
    for key in a:
        for (pa, qa, ta), (pb, qb, tb) in zip(a[key], b[key]):
            assert pa == pytest.approx(pb, rel=1e-4, abs=PRESSURE_TOL), key
            assert qa == pytest.approx(qb, rel=1e-4, abs=FLOW_TOL), key
            assert ta == pytest.approx(tb, abs=TEMPERATURE_TOL), key


def _node(node_id, node_type, **data):
    return {"id": node_id, "type": node_type, "position": {"x": 0, "y": 0}, "data": {"label": node_id, **data}}


def _edge(edge_id, source, target, diameter_m):
    return {"id": edge_id, "source": source, "target": target, "sourceHandle": "outlet-0", "targetHandle": "inlet-0",
            "data": {"length_m": 1.0, "diameter_m": diameter_m, "roughness_mm": 0.045}}


def _pipe_edge(edge_id, source, target, diameter_m, source_port="outlet-0", target_port="inlet-0"):
    return {"id": edge_id, "source": source, "target": target, "sourceHandle": source_port, "targetHandle": target_port,
            "data": {"length_m": 1.0, "diameter_m": diameter_m, "roughness_mm": 0.0}}


def _reducer_node(node_id, diameter_in_m, diameter_out_m):
    return _node(node_id, "reducer", diameter_in_m=diameter_in_m, diameter_out_m=diameter_out_m, length_m=0.37,
                 standard="CUSTOM")


@on_neutral_ports
def _reducer_backflow_graph(bara):
    """Two sources into a junction; the 1.5 bara one reaches it through a DN135 -> DN50 reducer, the other through a
    DN135 pipe, and a DN50 pipe leads to the tank. The junction holds one pressure for pipes of both bores; with
    static pressures it handed the flow free kinetic energy that the reducer turned into pressure, flow ran
    backwards through the reducer and the solve failed from about 1.7 bara down on the first source."""
    return {"nodes": [_node("n0", "pressure_boundary", set_pressure_bara=bara, temperature_k=283.15),
                      _node("n1", "pressure_boundary", set_pressure_bara=1.5, temperature_k=283.15),
                      _reducer_node("n2", 0.135, 0.05),
                      _node("n3", "junction"),
                      _node("n4", "tank", level_m=1.0, temperature_k=283.15)],
            "edges": [_pipe_edge("e0", "n0", "n3", 0.135, target_port="port-0"),
                      _pipe_edge("e1", "n1", "n2", 0.135),
                      _pipe_edge("e2", "n2", "n3", 0.05, target_port="port-1"),
                      _pipe_edge("e3", "n3", "n4", 0.05, source_port="port-2")],
            "globalSettings": {"fluid_type": "water"}}


@on_neutral_ports
def _reducer_bypass_graph():
    """A junction feeds a check valve branch and a DN50 pipe -> DN50 x DN135 expander -> DN135 branch, rejoined in
    a junction: the two branches meet at one pressure with different velocities."""
    return {"nodes": [_node("n0", "pressure_boundary", set_pressure_bara=2.0, temperature_k=283.15),
                      _node("n1", "pressure_boundary", set_pressure_bara=2.0, temperature_k=283.15),
                      _node("n2", "junction"), _node("n3", "junction"),
                      _node("n4", "check_valve", cv=1.0),
                      _reducer_node("n5", 0.05, 0.135),
                      _node("n6", "junction"),
                      _node("n7", "tank", level_m=1.0, temperature_k=283.15)],
            "edges": [_pipe_edge("e0", "n0", "n2", 0.135, target_port="port-0"),
                      _pipe_edge("e1", "n1", "n2", 0.135, target_port="port-1"),
                      _pipe_edge("e2", "n2", "n3", 0.135, source_port="port-2", target_port="port-0"),
                      _pipe_edge("e3", "n3", "n4", 0.135, source_port="port-1"),
                      _pipe_edge("e4", "n4", "n6", 0.135, target_port="port-0"),
                      _pipe_edge("e5", "n3", "n5", 0.05, source_port="port-2"),
                      _pipe_edge("e6", "n5", "n6", 0.135, target_port="port-1"),
                      _pipe_edge("e7", "n6", "n7", 0.135, source_port="port-2")],
            "globalSettings": {"fluid_type": "water"}}


@on_neutral_ports
def _heavy_crude_viscous_drop_graph():
    """A viscous drop (heat exchanger) ahead of a wide pipe whose own drop is only a few Pa. With properties
    one update behind, the last pipe showed a 37-50 Pa rise in the flow direction. Pinned: the drops are tiny
    against the span, which hypothesis rarely draws."""
    return {"nodes": [_node("n0", "tank", level_m=1.0, temperature_k=283.15),
                      _node("n1", "centrifugal_pump", flow_rated_lmin=20.0, head_rated_m=20.0),
                      _node("n2", "heat_exchanger", rated_flow_lmin=20.0, rated_dp_bar=1.0, medium_temp_c=10.0),
                      _node("n3", "tank", level_m=1.0, temperature_k=283.15)],
            "edges": [_edge("e0", "n0", "n1", 0.018), _edge("e1", "n1", "n2", 0.018), _edge("e2", "n2", "n3", 0.135)],
            "globalSettings": {"fluid_type": "crude_heavy"}}


@on_neutral_ports
def _closed_check_valve_into_junction_graph():
    """A closed check valve feeds a junction that a higher source drives to the tank: the pipe behind the valve has
    no flow, and the junction reads its lowest flowing static pressure there, below the node total."""
    pipe = math.exp(-2)
    return {"nodes": [_node("n0", "junction"),
                      _node("n1", "pressure_boundary", set_pressure_bara=1.5, temperature_k=283.15),
                      _node("n2", "check_valve", cv=1.0, cracking_pressure_bar=0.0),
                      _node("n3", "pressure_boundary", set_pressure_bara=2.0, temperature_k=283.15),
                      _node("n4", "tank", level_m=1.0, temperature_k=283.15)],
            "edges": [_pipe_edge("e0", "n1", "n2", pipe), _pipe_edge("e1", "n2", "n0", pipe, target_port="port-0"),
                      _pipe_edge("e2", "n3", "n0", pipe, target_port="port-1"),
                      _pipe_edge("e3", "n0", "n4", pipe, source_port="port-2")],
            "globalSettings": {"fluid_type": "crude_heavy"}}


@on_neutral_ports
def _reverse_flow_graph():
    """Two sources below the sink: the sink pushes flow back through the junction, its outlet-side port and both
    inlet-side ports carry reverse flow. Hypothesis rarely draws a sink above both supplies, so it is pinned."""
    def node(node_id, node_type, **data):
        return {"id": node_id, "type": node_type, "position": {"x": 0, "y": 0}, "data": {"label": node_id, **data}}

    def edge(edge_id, source, source_port, target, target_port):
        return {"id": edge_id, "source": source, "target": target, "sourceHandle": source_port,
                "targetHandle": target_port, "data": {"length_m": 10.0, "diameter_m": 0.05, "roughness_mm": 0.045}}
    return {"nodes": [node("n0", "junction"),
                      node("n1", "pressure_boundary", set_pressure_bara=1.0, temperature_k=283.15),
                      node("n2", "pressure_boundary", set_pressure_bara=1.2, temperature_k=333.15),
                      node("n3", "tank", level_m=5.0, temperature_k=293.15)],
            "edges": [edge("e0", "n1", "outlet-0", "n0", "port-0"), edge("e1", "n2", "outlet-0", "n0", "port-1"),
                      edge("e2", "n0", "port-2", "n3", "inlet-0")],
            "globalSettings": {"fluid_type": "iso_vg_46"}}


@on_neutral_ports
def _trickle_mixing_graph():
    """Two 1 K apart sources throttled to a trickle (2.6e-7 and 5.5e-8 m³/s) into a junction. The weaker leg is
    below 1e-7 m³/s yet still mixes into the outlet, so the outlet lies above the warmer-looking stream
    that a coarse flow filter would see alone."""
    return {"nodes": [_node("n0", "pressure_boundary", set_pressure_bara=2.0, temperature_k=273.15),
                      _node("n1", "pressure_boundary", set_pressure_bara=2.0, temperature_k=274.15),
                      _node("n2", "linear_control_valve", max_cv=math.e, opening_pct=5.0),
                      _node("n3", "linear_control_valve", max_cv=1.0, opening_pct=5.0),
                      _node("n4", "junction"),
                      _node("n5", "tank", level_m=1.0, temperature_k=283.15)],
            "edges": [_edge("e0", "n0", "n2", math.exp(-2)), _edge("e1", "n1", "n3", math.exp(-2)),
                      {**_edge("e2", "n2", "n4", math.exp(-2)), "targetHandle": "port-0"},
                      {**_edge("e3", "n3", "n4", math.exp(-2)), "targetHandle": "port-1"},
                      {**_edge("e4", "n4", "n5", math.exp(-2)), "sourceHandle": "port-2"}],
            "globalSettings": {"fluid_type": "iso_vg_100"}}


@on_neutral_ports
def _flow_reversal_cycling_graphs():
    """Two junction networks on which the outer loop (flow solve against temperature update) used to cycle at a
    flow reversal and ended at the iteration limit: a hot stream at low pressure against a cold stream throttled by
    a small valve, and a crude junction whose valve branch runs backwards against a long thin branch."""
    def edge(edge_id, source, target, diameter_m, length_m=1.0, roughness_mm=0.0, target_port="inlet-0",
             source_port="outlet-0"):
        return {"id": edge_id, "source": source, "target": target, "sourceHandle": source_port,
                "targetHandle": target_port,
                "data": {"length_m": length_m, "diameter_m": diameter_m, "roughness_mm": roughness_mm}}
    oil = {"nodes": [_node("n0", "junction"),
                     _node("n1", "pressure_boundary", set_pressure_bara=1.375, temperature_k=355.15),
                     _node("n2", "pressure_boundary", set_pressure_bara=18.0, temperature_k=273.15),
                     _node("n3", "linear_control_valve", max_cv=1.0, opening_pct=84.0),
                     _node("n4", "tank", level_m=1.0, temperature_k=355.15)],
           "edges": [edge("e0", "n1", "n0", math.exp(-2), target_port="port-0"), edge("e1", "n2", "n3", math.exp(-2)),
                     edge("e2", "n3", "n0", math.exp(-2), target_port="port-1"),
                     edge("e3", "n0", "n4", math.exp(-4.1875), roughness_mm=0.5, source_port="port-2")],
           "globalSettings": {"fluid_type": "transformer_oil"}}
    crude = {"nodes": [_node("n0", "junction"),
                       _node("n1", "pressure_boundary", set_pressure_bara=1.0, temperature_k=283.15),
                       _node("n2", "linear_control_valve", max_cv=math.exp(2), opening_pct=15.0),
                       _node("n3", "pressure_boundary", set_pressure_bara=2.0, temperature_k=303.15),
                       _node("n4", "tank", level_m=1.0, temperature_k=283.15)],
             "edges": [edge("e0", "n1", "n2", math.exp(-2)), edge("e1", "n2", "n0", math.exp(-2), target_port="port-0"),
                       edge("e2", "n3", "n0", math.exp(-4), length_m=math.exp(5.25), target_port="port-1"),
                       edge("e3", "n0", "n4", math.exp(-2), source_port="port-2")],
             "globalSettings": {"fluid_type": "crude_heavy"}}
    return oil, crude


@on_neutral_ports
def _junction_loop_graph():
    """A junction whose two branches rejoin in a second junction (a loop of junctions) behind a junction fed by two
    throttled supplies. The loop circulates ~4e-7 m³/s against a net through-flow of ~1e-9 m³/s, so the
    junction temperatures stay near the 293.15 K start value unless the mixing is solved as a whole: every
    supply is 294.15 K and nothing cools, yet the loop used to report about 293.2 K."""
    def edge(edge_id, source, target, diameter_m=math.exp(-2), source_port="outlet-0", target_port="inlet-0"):
        return {"id": edge_id, "source": source, "target": target, "sourceHandle": source_port,
                "targetHandle": target_port,
                "data": {"length_m": 1.0, "diameter_m": diameter_m, "roughness_mm": 0.0}}
    return {"nodes": [_node("n0", "junction"),
                      _node("n1", "pressure_boundary", set_pressure_bara=2.0, temperature_k=294.15),
                      _node("n2", "check_valve", cv=1.0, cracking_pressure_bar=0.0),
                      _node("n3", "pressure_boundary", set_pressure_bara=1.0, temperature_k=294.15),
                      _node("n4", "linear_control_valve", max_cv=math.exp(3), opening_pct=18.0),
                      _node("n5", "tank", level_m=1.0, temperature_k=294.15),
                      _node("n6", "check_valve", cv=1.0, cracking_pressure_bar=0.0),
                      _node("n7", "junction"),
                      _node("n8", "junction"),
                      _node("n9", "check_valve", cv=1.0, cracking_pressure_bar=0.0)],
            "edges": [edge("e0", "n1", "n2"), edge("e1", "n2", "n0", target_port="port-0"),
                      edge("e2", "n3", "n4", math.exp(-3)), edge("e3", "n4", "n0", target_port="port-1"),
                      edge("e4", "n0", "n7", source_port="port-2", target_port="port-0"),
                      edge("e5", "n7", "n9", source_port="port-1"), edge("e6", "n9", "n8", target_port="port-0"),
                      edge("e7", "n7", "n8", source_port="port-2", target_port="port-1"),
                      edge("e8", "n8", "n6", source_port="port-2"), edge("e9", "n6", "n5")],
            "globalSettings": {"fluid_type": "crude_heavy"}}


@on_neutral_ports
def _noise_trickle_mixing_graph():
    """A hot supply behind a check valve and a cold supply behind a long thin pipe meet in a junction. The
    valve passes only ~9e-11 m³/s of solver noise (below the dead-leg threshold) against ~6e-8 m³/s from the
    cold side, so the mixed stream must stay at the cold temperature instead of drifting ~0.1 K towards the hot one."""
    def edge(edge_id, source, target, diameter_m, length_m=1.0, target_port="inlet-0", source_port="outlet-0"):
        return {"id": edge_id, "source": source, "target": target, "sourceHandle": source_port,
                "targetHandle": target_port,
                "data": {"length_m": length_m, "diameter_m": diameter_m, "roughness_mm": 0.0}}
    return {"nodes": [_node("n0", "junction"),
                      _node("n1", "pressure_boundary", set_pressure_bara=1.25, temperature_k=341.15),
                      _node("n2", "check_valve", cv=1.0, cracking_pressure_bar=0.125),
                      _node("n3", "pressure_boundary", set_pressure_bara=1.25, temperature_k=273.15),
                      _node("n4", "tank", level_m=2.0, temperature_k=341.15)],
            "edges": [edge("e0", "n1", "n2", 0.1353352832366127), edge("e1", "n2", "n0", 0.1353352832366127, target_port="port-0"),
                      edge("e2", "n3", "n0", 0.015184197956837946, length_m=54.598150033144236, target_port="port-1"),
                      edge("e3", "n0", "n4", 0.1353352832366127, source_port="port-2")],
            "globalSettings": {"fluid_type": "iso_vg_150"}}


@on_neutral_ports
def _crude_trickle_mixing_graph():
    """Two sources at different temperatures feed a junction through a wide and a thin pipe. The thin side
    delivers a ~9e-9 m³/s trickle, above the dead-leg threshold, so it still mixes into the outlet and moves
    it ~0.12 K; the mixed stream is not simply the temperature of the larger stream."""
    def edge(edge_id, source, target, diameter_m, length_m=1.0, target_port="inlet-0", source_port="outlet-0"):
        return {"id": edge_id, "source": source, "target": target, "sourceHandle": source_port,
                "targetHandle": target_port,
                "data": {"length_m": length_m, "diameter_m": diameter_m, "roughness_mm": 0.0}}
    return {"nodes": [_node("n0", "junction"),
                      _node("n1", "pressure_boundary", set_pressure_bara=1.0625, temperature_k=288.15),
                      _node("n2", "pressure_boundary", set_pressure_bara=1.0625, temperature_k=283.15),
                      _node("n3", "tank", level_m=0.5, temperature_k=288.15)],
            "edges": [edge("e0", "n1", "n0", math.exp(-4), target_port="port-0"),
                      edge("e1", "n2", "n0", math.exp(-3), target_port="port-1"),
                      edge("e2", "n0", "n3", math.exp(-4), length_m=math.exp(2), source_port="port-2")],
            "globalSettings": {"fluid_type": "crude_heavy"}}


@on_neutral_ports
def _stiff_valve_after_pump_graph():
    """A pump feeds a valve opened 5 % (very stiff) and a tank. The node mass residual at the valve (~6e-13 m³/s)
    times its stiffness is ~5 Pa; the report must use the flow the solve used, or the next pipe shows that
    residual as its own drop (5.4 Pa against its true 0.02 Pa)."""
    def edge(edge_id, source, target):
        return {"id": edge_id, "source": source, "target": target, "sourceHandle": "outlet-0",
                "targetHandle": "inlet-0",
                "data": {"length_m": 1.0, "diameter_m": math.exp(-2), "roughness_mm": 0.0}}
    return {"nodes": [_node("t1", "tank", level_m=1.0, temperature_k=264.15),
                      _node("p", "centrifugal_pump", flow_rated_lmin=20.1, head_rated_m=20.1),
                      _node("v", "linear_control_valve", max_cv=1.0, opening_pct=5.0),
                      _node("t2", "tank", level_m=1.0, temperature_k=264.15)],
            "edges": [edge("e0", "t1", "p"), edge("e1", "p", "v"), edge("e2", "v", "t2")],
            "globalSettings": {"fluid_type": "iso_vg_150"}}


@on_neutral_ports
def _density_change_junction_graph():
    """Seawater at 0 and 55 degC mixed 1:1 (1028 and 1009 kg/m3): the mixed stream is denser than the mean volume
    suggests, so volume flow is not conserved across the junction. Hypothesis rarely draws such a temperature gap."""
    return {"nodes": [_node("n0", "junction"),
                      _node("n1", "pressure_boundary", set_pressure_bara=3.0, temperature_k=273.15),
                      _node("n2", "pressure_boundary", set_pressure_bara=3.0, temperature_k=328.15),
                      _node("n3", "tank", level_m=1.0, temperature_k=273.15)],
            "edges": [{**_edge("e0", "n1", "n0", 0.05), "targetHandle": "port-0"},
                      {**_edge("e1", "n2", "n0", 0.05), "targetHandle": "port-1"},
                      {**_edge("e2", "n0", "n3", 0.05), "sourceHandle": "port-2"}],
            "globalSettings": {"fluid_type": "seawater"}}


@on_neutral_ports
def _strong_heater_graph():
    """Water at 10 degC heated to 80 degC in a heat exchanger (a two-port node, not a junction): the outlet is
    2.8 % less dense, so volume flow is not conserved across it. Hypothesis rarely draws such a duty."""
    return {"nodes": [_node("n1", "pressure_boundary", set_pressure_bara=3.0, temperature_k=283.15),
                      _node("n2", "heat_exchanger", rating_method="ua_direct", ua_direct_w_k=1e6, medium_temp_c=80.0,
                            rated_flow_lmin=20.0, rated_dp_bar=0.1),
                      _node("n3", "tank", level_m=1.0, temperature_k=283.15)],
            "edges": [_edge("e0", "n1", "n2", 0.02), _edge("e1", "n2", "n3", 0.02)],
            "globalSettings": {"fluid_type": "water"}}


@example(_reverse_flow_graph())
@given(networks())
def test_well_posed_network_reaches_a_finite_steady_state_with_fluid_properties(graph):
    """Every port value is finite, and every port that carries flow, in either direction, reports the density
    and viscosity of the system fluid at the port's own temperature (a junction used to leave the default
    density or a stale viscosity on a port with reverse flow, a throttle the inlet's)."""
    network = solved(graph)
    for key, ports in snapshot(network).items():
        assert all(v == v and abs(v) != float("inf") for port in ports for v in port), key
    fluid = graph["globalSettings"]["fluid_type"]
    objects = {**network.nodes, **network.inline_nodes}
    objects.update({edge_id: pipe for edge_id, pipe in pipe_edges(network)})
    for key, obj in objects.items():
        for port in (obj.ports if isinstance(obj, InlineNode) else [*obj.inlets, *obj.outlets]):
            if abs(port.flow_rate) <= FLOW_TOL:
                continue
            for value, lookup in ((port.density, FluidProperties.get_density), (port.viscosity, FluidProperties.get_viscosity)):
                assert value == pytest.approx(lookup(fluid, port.temperature), rel=1e-9), key


@example(_reducer_backflow_graph(2.0))
@example(_reducer_backflow_graph(1.7))
@example(_reducer_backflow_graph(1.3))
@example(_reducer_bypass_graph())
@example(_density_change_junction_graph())
@example(_strong_heater_graph())
@given(networks())
def test_mass_is_conserved(graph):
    """Mass flow, not volume flow, is conserved: every junction and component passes on the mass it receives
    (a junction of 0 and 55 degC water, or a heater, changes the volume flow), and what leaves the sources reaches
    the sinks. Each edge carries rho * q with rho of the fluid at its downstream end."""
    network = solved(graph)
    types = node_types(graph)
    mass_floor = FLOW_TOL * 2000.0   # kg/s; FLOW_TOL at the densest fluid

    def mass_flow(edge):
        pipe = edge["pipe"]
        q = pipe.inlets[0].flow_rate
        downstream = pipe.outlets[0] if q >= 0 else pipe.inlets[0]
        return q * downstream.density

    for edge in network.edges:
        pipe = edge["pipe"]
        assert pipe.inlets[0].flow_rate == pytest.approx(pipe.outlets[0].flow_rate, abs=FLOW_TOL), edge["id"]
        # The node's reported port flow is the flow of the edge on it, even where density changes the volume flow
        src = network.nodes[edge["source"]].outlets[int(edge["source_port"].split("-")[-1])]
        tgt = network.nodes[edge["target"]].inlets[int(edge["target_port"].split("-")[-1])]
        assert src.flow_rate == pytest.approx(pipe.inlets[0].flow_rate, abs=FLOW_TOL), edge["id"]
        assert tgt.flow_rate == pytest.approx(pipe.outlets[0].flow_rate, abs=FLOW_TOL), edge["id"]
    for node_id, component in network.inline_nodes.items():   # an in-line component passes its mass flow on (its heat lowers the density, so not the volume flow)
        assert sum(p.flow_rate * p.density for p in component.ports) == pytest.approx(0.0, abs=FLOW_TOL * 1000.0), node_id
    for node_id in network.nodes:
        if types[node_id] in BOUNDARY_TYPES:
            continue
        inflow = sum(mass_flow(e) for e in network.edges if e["target"] == node_id)
        outflow = sum(mass_flow(e) for e in network.edges if e["source"] == node_id)
        assert inflow == pytest.approx(outflow, rel=1e-6, abs=mass_floor), node_id
    supplied = sum(mass_flow(e) for e in network.edges if types[e["source"]] in BOUNDARY_TYPES)
    received = sum(mass_flow(e) for e in network.edges if types[e["target"]] in BOUNDARY_TYPES)
    assert supplied == pytest.approx(received, rel=1e-6, abs=mass_floor)


@example(_reducer_backflow_graph(2.0))
@example(_reducer_backflow_graph(1.7))
@example(_reducer_backflow_graph(1.3))
@example(_reducer_bypass_graph())
@example(_heavy_crude_viscous_drop_graph())
@example(_closed_check_valve_into_junction_graph())
@example(_stiff_valve_after_pump_graph())
@given(networks())
def test_pressure_is_continuous_and_falls_along_the_flow(graph):
    """A pipe end sits at its node's total pressure less its own velocity head (the node holds one total pressure
    for all its pipes; across a junction the static pressures differ by the pipe velocity heads). Static
    pressure falls across every pipe, and total pressure across every passive component, in the flow direction
    (all generated networks are driven from one side), the pipe by exactly its own drop at the properties of its
    upstream end, so the reported pressures belong to the reported densities and viscosities. A pipe without
    flow instead keeps the reported static pressure of the node port it sits on, equal at both ends."""
    network = solved(graph)
    types = node_types(graph)
    for edge in network.edges:
        pipe = edge["pipe"]
        src = network.nodes[edge["source"]].outlets[int(edge["source_port"].split("-")[-1])]
        tgt = network.nodes[edge["target"]].inlets[int(edge["target_port"].split("-")[-1])]
        if not hasattr(pipe, "calculate_delta_p"):
            continue        # a component link: its ports are checked on the component
        first, first_end = pipe, pipe.inlets[0]
        last, last_end = pipe, pipe.outlets[0]
        if abs(pipe.inlets[0].flow_rate) <= MIXING_FLOW_TOL:
            # A still pipe has no velocity head: a no-flow port reads the junction's lowest flowing static pressure
            # and the whole still section behind it drops by the same amount, so compare static pressures along
            # the section instead of against the node total (pressure boundaries keep their reservoir pressure)
            assert pipe.inlets[0].pressure == pytest.approx(pipe.outlets[0].pressure, abs=PRESSURE_TOL), edge["id"]
            for end, port, node_id in ((first_end, src, edge["source"]), (last_end, tgt, edge["target"])):
                if types[node_id] not in BOUNDARY_TYPES:
                    assert end.pressure == pytest.approx(port.pressure, abs=PRESSURE_TOL), edge["id"]
        else:
            assert pipe_end_total(first, first_end, network.nodes[edge["source"]]) == pytest.approx(
                total_of(src), abs=PRESSURE_TOL), edge["id"]
            assert pipe_end_total(last, last_end, network.nodes[edge["target"]]) == pytest.approx(
                total_of(tgt), abs=PRESSURE_TOL), edge["id"]
        if abs(pipe.inlets[0].flow_rate) > FLOW_TOL:
            drop = (pipe.inlets[0].pressure - pipe.outlets[0].pressure) * math.copysign(1.0, pipe.inlets[0].flow_rate)
            assert drop >= -PRESSURE_TOL, edge["id"]
            expected = pipe.calculate_delta_p(pipe.inlets[0].flow_rate, *pipe.upstream_port().fluid())
            assert (pipe.inlets[0].pressure - pipe.outlets[0].pressure) == pytest.approx(
                expected, rel=1e-4, abs=PRESSURE_TOL), edge["id"]
    for node_id, node in network.nodes.items():
        if types[node_id] in STATIC_DROP_EXEMPT or isinstance(node, Junction) or node.inlets[0].flow_rate <= 1e-7:
            continue
        assert total_of(node.inlets[0]) >= max(total_of(p) for p in node.outlets) - PRESSURE_TOL, node_id
    for node_id, node in network.nodes.items():
        if isinstance(node, Junction):
            totals = [total_of(p) for p in [*node.inlets, *node.outlets]]
            assert max(totals) - min(totals) <= PRESSURE_TOL, node_id
    for node_id, component in network.inline_nodes.items():   # total pressure falls from the port the flow enters by
        entry, leave = (component.ports if component.ports[0].flow_rate > 0 else component.ports[::-1])
        if entry.flow_rate > FLOW_TOL:
            assert total_of(entry) >= total_of(leave) - PRESSURE_TOL, node_id


@example(_trickle_mixing_graph())
@example(_flow_reversal_cycling_graphs()[0])
@example(_flow_reversal_cycling_graphs()[1])
@example(_junction_loop_graph())
@given(networks(components=tuple(sorted(DISSIPATIVE_ONLY))))
def test_dissipation_never_cools_and_mixing_stays_between_its_streams(graph):
    """Without a cooler the fluid only warms by dissipation (pipes, throttling, pump losses), and a junction
    outlet lies between the temperatures of the streams arriving."""
    network = solved(graph)
    types = node_types(graph)
    # What each source and tank supplies, defaults included (a tank above a source feeds reverse flow)
    t_supply = min(node.temperature for node_id, node in network.nodes.items() if types[node_id] in {"tank", "pressure_boundary"})
    for node_id, component in network.inline_nodes.items():
        for port in component.ports:
            assert port.temperature >= t_supply - TEMPERATURE_TOL, node_id
    for node_id, node in network.nodes.items():
        if types[node_id] in BOUNDARY_TYPES:
            continue
        for port in [*node.inlets, *node.outlets]:
            assert port.temperature >= t_supply - TEMPERATURE_TOL, node_id
        if isinstance(node, Junction):
            # Streams arrive through inlets with forward flow and through the outlet with reverse flow
            arriving = [p.temperature for p in node.inlets if p.flow_rate > MIXING_FLOW_TOL]
            arriving += [p.temperature for p in node.outlets if p.flow_rate < -MIXING_FLOW_TOL]
            leaving = [p.temperature for p in node.inlets if p.flow_rate < -1e-7]
            leaving += [p.temperature for p in node.outlets if p.flow_rate > 1e-7]
            if arriving:
                for temperature in leaving:
                    assert min(arriving) - TEMPERATURE_TOL <= temperature <= max(arriving) + TEMPERATURE_TOL


@example(_crude_trickle_mixing_graph())
@example(_noise_trickle_mixing_graph())
@given(networks())
def test_junctions_conserve_energy(graph):
    """At a junction every leaving stream carries the mass-weighted mean specific enthalpy h(T) of
    the arriving streams, in whichever direction each stream flows. (Absolute enthalpy flows are not compared:
    only the mass-weighted mean enthalpy of the arriving streams is checked.)"""
    network = solved(graph)
    fluid = graph["globalSettings"]["fluid_type"]
    types = node_types(graph)
    for node_id, node in network.nodes.items():
        if not isinstance(node, Junction):
            continue
        streams = [(p.flow_rate, p) for p in node.inlets] + [(-p.flow_rate, p) for p in node.outlets]
        arriving = [(q * p.density, FluidProperties.get_enthalpy(fluid, p.temperature)) for q, p in streams if q > MIXING_FLOW_TOL]
        if not arriving:
            continue
        h_mix = sum(m * h for m, h in arriving) / sum(m for m, _ in arriving)
        for q, p in streams:
            if q < -FLOW_TOL:
                cp = FluidProperties.get_specific_heat(fluid, p.temperature)
                assert FluidProperties.get_enthalpy(fluid, p.temperature) == pytest.approx(
                    h_mix, abs=cp * TEMPERATURE_TOL), node_id


@on_neutral_ports
def _stagnant_junction_graph():
    """A junction between three tanks at one level and three temperatures: no flow anywhere, so the junction
    has no stream to take a temperature from and takes the one of its lowest connected port (port-0)."""
    tanks = [_node(f"n{k}", "tank", level_m=2.0, temperature_k=t) for k, t in enumerate((300.0, 280.0, 320.0))]
    return {"nodes": [*tanks, _node("n3", "junction")],
            "edges": [{**_edge(f"e{k}", f"n{k}", "n3", 0.05), "targetHandle": f"port-{k}"} for k in range(3)],
            "globalSettings": {"fluid_type": "water"}}


def _reversed(edge):
    """The same pipe drawn from the other end."""
    return {**edge, "source": edge["target"], "target": edge["source"],
            "sourceHandle": edge["targetHandle"], "targetHandle": edge["sourceHandle"]}


def _swap_component_ports(graph, node_ids):
    """The same diagram with port-0 and port-1 exchanged on the given components (every pipe on them follows)."""
    swap = {"port-0": "port-1", "port-1": "port-0"}
    edges = [{**e, "sourceHandle": swap[e["sourceHandle"]] if e["source"] in node_ids else e["sourceHandle"],
              "targetHandle": swap[e["targetHandle"]] if e["target"] in node_ids else e["targetHandle"]}
             for e in graph["edges"]]
    return {**graph, "edges": edges}


@example(_stagnant_junction_graph(), random.Random(7))
@given(networks(max_depth=2), st.randoms(use_true_random=False))
def test_result_does_not_depend_on_ids_order_or_drawn_direction(graph, rnd):
    """Renaming every node and edge, shuffling both lists, drawing pipes from the other end and exchanging the
    two neutral ports of components (as a different save of the same diagram) gives the same state: pressures,
    port temperatures and reported static pressures per port of a junction, tank or pressure boundary, the pipe flows up
    to their sign, and the
    flow into each component port."""
    reference = snapshot(solved(graph))
    node_ids = [n["id"] for n in graph["nodes"]]
    new_ids = dict(zip(node_ids, rnd.sample([f"x{i}" for i in range(len(node_ids))], len(node_ids))))
    edge_ids = {e["id"]: f"pipe-{len(graph['edges']) - i}" for i, e in enumerate(graph["edges"])}
    flipped = {e["id"] for e in graph["edges"]   # only a pipe between two neutral ports can be drawn from either end
               if e["sourceHandle"].startswith("port-") and e["targetHandle"].startswith("port-") and rnd.random() < 0.5}
    swapped = {n["id"] for n in graph["nodes"] if n["type"] in ("orifice", "filter", "calibrated_restriction")
               and rnd.random() < 0.5}
    redrawn = _swap_component_ports(graph, swapped)
    renamed = {
        **redrawn,
        "nodes": rnd.sample([{**n, "id": new_ids[n["id"]]} for n in graph["nodes"]], len(node_ids)),
        "edges": rnd.sample([{**(_reversed(e) if e["id"] in flipped else e), "id": edge_ids[e["id"]],
                              "source": new_ids[(_reversed(e) if e["id"] in flipped else e)["source"]],
                              "target": new_ids[(_reversed(e) if e["id"] in flipped else e)["target"]]}
                             for e in redrawn["edges"]], len(graph["edges"])),
    }
    result = snapshot(solved(renamed))
    back = {**{old: result[new] for old, new in new_ids.items()}, **{old: result[new] for old, new in edge_ids.items()}}
    for edge_id in flipped:   # the pipe's inlet is the old outlet, and its flow runs the other way
        reference[edge_id] = [(p, -q, t) for p, q, t in reversed(reference[edge_id])]
    for node_id in swapped:   # port-0 is the old port-1: the same flow into the same physical side
        reference[node_id] = list(reversed(reference[node_id]))
    assert_same_state(reference, back)


@given(networks(max_depth=2))
def test_warm_start_reaches_the_cold_start_state(graph):
    cold = snapshot(solved(graph))
    network, stats = solve_graph(graph, cold=False)
    assert stats["success"] and stats["warm_start_status"] == "Exact Hit"
    assert_same_state(cold, snapshot(network))


@on_neutral_ports
def _pump_loop_small_throughflow_graph(fluid, opening_pct):
    """A pump recirculating through two junctions while a nearly closed valve passes only a small
    through-flow. The loop circulates far more than it drains, so it takes many passes to warm up."""
    def edge(edge_id, source, target, diameter_m=0.05, length_m=1.0, source_port="outlet-0", target_port="inlet-0"):
        return {"id": edge_id, "source": source, "target": target, "sourceHandle": source_port,
                "targetHandle": target_port,
                "data": {"length_m": length_m, "diameter_m": diameter_m, "roughness_mm": 0.0}}
    return {"nodes": [_node("src", "pressure_boundary", set_pressure_bara=2.0, temperature_k=300.0),
                      _node("m", "junction"),
                      _node("p", "centrifugal_pump", flow_rated_lmin=60.0, head_rated_m=40.0),
                      _node("s", "junction"),
                      _node("v", "linear_control_valve", max_cv=1.0, opening_pct=opening_pct),
                      _node("t", "tank", level_m=1.0, temperature_k=300.0)],
            "edges": [edge("e0", "src", "m", target_port="port-0"), edge("e1", "m", "p", source_port="port-2"),
                      edge("e2", "p", "s", target_port="port-0"),
                      edge("e3", "s", "v", source_port="port-1"), edge("e4", "v", "t"),
                      edge("e5", "s", "m", diameter_m=0.025, length_m=30.0, source_port="port-2", target_port="port-1")],
            "globalSettings": {"fluid_type": fluid}}


@pytest.mark.parametrize("fluid, opening_pct", [
    pytest.param("iso_vg_150", 2.0, id="oil_loop_small_throughflow"),
    pytest.param("water", 0.5, id="water_loop_tiny_throughflow"),
])
def test_pump_loop_energy_reaches_the_through_flow(fluid, opening_pct):
    """What the through-flow carries out as enthalpy (above the 300 K supply) is what the pump shaft and the
    pressure drop of the supply put in. The property loop used to stop after a quiet pass, long before the
    loop temperature settled, and the through-flow left too cold (oil 0.88, water 0.07 of the input)."""
    network, stats = solve_graph(_pump_loop_small_throughflow_graph(fluid, opening_pct))
    assert stats["success"] and stats["properties_converged"], stats.get("error")
    nodes = network.nodes
    inlet, outlet = nodes["v"].inlets[0], nodes["v"].outlets[0]
    gain = inlet.flow_rate * inlet.density * (FluidProperties.get_enthalpy(fluid, outlet.temperature)
                                              - FluidProperties.get_enthalpy(fluid, 300.0))
    supplied = nodes["p"].shaft_power() + inlet.flow_rate * (nodes["src"].outlets[0].pressure - outlet.pressure)
    assert 0.93 <= gain / supplied <= 1.05
