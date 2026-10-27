"""An in-line component (orifice, calibrated restriction, filter) is a link between two solved port nodes:
what its ports report, what can sense at them, and which drawings are refused."""
import numpy as np
import pytest

from networks import component_line, graph_node, graph_pipe, graph_signal, solve_graph
from simulation.equipment.base_node import total_of
from simulation.equipment.component_link import canvas_id
from simulation.equipment.orifice import Orifice
from simulation.graph_parser import GraphParser, ModelInputError
from simulation.schemas import ReactFlowGraph
from simulation.solver import NetworkSolver, _telemetry_max_pressure_bara
from routers.simulation import calculate_case_kpis, extract_telemetry

ORIFICE = {"orifice_diameter_m": 0.015}


def test_canvas_id_names_the_component_behind_its_hidden_nodes():
    assert [canvas_id(i) for i in ("c#port-0", "c#port-1", "c#link", "c", "tank 1")] == ["c", "c", "c", "c", "tank 1"]


@pytest.mark.parametrize("entry, leave", [("port-0", "port-1"), ("port-1", "port-0")], ids=["forward", "mirrored"])
def test_orifice_between_two_pipe_sizes_uses_the_upstream_bore_whichever_way_it_is_drawn(entry, leave):
    """DN80 ahead of the plate, DN50 behind: beta follows the pipe the flow arrives in, so drawing the orifice
    mirrored (flow enters by port 2) gives the same plate drop as the reference at the DN80 bore."""
    graph = component_line("orifice", ORIFICE, source_level=10.0, sink_level=1.0)
    graph["edges"] = [graph_pipe("e1", "t1", "c", "outlet-0", entry, diameter=0.08),
                      graph_pipe("e2", "c", "t2", leave, "inlet-0", diameter=0.05)]
    net, _ = solve_graph(graph)
    c, q = net.inline_nodes["c"], net.nodes["t1"].outlets[0].flow_rate
    assert q > 0
    up, down = c.ports[int(entry[-1])], c.ports[int(leave[-1])]
    expected = Orifice("ref", pipe_diameter=0.08, orifice_diameter=0.015).calculate_delta_p(q, up.density, up.viscosity)
    assert total_of(up) - total_of(down) == pytest.approx(expected, rel=1e-3)
    wrong = Orifice("ref", pipe_diameter=0.05, orifice_diameter=0.015).calculate_delta_p(q, up.density, up.viscosity)
    assert abs(wrong - expected) > 0.05 * expected   # the two bores differ, so the check tells them apart


def _dead_leg_graph():
    """Tank -> junction -> tank, and a third junction port feeding an orifice whose port 2 is left free."""
    return {"nodes": [graph_node("t1", "tank", {"level_m": 5.0}), graph_node("t2", "tank", {"level_m": 1.0}),
                      graph_node("j", "junction", {"num_ports": 3}), graph_node("d", "orifice", ORIFICE)],
            "edges": [graph_pipe("e1", "t1", "j", "outlet-0", "port-0"), graph_pipe("e2", "j", "t2", "port-1", "inlet-0"),
                      graph_pipe("e3", "j", "d", "port-2", "port-0")],
            "globalSettings": {"fluid_type": "water"}}


def test_free_component_port_is_a_dead_leg_at_the_upstream_pressure():
    net, stats = solve_graph(_dead_leg_graph())
    d, junction_port = net.inline_nodes["d"], net.nodes["j"].port(2)
    for port in d.ports:
        assert port.flow_rate == pytest.approx(0.0, abs=1e-9)
        assert port.pressure == pytest.approx(junction_port.pressure, abs=5.0)
        assert port.temperature == pytest.approx(junction_port.temperature, abs=0.01)
    assert stats["physical_validity"]["valid"]


def test_unwired_component_does_not_block_a_valid_network():
    graph = component_line("filter")
    graph["nodes"].append(graph_node("loose", "orifice", ORIFICE))
    _, stats = solve_graph(graph)
    assert stats["success"]


def _edit(graph, edge_id, **fields):
    graph["edges"] = [{**e, **fields} if e["id"] == edge_id else e for e in graph["edges"]]
    return graph


def _two_pipes_on_port_0():
    graph = component_line("orifice")
    graph["nodes"].append(graph_node("t3", "tank"))
    graph["edges"].append(graph_pipe("e3", "t3", "c", "outlet-0", "port-0"))
    return graph


@pytest.mark.parametrize("build, message", [
    pytest.param(lambda: _edit(component_line("orifice"), "e1", sourceHandle="inlet-0"), "joins two", id="pipe_from_a_role_inlet"),
    pytest.param(lambda: _edit(component_line("orifice"), "e2", targetHandle="outlet-0"), "joins two", id="pipe_to_a_role_outlet"),
    pytest.param(_two_pipes_on_port_0, "takes one pipe", id="two_pipes_on_one_port"),
])
def test_drawings_a_component_port_cannot_take_are_refused(build, message):
    with pytest.raises(ModelInputError, match=message):
        GraphParser.parse_graph(ReactFlowGraph(**build()))


def _pilot_graph(port):
    """12.2 bara through a 30 mm plate to a header with a free-discharge line: the plate's two ports lie either
    side of the 10 barg set pressure of the pilot relief valve on the header, so its lift shows the port it reads."""
    return {"nodes": [graph_node("src", "pressure_source", {"source_pressure_bara": 12.2}),
                      graph_node("c", "orifice", {"orifice_diameter_m": 0.03}),
                      graph_node("sp", "junction", {"num_ports": 3}),
                      graph_node("t", "tank", {"level_m": 0.0}), graph_node("drain", "tank", {"level_m": 0.0}),
                      graph_node("psv", "pressure_safety_valve", {"set_pressure_barg": 10.0, "cv": 1.0,
                                                                  "action_mode": "modulating", "valve_type": "pilot"})],
            "edges": [graph_pipe("e1", "src", "c", "outlet-0", "port-0", diameter=0.05),
                      graph_pipe("e2", "c", "sp", "port-1", "port-0", diameter=0.05),
                      graph_pipe("e3", "sp", "t", "port-1", "inlet-0", diameter=0.05),
                      graph_pipe("e4", "sp", "psv", "port-2", "inlet-0", diameter=0.05),
                      graph_pipe("e5", "psv", "drain", "outlet-0", "inlet-0", diameter=0.05),
                      graph_signal("s1", "c", f"signal-port-{port}", "psv")],
            "globalSettings": {"fluid_type": "water"}}


def test_pilot_relief_valve_senses_the_pressure_at_the_chosen_component_port():
    lifts = {}
    for port in (0, 1):
        net, _ = solve_graph(_pilot_graph(port))
        psv, c = net.nodes["psv"], net.inline_nodes["c"]
        sensed_barg = (total_of(c.ports[port]) - 101325.0) / 1e5
        assert psv.has_remote_pilot
        assert psv.lift_pct == pytest.approx(min(100.0, max(0.0, 100.0 * (sensed_barg - 10.0) / 1.0)), abs=0.5)
        assert extract_telemetry(net)["nodes"]["psv"]["pilot_sensing_node_id"] == "c"
        lifts[port] = psv.lift_pct
    assert lifts[0] > lifts[1] + 10.0


@pytest.mark.parametrize("port, set_pa", [(0, 2.5e5), (1, 1.6e5)], ids=["upstream_port", "downstream_port"])
def test_remote_control_valve_holds_the_pressure_at_the_chosen_component_port(port, set_pa):
    graph = {"nodes": [graph_node("t1", "tank", {"level_m": 30.0}), graph_node("t2", "tank", {"level_m": 0.0}),
                       graph_node("r", "remote_control_valve", {"max_cv": 50.0, "set_pressure_pa": set_pa}),
                       graph_node("c", "orifice", ORIFICE)],
             "edges": [graph_pipe("e1", "t1", "r", "outlet-0", "inlet-0"), graph_pipe("e2", "r", "c", "outlet-0", "port-0"),
                       graph_pipe("e3", "c", "t2", "port-1", "inlet-0", length=100.0),
                       graph_signal("s1", "c", f"signal-port-{port}", "r")],
             "globalSettings": {"fluid_type": "water"}}
    net, _ = solve_graph(graph)
    c = net.inline_nodes["c"]
    assert c.ports[port].pressure == pytest.approx(set_pa, abs=2e3)
    assert abs(c.ports[1 - port].pressure - set_pa) > 5e3   # the other port is not the one held


def test_physical_validity_issue_at_a_component_port_names_the_component_and_its_port():
    """Hot water drawn through a 15 mm plate by a pump: the pressure behind the plate falls below the vapour pressure."""
    graph = {"nodes": [graph_node("t1", "tank", {"level_m": 1.0, "temperature_k": 363.15}),
                       graph_node("c", "orifice", {"label": "Plate", **ORIFICE}),
                       graph_node("p", "centrifugal_pump", {"flow_rated_lmin": 200.0, "head_rated_m": 40.0}),
                       graph_node("t2", "tank", {"level_m": 1.0, "temperature_k": 363.15})],
             "edges": [graph_pipe("e1", "t1", "c", "outlet-0", "port-0", diameter=0.05),
                       graph_pipe("e2", "c", "p", "port-1", "inlet-0", diameter=0.05),
                       graph_pipe("e3", "p", "t2", "outlet-0", "inlet-0", diameter=0.05)],
             "globalSettings": {"fluid_type": "water"}}
    graph["nodes"][1]["data"]["label"] = "Plate"
    _, stats = solve_graph(graph)
    issues = stats["physical_validity"]["issues"]
    assert any(i["node_id"] == "c" and i["port"] == "port-1" and i["node"] == "Plate" for i in issues)
    assert not any("#" in f"{i['node_id']}{i['node']}" for i in issues)


def test_case_kpis_and_peak_pressure_include_the_component_ports():
    net, stats = solve_graph(component_line("orifice", ORIFICE))
    telemetry = extract_telemetry(net)
    telemetry["nodes"]["c"]["ports"][0]["pressure"] = 9.0e5     # beyond every other port
    telemetry["nodes"]["c"]["ports"][1]["pressure"] = 0.2e5
    kpis = calculate_case_kpis(net, telemetry, stats)
    assert (kpis["max_pressure_bar"], kpis["min_pressure_bar"]) == (9.0, 0.2)
    assert _telemetry_max_pressure_bara(telemetry) == 9.0
    assert _telemetry_max_pressure_bara({"nodes": {"c": {"ports": [None, {"pressure": 3e5}]}}}) == 3.0


def test_solver_residual_is_located_on_the_component_not_its_hidden_nodes():
    graph = component_line("orifice", ORIFICE)
    graph["nodes"][1]["data"]["label"] = "Plate"
    net, _ = solve_graph(graph)
    solver = NetworkSolver(net)
    solver.solve()
    n_nodes = len(solver.internal_node_indices)
    residuals = np.zeros(n_nodes + len(solver.edges_list))
    residuals[solver.internal_node_indices.index([n.id for n in solver.nodes_list].index("c#port-1"))] = 1.0
    assert solver._identify_bottleneck(residuals) == {
        "type": "Node", "name": "Plate", "id": "c", "error_type": "Mass Balance", "magnitude": 1.0}
    residuals[:] = 0.0
    residuals[n_nodes + [e["id"] for e in solver.edges_list].index("c#link")] = 1.0
    assert solver._identify_bottleneck(residuals) == {
        "type": "Node", "name": "Plate", "id": "c", "error_type": "Pressure Balance", "magnitude": 1.0}
