"""Junction ports: telemetry per port, and pressure sensing lines from a port (signal-port-k)."""
import contextlib
import io

from networks import neutral_graph
import pytest

from simulation.graph_parser import GraphParser
from simulation.schemas import ReactFlowGraph
from simulation.solver import NetworkSolver
from routers.simulation import extract_telemetry

P_ATM = 101325.0


def _node(node_id, node_type, **data):
    return {"id": node_id, "type": node_type, "position": {"x": 0, "y": 0}, "data": {"label": node_id, **data}}


def _pipe(edge_id, source, target, source_handle, target_handle, length_m=2.0, diameter_m=0.05):
    return {"id": edge_id, "source": source, "target": target, "sourceHandle": source_handle,
            "targetHandle": target_handle, "data": {"length_m": length_m, "diameter_m": diameter_m}}


def _signal(edge_id, source, source_handle, target):
    return {"id": edge_id, "source": source, "sourceHandle": source_handle, "target": target,
            "targetHandle": "signal-in", "data": {"type": "SIGNAL"}}


def _solve(graph):
    NetworkSolver.clear_warm_start_cache()
    with contextlib.redirect_stdout(io.StringIO()):
        network = GraphParser.parse_graph(neutral_graph(**graph))
        stats = NetworkSolver(network).solve()
    assert stats["success"], stats.get("error")
    return network


def test_telemetry_ports_report_flow_into_the_junction_per_port():
    """A 4-port junction with a feed drawn into it, an outlet drawn out of it, a second tank whose pipe is drawn
    towards the junction but flows back to that (lower) tank, and a port with no pipe. The ports list is in
    port-k order, flow is positive into the junction whatever the drawn direction, and mass sums to zero."""
    graph = {"nodes": [_node("hi", "tank", level_m=10.0), _node("lo", "tank", level_m=1.0),
                       _node("mid", "tank", level_m=4.0), _node("j", "junction", num_ports=4)],
             "edges": [_pipe("e0", "hi", "j", "outlet-0", "port-2"),
                       _pipe("e1", "j", "lo", "port-0", "inlet-0"),
                       _pipe("e2", "mid", "j", "outlet-0", "port-1")],
             "globalSettings": {"fluid_type": "water"}}
    network = _solve(graph)
    ports = extract_telemetry(network)["nodes"]["j"]["ports"]
    assert len(ports) == 4
    assert ports[3] is None
    assert ports[2]["flow_rate"] > 1e-4          # feed: drawn into the junction, flows in
    assert ports[0]["flow_rate"] < -1e-4         # drawn out of the junction, flows out
    assert ports[1]["flow_rate"] < -1e-4         # drawn into the junction but pushed back to the lower tank
    mass = [p["flow_rate"] * p["density"] for p in ports[:3]]
    assert sum(mass) == pytest.approx(0.0, abs=1e-6 * sum(abs(m) for m in mass))
    pipes = {e["id"]: e["pipe"] for e in network.edges}
    assert ports[2]["flow_rate"] == pytest.approx(pipes["e0"].inlets[0].flow_rate, rel=1e-6)
    assert ports[0]["flow_rate"] == pytest.approx(-pipes["e1"].inlets[0].flow_rate, rel=1e-6)
    assert ports[1]["flow_rate"] == pytest.approx(pipes["e2"].inlets[0].flow_rate, rel=1e-6)


def _regulated_graph(sense_handle):
    """6 bara supply -> remote control valve (holds 3 bara at the sensed point) -> junction -> load valve -> tank.
    Port-0 takes the pipe drawn into the junction, port-1 the one drawn out of it, port-2 has no pipe."""
    return {"nodes": [_node("src", "pressure_boundary", set_pressure_bara=6.0),
                      _node("rcv", "remote_control_valve", max_cv=5.0, set_pressure_pa=3.0e5),
                      _node("j", "junction"),
                      _node("load", "linear_control_valve", max_cv=1.0, opening_pct=100.0),
                      _node("t", "tank", level_m=0.0)],
            "edges": [_pipe("e0", "src", "rcv", "outlet-0", "inlet-0"),
                      _pipe("e1", "rcv", "j", "outlet-0", "port-0"),
                      _pipe("e2", "j", "load", "port-1", "inlet-0"),
                      _pipe("e3", "load", "t", "outlet-0", "inlet-0"),
                      _signal("s0", "j", sense_handle, "rcv")],
            "globalSettings": {"fluid_type": "water"}}


@pytest.mark.parametrize("sense_handle", [
    pytest.param("signal-port-0", id="remote_valve_senses_a_port_drawn_into_the_junction"),
    pytest.param("signal-port-1", id="remote_valve_senses_a_port_drawn_out_of_the_junction"),
])
def test_remote_control_valve_holds_the_pressure_of_a_junction_port(sense_handle):
    network = _solve(_regulated_graph(sense_handle))
    junction, rcv = network.nodes["j"], network.nodes["rcv"]
    port = junction.port(int(sense_handle[-1]))
    assert rcv.sensed_pressure == pytest.approx(port.pressure, abs=1e-6)
    assert 0.0 < rcv.opening_pct < 100.0
    assert port.pressure == pytest.approx(3.0e5, abs=0.05e5)


@pytest.mark.parametrize("sense_handle", [
    pytest.param("signal-port-2", id="port_without_a_pipe"),
    pytest.param("signal-port-5", id="port_beyond_the_junction"),
])
def test_signal_from_an_unconnected_junction_port_senses_nothing(sense_handle):
    network = _solve(_regulated_graph(sense_handle))
    rcv = network.nodes["rcv"]
    assert rcv.remote_sensing_config is None
    assert rcv.sensed_pressure == pytest.approx(rcv.outlets[0].pressure, abs=1e-6)


def _pilot_graph(signals):
    """Header 10.5 barg -> junction -> 20 m of 20 mm pipe -> pilot PSV (set 10 barg) -> drain."""
    return {"nodes": [_node("src", "pressure_boundary", set_pressure_bara=10.5 + P_ATM / 1e5),
                      _node("j", "junction"),
                      _node("psv", "pressure_safety_valve", set_pressure_barg=10.0, cv=1.0, action_mode="modulating",
                            valve_type="pilot"),
                      _node("t", "tank", level_m=0.0)],
            "edges": [_pipe("e0", "src", "j", "outlet-0", "port-0", 2.0, 0.2),
                      _pipe("e1", "j", "psv", "port-1", "inlet-0", 20.0, 0.02),
                      _pipe("e2", "psv", "t", "outlet-0", "inlet-0", 1.0, 0.2),
                      *signals],
            "globalSettings": {"fluid_type": "water"}}


@pytest.mark.parametrize("signals, sensed_node", [
    pytest.param([_signal("s1", "j", "signal-port-1", "psv"), _signal("s2", "src", "signal-port-0", "psv")], "j",
                 id="first_line_from_the_junction_wins"),
    pytest.param([_signal("s2", "src", "signal-port-0", "psv"), _signal("s1", "j", "signal-port-1", "psv")], "src",
                 id="first_line_from_another_node_wins"),
])
def test_pilot_keeps_its_first_sensing_line_also_from_a_junction_port(signals, sensed_node):
    network = _solve(_pilot_graph(signals))
    psv = network.nodes["psv"]
    assert psv.remote_sensing_config["node_id"] == sensed_node
    assert psv.pilot_source[0] is network.nodes[sensed_node]


def test_pilot_signal_from_an_unconnected_junction_port_is_no_sensing_line():
    network = _solve(_pilot_graph([_signal("s1", "j", "signal-port-2", "psv")]))
    psv = network.nodes["psv"]
    assert psv.pilot_source is None and not psv.has_remote_pilot
