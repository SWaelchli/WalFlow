"""Tank, pressure boundary and flow boundary ports: how a flow boundary shares its flow, the telemetry per port, and
pressure sensing from a port (signal-port-k)."""
import numpy as np
import pytest

from networks import graph_node, graph_pipe, graph_signal, solve_graph
from routers.simulation import extract_telemetry
from simulation.solver import NetworkSolver

LMIN = 1.0 / 60000.0   # m³/s per L/min
WATER = {"fluid_type": "water"}


def _splitting_boundary(num_ports=3, draw=False, **data):
    """Boundary with num_ports ports; ports 0, 2 and 3 (the first three used) each connect to a tank by 50 m of 40 mm
    pipe, the tanks standing 1, 5 and 10 m high. A free port gets no pipe. Returns the pipe flows (L/min, positive
    from the drawn source: out of a supply, into a draw) and the port total pressures."""
    used = [k for k in (0, 1, 2, 3) if k < num_ports and not (num_ports == 4 and k == 1)][:3]
    nodes = [graph_node("fb", "flow_boundary", {"set_flow_lmin": 300.0, "num_ports": num_ports,
                                                "flow_direction": "draw" if draw else "supply", **data})]
    edges = []
    for k, level in zip(used, (1.0, 5.0, 10.0)):
        nodes.append(graph_node(f"t{k}", "tank", {"level_m": level}))
        ends = (f"t{k}", "fb", "port-0", f"port-{k}") if draw else ("fb", f"t{k}", f"port-{k}", "port-0")
        edges.append(graph_pipe(f"p{k}", *ends, length=50.0, diameter=0.04))
    network, _ = solve_graph({"nodes": nodes, "edges": edges, "globalSettings": WATER})
    telemetry = extract_telemetry(network)
    pipe_flows = [telemetry["edges"][f"p{k}"]["inlets"][0]["flow_rate"] / LMIN for k in used]
    return pipe_flows, [p["total_pressure"] for p in telemetry["nodes"]["fb"]["ports"] if p is not None]


@pytest.mark.parametrize("kwargs, expected_lmin, one_pressure", [
    # the shared pressure pushes 183 and 134 L/min into the low tanks and, above the 10 m tank's head, -17 L/min back
    pytest.param(dict(flow_split="common_pressure"), [183.2, 133.8, -17.1], True, id="common_pressure_solves_the_split"),
    pytest.param(dict(flow_split="total_split"), [100.0, 100.0, 100.0], False, id="total_split_gives_equal_shares_at_own_pressures"),
    pytest.param(dict(flow_split="per_port", port_flows_lmin=[50.0, 120.0, 300.0]), [50.0, 120.0, 300.0], False,
                 id="per_port_gives_each_port_its_own_flow"),
    # port 1 is free: ignored with per_port; the flows sit on ports 0, 2, 3 (index 1 is the free port's entry)
    pytest.param(dict(num_ports=4, flow_split="per_port", port_flows_lmin=[50.0, 0.0, 120.0, 300.0]), [50.0, 120.0, 299.9], False,
                 id="per_port_ignores_a_free_port"),
    pytest.param(dict(draw=True, flow_split="per_port", port_flows_lmin=[50.0, 120.0, 200.0]), [50.0, 120.0, 200.0], False,
                 id="per_port_as_a_draw"),
])
def test_flow_boundary_shares_its_flow_over_the_ports(kwargs, expected_lmin, one_pressure):
    flows, totals = _splitting_boundary(**kwargs)
    assert flows == pytest.approx(expected_lmin, abs=0.5, rel=0.005)
    assert bool(max(totals) - min(totals) < 5.0) is one_pressure


def _draw_line(set_lmin, level, length, diameter, **data):
    nodes = [graph_node("t", "tank", {"level_m": level}),
             graph_node("fb", "flow_boundary", {"set_flow_lmin": set_lmin, "flow_direction": "draw", **data})]
    edges = [graph_pipe("p", "t", "fb", "port-0", "port-0", length=length, diameter=diameter)]
    network, _ = solve_graph({"nodes": nodes, "edges": edges, "globalSettings": WATER})
    return extract_telemetry(network)


def test_draw_takes_its_flow_into_the_boundary_as_a_positive_flow():
    """Tank (2 m) -> 10 m x 50 mm -> draw of 100 L/min: the pipe and the port both report +100 L/min."""
    telemetry = _draw_line(100.0, 2.0, 10.0, 0.05)
    assert telemetry["edges"]["p"]["inlets"][0]["flow_rate"] / LMIN == pytest.approx(100.0, rel=0.005)
    assert telemetry["nodes"]["fb"]["ports"][0]["flow_rate"] / LMIN == pytest.approx(100.0, rel=0.005)
    assert telemetry["nodes"]["fb"]["suction_limit_reached"] is False


def _hub_graph(hub_type, drawn_into_hub):
    """A hub (tank at 10 m or pressure boundary at the same pressure) with 4 ports: port-0 to a 1 m tank below it,
    port-2 from a 30 m tank above it, ports 1 and 3 free. drawn_into_hub tells for (port-0, port-2) whether the pipe
    is drawn into the hub (True) or out of it (False)."""
    hub = (graph_node("hub", "tank", {"level_m": 10.0, "num_ports": 4}) if hub_type == "tank" else
           graph_node("hub", "pressure_boundary", {"set_pressure_bara": 1.01325 + 0.98, "num_ports": 4}))
    nodes = [hub, graph_node("low", "tank", {"level_m": 1.0}), graph_node("high", "tank", {"level_m": 30.0})]
    edges = []
    for edge_id, port, other, into in (("e0", "port-0", "low", drawn_into_hub[0]), ("e2", "port-2", "high", drawn_into_hub[1])):
        ends = (other, "hub", "port-0", port) if into else ("hub", other, port, "port-0")
        edges.append(graph_pipe(edge_id, *ends, length=20.0, diameter=0.05))
    return {"nodes": nodes, "edges": edges, "globalSettings": WATER}


@pytest.mark.parametrize("hub_type", ["tank", "pressure_boundary"])
def test_hub_reports_a_flow_per_port_into_it_whatever_the_drawn_direction(hub_type):
    """ports is in port-k order with None where no pipe sits; flow_rate is positive into the hub: the port towards
    the low tank is negative, the one from the high tank positive. Drawing a pipe from the other end flips the sign
    of the pipe's own flow but not the port's, and the numbers stay the same."""
    seen = []
    for drawn in ((True, True), (False, True), (True, False), (False, False)):
        network, _ = solve_graph(_hub_graph(hub_type, drawn))
        ports = extract_telemetry(network)["nodes"]["hub"]["ports"]
        assert len(ports) == 4 and ports[1] is None and ports[3] is None
        assert ports[0]["flow_rate"] < -1e-4 < 1e-4 < ports[2]["flow_rate"]
        pipes = {e["id"]: e["pipe"] for e in network.edges}
        for port, edge_id, into in ((0, "e0", drawn[0]), (2, "e2", drawn[1])):
            pipe_flow = pipes[edge_id].inlets[0].flow_rate   # positive from the drawn source to the drawn target
            assert ports[port]["flow_rate"] == pytest.approx(pipe_flow if into else -pipe_flow, rel=1e-6)
        seen.append([ports[0]["flow_rate"], ports[2]["flow_rate"], ports[0]["pressure"]])
    assert np.allclose(seen, seen[0], rtol=1e-6)


def _sensed_graph(sink_type):
    """6 bara supply -> remote control valve -> load valve -> sink, the valve sensing the sink's port-0."""
    sink = {"tank": graph_node("sink", "tank", {"level_m": 0.0}),
            "pressure_boundary": graph_node("sink", "pressure_boundary", {"set_pressure_bara": 2.0}),
            "flow_boundary": graph_node("sink", "flow_boundary", {"set_flow_lmin": 30.0, "flow_direction": "draw"})}[sink_type]
    return {"nodes": [graph_node("src", "pressure_boundary", {"set_pressure_bara": 6.0}),
                      graph_node("rcv", "remote_control_valve", {"max_cv": 5.0, "set_pressure_pa": 3.0e5}),
                      graph_node("load", "linear_control_valve", {"max_cv": 1.0, "opening_pct": 100.0}), sink],
            "edges": [graph_pipe("e0", "src", "rcv", "port-0", "inlet-0"), graph_pipe("e1", "rcv", "load", "outlet-0", "inlet-0"),
                      graph_pipe("e2", "load", "sink", "outlet-0", "port-0"),
                      graph_signal("s0", "sink", "signal-port-0", "rcv")],
            "globalSettings": WATER}


@pytest.mark.parametrize("sink_type", ["tank", "pressure_boundary", "flow_boundary"])
def test_remote_control_valve_senses_the_pressure_of_a_boundary_port(sink_type):
    network, _ = solve_graph(_sensed_graph(sink_type))
    rcv, sink = network.nodes["rcv"], network.nodes["sink"]
    assert rcv.remote_sensing_config is not None
    assert rcv.sensed_pressure == pytest.approx(sink.port(0).pressure, abs=1e-6)


def test_bottleneck_on_a_pipe_whose_id_contains_a_hash_does_not_look_for_a_node():
    """User ids may hold '#': a residual on such a pipe is reported on the pipe, not looked up as a hidden link."""
    graph = {"nodes": [graph_node("fb", "flow_boundary", {"set_flow_lmin": 50.0}), graph_node("t", "tank", {"level_m": 1.0})],
             "edges": [graph_pipe("line#1", "fb", "t", "port-0", "port-0")], "globalSettings": WATER}
    network, _ = solve_graph(graph)
    solver = NetworkSolver(network)
    solver.solve()
    residuals = np.zeros(len(solver.internal_node_indices) + len(solver.edges_list))
    residuals[len(solver.internal_node_indices) + [e["id"] for e in solver.edges_list].index("line#1")] = 1.0
    bottleneck = solver._identify_bottleneck(residuals)
    assert bottleneck["type"] == "Connection" and bottleneck["error_type"] == "Pressure Balance"
