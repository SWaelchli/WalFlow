from networks import neutral_graph
import pytest

from physics_refs import reservoir_entry_dp

# Add backend to path

from simulation.schemas import ReactFlowGraph
from simulation.graph_parser import GraphParser
from simulation.solver import NetworkSolver
from simulation.equipment.measure_point import MeasurePoint


def _node(id_, type_, data=None):
    return {"id": id_, "type": type_, "data": {"label": id_, **(data or {})}, "position": {"x": 0, "y": 0}}


def _pipe(id_, src, tgt, length, src_port="outlet-0", tgt_port="inlet-0"):
    return {"id": id_, "source": src, "target": tgt, "sourceHandle": src_port, "targetHandle": tgt_port,
            "data": {"length_m": length, "diameter_m": 0.05}}


def _signal(id_, src, src_port, tgt, tgt_port):
    return {"id": id_, "source": src, "target": tgt, "sourceHandle": src_port, "targetHandle": tgt_port,
            "data": {"type": "SIGNAL"}}


def _solve(graph_dict):
    network = GraphParser.parse_graph(neutral_graph(**graph_dict))
    stats = NetworkSolver(network).solve()
    assert stats["success"]
    return network


TANKS = [_node("t1", "tank", {"level_m": 20.0}), _node("t2", "tank", {"level_m": 1.0})]


def test_tap_has_no_pressure_drop_and_matches_an_unsplit_pipe():
    # t1 -> 40 m -> t2 and t1 -> 20 m -> tap -> 20 m -> t2 must solve identically
    ref = _solve({"nodes": TANKS, "edges": [_pipe("p", "t1", "t2", 40.0)]})
    net = _solve({
        "nodes": TANKS + [_node("tap", "measure_point")],
        "edges": [_pipe("p1", "t1", "tap", 20.0, tgt_port="port-0"), _pipe("p2", "tap", "t2", 20.0, src_port="port-1")],
    })
    tap = net.nodes["tap"]
    assert isinstance(tap, MeasurePoint)

    q_ref = ref.nodes["t2"].inlets[0].flow_rate
    assert q_ref > 0
    assert tap.port_flow_into(0) == pytest.approx(q_ref, rel=1e-4)   # positive into the tap by port 0, out by port 1
    assert tap.port_flow_into(1) == pytest.approx(-q_ref, rel=1e-4)
    assert tap.port(0).pressure == pytest.approx(tap.port(1).pressure, abs=1.0)
    # The tap sits halfway: equal pipes and flow split the friction evenly; the entry velocity head is
    # taken where the fluid leaves t1, so all of it lies upstream of the tap
    p1, p2 = net.nodes["t1"].outlets[0].pressure, net.nodes["t2"].inlets[0].pressure
    entry = reservoir_entry_dp(q_ref, 0.05, tap.port(0).density)
    assert tap.port(0).pressure == pytest.approx(p2 + (p1 - p2 - entry) / 2, rel=1e-3)


def test_instrument_bubble_and_its_signal_edge_do_not_enter_the_network():
    graph = {
        "nodes": TANKS + [_node("tap", "measure_point"), _node("pit", "instrument", {"variable": "P"})],
        "edges": [
            _pipe("p1", "t1", "tap", 20.0, tgt_port="port-0"), _pipe("p2", "tap", "t2", 20.0, src_port="port-1"),
            _signal("s1", "tap", "signal-port-0", "pit", "signal-in"),
        ],
    }
    network = GraphParser.parse_graph(neutral_graph(**graph))
    assert set(network.nodes) == {"t1", "t2", "tap"}
    assert [e["id"] for e in network.edges] == ["p1", "p2"]


def test_remote_control_valve_senses_a_tap():
    # The RCV holds 1.2 bar(a) at the tap downstream of it (tap 1.29 bar(a) with the valve wide open, sink 1.11 bar(a))
    graph = {
        "nodes": TANKS + [
            _node("rcv", "remote_control_valve", {"max_cv": 20.0, "set_pressure_pa": 1.2e5}),
            _node("tap", "measure_point"),
        ],
        "edges": [
            _pipe("p1", "t1", "rcv", 5.0), _pipe("p2", "rcv", "tap", 10.0, tgt_port="port-0"), _pipe("p3", "tap", "t2", 10.0, src_port="port-1"),
            _signal("s1", "tap", "signal-port-0", "rcv", "signal-in"),
        ],
    }
    network = _solve(graph)
    rcv = network.nodes["rcv"]
    assert rcv.remote_sensing_config == {"node_id": "tap", "port_type": "inlet", "port_idx": 0}   # slot of port-0
    assert 0.0 < rcv.opening_pct < 100.0
    assert network.nodes["tap"].port(0).pressure / 1e5 == pytest.approx(1.2, abs=2e-3)


def test_remote_control_valve_senses_a_dead_end_tap_piped_on_port_1_only():
    # The tap's only pipe is on port-1 (port-0 free); its signal pin must still attach to the valve
    graph = {
        "nodes": TANKS + [
            _node("t3", "tank", {"level_m": 5.0}),
            _node("rcv", "remote_control_valve", {"max_cv": 20.0, "set_pressure_pa": 1.2e5}),
            _node("tap", "measure_point"),
        ],
        "edges": [
            _pipe("p1", "t1", "rcv", 5.0), _pipe("p2", "rcv", "t2", 10.0),
            _pipe("p3", "tap", "t3", 2.0, src_port="port-1"),
            _signal("s1", "tap", "signal-port-0", "rcv", "signal-in"),
        ],
    }
    network = GraphParser.parse_graph(neutral_graph(**graph))
    assert network.nodes["rcv"].remote_sensing_config is not None
    assert network.nodes["rcv"].remote_sensing_config["node_id"] == "tap"
