"""Laws every solved network obeys, checked on generated series-parallel networks (helpers/strategies.networks).

One property here covers every topology and component mix at once: a bug in assembly, residuals, telemetry,
property propagation or warm start breaks a law for some network, whichever component it hides in.
Topology-specific behaviour (controllers, relief, islands) stays in the other scenario modules.
"""
import contextlib
import io
import math

import pytest
from hypothesis import given, strategies as st

from strategies import DISSIPATIVE_ONLY, networks
from simulation.fluid_utils import FluidProperties
from simulation.graph_parser import GraphParser
from simulation.schemas import ReactFlowGraph
from simulation.solver import NetworkSolver

BOUNDARY_TYPES = {"tank", "pressure_source", "flow_source"}
STATIC_DROP_EXEMPT = {"centrifugal_pump"} | BOUNDARY_TYPES
FLOW_TOL = 1e-8          # m³/s; the mass rows converge to ~2e-10 m³/s per node
PRESSURE_TOL = 5.0       # Pa
# Reported pressures lag the last property update (D-20): a 0.05 K step of heavy crude moves its viscosity
# ~0.2 %, so a pipe after a large viscous drop can show a small rise. Relative to the network's pressure span.
PRESSURE_LAG = 2e-3
TEMPERATURE_TOL = 0.1    # K; the property loop stops at 0.01-0.05 K changes


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
            # A stagnant port's temperature depends on the start (D-21); compare flowing ports only
            if abs(qa) > FLOW_TOL:
                assert ta == pytest.approx(tb, abs=TEMPERATURE_TOL), key


@given(networks())
def test_well_posed_network_reaches_a_finite_steady_state(graph):
    network = solved(graph)
    for key, ports in snapshot(network).items():
        assert all(v == v and abs(v) != float("inf") for port in ports for v in port), key


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


@given(networks())
def test_pressure_is_continuous_and_falls_along_the_flow(graph):
    """A pipe end has its node's port pressure; static pressure falls across every pipe and passive
    component in the flow direction (all generated networks are driven from one side)."""
    network = solved(graph)
    types = node_types(graph)
    pressures = [p.pressure for node in network.nodes.values() for p in node.inlets + node.outlets]
    fall_tol = PRESSURE_TOL + PRESSURE_LAG * (max(pressures) - min(pressures))
    for edge in network.edges:
        pipe = edge["pipe"]
        src = network.nodes[edge["source"]].outlets[int(edge["source_port"].split("-")[-1])]
        tgt = network.nodes[edge["target"]].inlets[int(edge["target_port"].split("-")[-1])]
        assert pipe.inlets[0].pressure == pytest.approx(src.pressure, abs=PRESSURE_TOL), edge["id"]
        assert pipe.outlets[0].pressure == pytest.approx(tgt.pressure, abs=PRESSURE_TOL), edge["id"]
        if abs(pipe.inlets[0].flow_rate) > FLOW_TOL:
            drop = (pipe.inlets[0].pressure - pipe.outlets[0].pressure) * math.copysign(1.0, pipe.inlets[0].flow_rate)
            assert drop >= -fall_tol, edge["id"]
    for node_id, node in network.nodes.items():
        if types[node_id] in STATIC_DROP_EXEMPT or node.inlets[0].flow_rate <= 1e-7:
            continue
        assert node.inlets[0].pressure >= max(p.pressure for p in node.outlets) - PRESSURE_TOL, node_id


@given(networks(components=tuple(sorted(DISSIPATIVE_ONLY))))
def test_dissipation_never_cools_and_mixing_stays_between_its_streams(graph):
    """Without a cooler the fluid only warms by dissipation (pipes, throttling, pump losses), and a mixer
    outlet lies between its inlet temperatures."""
    network = solved(graph)
    types = node_types(graph)
    t_supply = min(n["data"]["temperature_k"] for n in graph["nodes"] if "temperature_k" in n["data"])
    for node_id, node in network.nodes.items():
        if types[node_id] in BOUNDARY_TYPES:
            continue
        for port in [*node.inlets, *node.outlets]:
            assert port.temperature >= t_supply - TEMPERATURE_TOL, node_id
        if types[node_id] == "mixer":
            feeding = [p.temperature for p in node.inlets if p.flow_rate > 1e-7]
            if feeding:
                assert min(feeding) - TEMPERATURE_TOL <= node.outlets[0].temperature <= max(feeding) + TEMPERATURE_TOL


@given(networks())
def test_junctions_conserve_energy(graph):
    """At a splitter or mixer every leaving stream carries the mass-weighted mean specific enthalpy h(T) of
    the arriving streams, in whichever direction each stream flows. (Absolute enthalpy flows are not compared:
    junctions balance volume, not mass, D-22.)"""
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
