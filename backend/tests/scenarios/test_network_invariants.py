"""Laws every solved network obeys, checked on generated series-parallel networks (helpers/strategies.networks).

One property here covers every topology and component mix at once: a bug in assembly, residuals, telemetry,
property propagation or warm start breaks a law for some network, whichever component it hides in.
Topology-specific behaviour (controllers, relief, islands) stays in the other scenario modules.
"""
import contextlib
import io
import math

import pytest
from hypothesis import example, given, strategies as st

from strategies import DISSIPATIVE_ONLY, networks
from simulation.fluid_utils import FluidProperties
from simulation.graph_parser import GraphParser
from simulation.schemas import ReactFlowGraph
from simulation.solver import NetworkSolver

BOUNDARY_TYPES = {"tank", "pressure_source", "flow_source"}
STATIC_DROP_EXEMPT = {"centrifugal_pump"} | BOUNDARY_TYPES
FLOW_TOL = 1e-8          # m³/s; the mass rows converge to ~2e-10 m³/s per node
PRESSURE_TOL = 5.0       # Pa
TEMPERATURE_TOL = 0.1    # K; the property loop stops at 0.01-0.05 K changes
MIXING_FLOW_TOL = 1e-9   # m³/s; the solver's dead-leg threshold: a trickle above it still mixes into the outlet


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


def node_types(graph: dict) -> dict:
    return {n["id"]: n["type"] for n in graph["nodes"]}


def snapshot(network) -> dict:
    """(pressure, flow, temperature) of every node port and pipe end, keyed by node / edge id."""
    def ports(obj):
        return [(p.pressure, p.flow_rate, p.temperature) for p in [*obj.inlets, *obj.outlets]]
    result = {node_id: ports(node) for node_id, node in network.nodes.items()}
    result.update({edge["id"]: ports(edge["pipe"]) for edge in network.edges})
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


def _reverse_flow_graph():
    """Two sources below the sink: the sink pushes flow back through the mixer, the mixer outlet and both
    inlets carry reverse flow. Hypothesis rarely draws a sink above both supplies, so it is pinned."""
    def node(node_id, node_type, **data):
        return {"id": node_id, "type": node_type, "position": {"x": 0, "y": 0}, "data": {"label": node_id, **data}}

    def edge(edge_id, source, source_port, target, target_port):
        return {"id": edge_id, "source": source, "target": target, "sourceHandle": source_port,
                "targetHandle": target_port, "data": {"length_m": 10.0, "diameter_m": 0.05, "roughness_mm": 0.045}}
    return {"nodes": [node("n0", "mixer"),
                      node("n1", "pressure_source", source_pressure_bara=1.0, temperature_k=283.15),
                      node("n2", "pressure_source", source_pressure_bara=1.2, temperature_k=333.15),
                      node("n3", "tank", level_m=5.0, temperature_k=293.15)],
            "edges": [edge("e0", "n1", "outlet-0", "n0", "inlet-0"), edge("e1", "n2", "outlet-0", "n0", "inlet-1"),
                      edge("e2", "n0", "outlet-0", "n3", "inlet-0")],
            "globalSettings": {"fluid_type": "iso_vg_46"}}


def _trickle_mixing_graph():
    """Two 1 K apart sources throttled to a trickle (2.6e-7 and 5.5e-8 m³/s) into a mixer. The weaker leg is
    below 1e-7 m³/s yet still mixes into the outlet, so the outlet lies above the warmer-looking stream
    that a coarse flow filter would see alone."""
    return {"nodes": [_node("n0", "pressure_source", source_pressure_bara=2.0, temperature_k=273.15),
                      _node("n1", "pressure_source", source_pressure_bara=2.0, temperature_k=274.15),
                      _node("n2", "linear_control_valve", max_cv=math.e, opening_pct=5.0),
                      _node("n3", "linear_control_valve", max_cv=1.0, opening_pct=5.0),
                      _node("n4", "mixer"),
                      _node("n5", "tank", level_m=1.0, temperature_k=283.15)],
            "edges": [_edge("e0", "n0", "n2", math.exp(-2)), _edge("e1", "n1", "n3", math.exp(-2)),
                      {**_edge("e2", "n2", "n4", math.exp(-2)), "targetHandle": "inlet-0"},
                      {**_edge("e3", "n3", "n4", math.exp(-2)), "targetHandle": "inlet-1"},
                      _edge("e4", "n4", "n5", math.exp(-2))],
            "globalSettings": {"fluid_type": "iso_vg_100"}}


def _flow_reversal_cycling_graphs():
    """Two mixer networks on which the outer loop (flow solve against temperature update) used to cycle at a
    flow reversal and ended at the iteration limit: a hot stream at low pressure against a cold stream throttled by
    a small valve, and a crude mixer whose valve branch runs backwards against a long thin branch."""
    def edge(edge_id, source, target, diameter_m, length_m=1.0, roughness_mm=0.0, target_port="inlet-0"):
        return {"id": edge_id, "source": source, "target": target, "sourceHandle": "outlet-0",
                "targetHandle": target_port,
                "data": {"length_m": length_m, "diameter_m": diameter_m, "roughness_mm": roughness_mm}}
    oil = {"nodes": [_node("n0", "mixer"),
                     _node("n1", "pressure_source", source_pressure_bara=1.375, temperature_k=355.15),
                     _node("n2", "pressure_source", source_pressure_bara=18.0, temperature_k=273.15),
                     _node("n3", "linear_control_valve", max_cv=1.0, opening_pct=84.0),
                     _node("n4", "tank", level_m=1.0, temperature_k=355.15)],
           "edges": [edge("e0", "n1", "n0", math.exp(-2)), edge("e1", "n2", "n3", math.exp(-2)),
                     edge("e2", "n3", "n0", math.exp(-2), target_port="inlet-1"),
                     edge("e3", "n0", "n4", math.exp(-4.1875), roughness_mm=0.5)],
           "globalSettings": {"fluid_type": "transformer_oil"}}
    crude = {"nodes": [_node("n0", "mixer"),
                       _node("n1", "pressure_source", source_pressure_bara=1.0, temperature_k=283.15),
                       _node("n2", "linear_control_valve", max_cv=math.exp(2), opening_pct=15.0),
                       _node("n3", "pressure_source", source_pressure_bara=2.0, temperature_k=303.15),
                       _node("n4", "tank", level_m=1.0, temperature_k=283.15)],
             "edges": [edge("e0", "n1", "n2", math.exp(-2)), edge("e1", "n2", "n0", math.exp(-2)),
                       edge("e2", "n3", "n0", math.exp(-4), length_m=math.exp(5.25), target_port="inlet-1"),
                       edge("e3", "n0", "n4", math.exp(-2))],
             "globalSettings": {"fluid_type": "crude_heavy"}}
    return oil, crude


def _junction_loop_graph():
    """A splitter whose two branches rejoin in a mixer (a loop of junctions) behind a mixer fed by two
    throttled supplies. The loop circulates ~4e-7 m³/s against a net through-flow of ~1e-9 m³/s, so the
    junction temperatures stay near the 293.15 K start value unless the mixing is solved as a whole: every
    supply is 294.15 K and nothing cools, yet the loop used to report about 293.2 K."""
    def edge(edge_id, source, target, diameter_m=math.exp(-2), source_port="outlet-0", target_port="inlet-0"):
        return {"id": edge_id, "source": source, "target": target, "sourceHandle": source_port,
                "targetHandle": target_port,
                "data": {"length_m": 1.0, "diameter_m": diameter_m, "roughness_mm": 0.0}}
    return {"nodes": [_node("n0", "mixer"),
                      _node("n1", "pressure_source", source_pressure_bara=2.0, temperature_k=294.15),
                      _node("n2", "check_valve", cv=1.0, cracking_pressure_bar=0.0),
                      _node("n3", "pressure_source", source_pressure_bara=1.0, temperature_k=294.15),
                      _node("n4", "linear_control_valve", max_cv=math.exp(3), opening_pct=18.0),
                      _node("n5", "tank", level_m=1.0, temperature_k=294.15),
                      _node("n6", "check_valve", cv=1.0, cracking_pressure_bar=0.0),
                      _node("n7", "splitter"),
                      _node("n8", "mixer"),
                      _node("n9", "check_valve", cv=1.0, cracking_pressure_bar=0.0)],
            "edges": [edge("e0", "n1", "n2"), edge("e1", "n2", "n0"),
                      edge("e2", "n3", "n4", math.exp(-3)), edge("e3", "n4", "n0", target_port="inlet-1"),
                      edge("e4", "n0", "n7"), edge("e5", "n7", "n9"), edge("e6", "n9", "n8"),
                      edge("e7", "n7", "n8", source_port="outlet-1", target_port="inlet-1"),
                      edge("e8", "n8", "n6"), edge("e9", "n6", "n5")],
            "globalSettings": {"fluid_type": "crude_heavy"}}


def _noise_trickle_mixing_graph():
    """A hot supply behind a check valve and a cold supply behind a long thin pipe meet in a mixer. The
    valve passes only ~9e-11 m³/s of solver noise (below the dead-leg threshold) against ~6e-8 m³/s from the
    cold side, so the mixed stream must stay at the cold temperature instead of drifting ~0.1 K towards the hot one."""
    def edge(edge_id, source, target, diameter_m, length_m=1.0, target_port="inlet-0"):
        return {"id": edge_id, "source": source, "target": target, "sourceHandle": "outlet-0",
                "targetHandle": target_port,
                "data": {"length_m": length_m, "diameter_m": diameter_m, "roughness_mm": 0.0}}
    return {"nodes": [_node("n0", "mixer"),
                      _node("n1", "pressure_source", source_pressure_bara=1.25, temperature_k=341.15),
                      _node("n2", "check_valve", cv=1.0, cracking_pressure_bar=0.125),
                      _node("n3", "pressure_source", source_pressure_bara=1.25, temperature_k=273.15),
                      _node("n4", "tank", level_m=2.0, temperature_k=341.15)],
            "edges": [edge("e0", "n1", "n2", 0.1353352832366127), edge("e1", "n2", "n0", 0.1353352832366127),
                      edge("e2", "n3", "n0", 0.015184197956837946, length_m=54.598150033144236, target_port="inlet-1"),
                      edge("e3", "n0", "n4", 0.1353352832366127)],
            "globalSettings": {"fluid_type": "iso_vg_150"}}


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
    objects = dict(network.nodes)
    objects.update({edge["id"]: edge["pipe"] for edge in network.edges})
    for key, obj in objects.items():
        for port in [*obj.inlets, *obj.outlets]:
            if abs(port.flow_rate) <= FLOW_TOL:
                continue
            for value, lookup in ((port.density, FluidProperties.get_density), (port.viscosity, FluidProperties.get_viscosity)):
                assert value == pytest.approx(lookup(fluid, port.temperature), rel=1e-9), key


@given(networks())
def test_mass_is_conserved(graph):
    """Every junction and component passes on what it receives; what leaves the source reaches the sink."""
    network = solved(graph)
    types = node_types(graph)
    for node_id, node in network.nodes.items():
        if types[node_id] in BOUNDARY_TYPES:
            continue
        inflow = sum(p.flow_rate for p in node.inlets)
        outflow = sum(p.flow_rate for p in node.outlets)
        assert inflow == pytest.approx(outflow, rel=1e-6, abs=FLOW_TOL), node_id
    for edge in network.edges:
        pipe = edge["pipe"]
        assert pipe.inlets[0].flow_rate == pytest.approx(pipe.outlets[0].flow_rate, abs=FLOW_TOL), edge["id"]
    supplied = sum(e["pipe"].inlets[0].flow_rate for e in network.edges if types[e["source"]] in BOUNDARY_TYPES)
    received = sum(e["pipe"].outlets[0].flow_rate for e in network.edges if types[e["target"]] in BOUNDARY_TYPES)
    assert supplied == pytest.approx(received, rel=1e-6, abs=FLOW_TOL)


@example(_heavy_crude_viscous_drop_graph())
@given(networks())
def test_pressure_is_continuous_and_falls_along_the_flow(graph):
    """A pipe end has its node's port pressure; static pressure falls across every pipe and passive
    component in the flow direction (all generated networks are driven from one side), by exactly the pipe's own
    drop at its reported inlet properties, so the reported pressures belong to the reported densities and viscosities."""
    network = solved(graph)
    types = node_types(graph)
    for edge in network.edges:
        pipe = edge["pipe"]
        src = network.nodes[edge["source"]].outlets[int(edge["source_port"].split("-")[-1])]
        tgt = network.nodes[edge["target"]].inlets[int(edge["target_port"].split("-")[-1])]
        assert pipe.inlets[0].pressure == pytest.approx(src.pressure, abs=PRESSURE_TOL), edge["id"]
        assert pipe.outlets[0].pressure == pytest.approx(tgt.pressure, abs=PRESSURE_TOL), edge["id"]
        if abs(pipe.inlets[0].flow_rate) > FLOW_TOL:
            drop = (pipe.inlets[0].pressure - pipe.outlets[0].pressure) * math.copysign(1.0, pipe.inlets[0].flow_rate)
            assert drop >= -PRESSURE_TOL, edge["id"]
            inlet = pipe.inlets[0]
            expected = pipe.calculate_delta_p(inlet.flow_rate, inlet.density, inlet.viscosity)
            assert (pipe.inlets[0].pressure - pipe.outlets[0].pressure) == pytest.approx(expected, rel=1e-4, abs=PRESSURE_TOL), edge["id"]
    for node_id, node in network.nodes.items():
        if types[node_id] in STATIC_DROP_EXEMPT or node.inlets[0].flow_rate <= 1e-7:
            continue
        assert node.inlets[0].pressure >= max(p.pressure for p in node.outlets) - PRESSURE_TOL, node_id


@example(_trickle_mixing_graph())
@example(_flow_reversal_cycling_graphs()[0])
@example(_flow_reversal_cycling_graphs()[1])
@example(_junction_loop_graph())
@given(networks(components=tuple(sorted(DISSIPATIVE_ONLY))))
def test_dissipation_never_cools_and_mixing_stays_between_its_streams(graph):
    """Without a cooler the fluid only warms by dissipation (pipes, throttling, pump losses), and a mixer
    outlet lies between its inlet temperatures."""
    network = solved(graph)
    types = node_types(graph)
    # What each source and tank supplies, defaults included (a tank above a source feeds reverse flow)
    t_supply = min(node.temperature for node_id, node in network.nodes.items() if types[node_id] in {"tank", "pressure_source"})
    for node_id, node in network.nodes.items():
        if types[node_id] in BOUNDARY_TYPES:
            continue
        for port in [*node.inlets, *node.outlets]:
            assert port.temperature >= t_supply - TEMPERATURE_TOL, node_id
        if types[node_id] == "mixer":
            # Streams arrive through inlets with forward flow and through the outlet with reverse flow
            arriving = [p.temperature for p in node.inlets if p.flow_rate > MIXING_FLOW_TOL]
            arriving += [p.temperature for p in node.outlets if p.flow_rate < -MIXING_FLOW_TOL]
            leaving = [p.temperature for p in node.inlets if p.flow_rate < -1e-7]
            leaving += [p.temperature for p in node.outlets if p.flow_rate > 1e-7]
            if arriving:
                for temperature in leaving:
                    assert min(arriving) - TEMPERATURE_TOL <= temperature <= max(arriving) + TEMPERATURE_TOL


@example(_noise_trickle_mixing_graph())
@given(networks())
def test_junctions_conserve_energy(graph):
    """At a splitter or mixer every leaving stream carries the mass-weighted mean specific enthalpy h(T) of
    the arriving streams, in whichever direction each stream flows. (Absolute enthalpy flows are not compared:
    junctions balance volume, not mass.)"""
    network = solved(graph)
    fluid = graph["globalSettings"]["fluid_type"]
    types = node_types(graph)
    for node_id, node in network.nodes.items():
        if types[node_id] not in ("splitter", "mixer"):
            continue
        streams = [(p.flow_rate, p) for p in node.inlets] + [(-p.flow_rate, p) for p in node.outlets]
        arriving = [(q * p.density, FluidProperties.get_enthalpy(fluid, p.temperature)) for q, p in streams if q > FLOW_TOL]
        if not arriving:
            continue
        h_mix = sum(m * h for m, h in arriving) / sum(m for m, _ in arriving)
        for q, p in streams:
            if q < -FLOW_TOL:
                cp = FluidProperties.get_specific_heat(fluid, p.temperature)
                assert FluidProperties.get_enthalpy(fluid, p.temperature) == pytest.approx(
                    h_mix, abs=cp * TEMPERATURE_TOL), node_id


@given(networks(max_depth=2), st.randoms(use_true_random=False))
def test_result_does_not_depend_on_ids_or_order(graph, rnd):
    """Renaming every node and edge and shuffling both lists (as a different save of the same diagram)
    gives the same state."""
    reference = snapshot(solved(graph))
    node_ids = [n["id"] for n in graph["nodes"]]
    new_ids = dict(zip(node_ids, rnd.sample([f"x{i}" for i in range(len(node_ids))], len(node_ids))))
    edge_ids = {e["id"]: f"pipe-{len(graph['edges']) - i}" for i, e in enumerate(graph["edges"])}
    renamed = {
        **graph,
        "nodes": rnd.sample([{**n, "id": new_ids[n["id"]]} for n in graph["nodes"]], len(node_ids)),
        "edges": rnd.sample([{**e, "id": edge_ids[e["id"]], "source": new_ids[e["source"]],
                              "target": new_ids[e["target"]]} for e in graph["edges"]], len(graph["edges"])),
    }
    result = snapshot(solved(renamed))
    back = {**{old: result[new] for old, new in new_ids.items()}, **{old: result[new] for old, new in edge_ids.items()}}
    assert_same_state(reference, back)


@given(networks(max_depth=2))
def test_warm_start_reaches_the_cold_start_state(graph):
    cold = snapshot(solved(graph))
    network, stats = solve_graph(graph, cold=False)
    assert stats["success"] and stats["warm_start_status"] == "Exact Hit"
    assert_same_state(cold, snapshot(network))


def _pump_loop_small_throughflow_graph(fluid, opening_pct):
    """A pump recirculating through a splitter and a mixer while a nearly closed valve passes only a small
    through-flow. The loop circulates far more than it drains, so it takes many passes to warm up."""
    def edge(edge_id, source, target, diameter_m=0.05, length_m=1.0, source_port="outlet-0", target_port="inlet-0"):
        return {"id": edge_id, "source": source, "target": target, "sourceHandle": source_port,
                "targetHandle": target_port,
                "data": {"length_m": length_m, "diameter_m": diameter_m, "roughness_mm": 0.0}}
    return {"nodes": [_node("src", "pressure_source", source_pressure_bara=2.0, temperature_k=300.0),
                      _node("m", "mixer"),
                      _node("p", "centrifugal_pump", flow_rated_lmin=60.0, head_rated_m=40.0),
                      _node("s", "splitter"),
                      _node("v", "linear_control_valve", max_cv=1.0, opening_pct=opening_pct),
                      _node("t", "tank", level_m=1.0, temperature_k=300.0)],
            "edges": [edge("e0", "src", "m"), edge("e1", "m", "p"), edge("e2", "p", "s"),
                      edge("e3", "s", "v"), edge("e4", "v", "t"),
                      edge("e5", "s", "m", diameter_m=0.025, length_m=30.0, source_port="outlet-1", target_port="inlet-1")],
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
