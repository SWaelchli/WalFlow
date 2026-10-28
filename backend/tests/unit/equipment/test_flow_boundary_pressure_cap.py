"""A flow boundary that hits its pressure limit (discharge limit of a supply, suction limit of a draw) says so."""
import pytest

from networks import graph_node, graph_pipe, solve_graph
from routers.simulation import extract_telemetry

LMIN = 1.0 / 60000.0   # m³/s per L/min


def _run(set_lmin, diameter, length=200.0, level=1.0, **data):
    """Flow boundary -> pipe -> tank (a supply), or tank -> pipe -> flow boundary (flow_direction "draw")."""
    draws = data.get("flow_direction") == "draw"
    nodes = [graph_node("fb", "flow_boundary", {"set_flow_lmin": set_lmin, **data}),
             graph_node("t", "tank", {"level_m": level})]
    ends = ("t", "fb") if draws else ("fb", "t")
    edges = [graph_pipe("p", *ends, "port-0", "port-0", length=length, diameter=diameter)]
    network, _ = solve_graph({"nodes": nodes, "edges": edges, "globalSettings": {"fluid_type": "water"}})
    telemetry = extract_telemetry(network)
    return telemetry["nodes"]["fb"], telemetry["edges"]["p"]["inlets"][0]["flow_rate"]


@pytest.mark.parametrize("limit", [
    pytest.param(dict(max_discharge_pressure_bara=3.0), id="supply_discharge_limit"),
    pytest.param(dict(flow_direction="draw", min_suction_pressure_bara=0.5), id="draw_suction_limit"),
])
def test_flag_set_and_pressure_held_when_the_limit_binds(limit):
    """100 L/min through 15 mm x 200 m needs far more pressure than the limit allows: the port total pressure
    stays on the limit, the flow falls short of the set flow, and only the flag of that direction is set."""
    tel, pipe_flow = _run(100.0, 0.015, **limit)
    flag, other = (("pressure_cap_reached", "suction_limit_reached") if "max_discharge_pressure_bara" in limit
                   else ("suction_limit_reached", "pressure_cap_reached"))
    assert tel[flag] is True and tel[other] is False
    assert 0.0 < abs(pipe_flow) < 100.0 * LMIN
    port_total = tel["ports"][0]["total_pressure"]
    assert port_total == pytest.approx(limit.get("max_discharge_pressure_bara", limit.get("min_suction_pressure_bara")) * 1e5, abs=5.0)
    assert tel["max_discharge_pressure_bara"] == pytest.approx(limit.get("max_discharge_pressure_bara", 50.0))
    assert tel["min_suction_pressure_bara"] == pytest.approx(limit.get("min_suction_pressure_bara", 0.0))


@pytest.mark.parametrize("direction", ["supply", "draw"])
def test_flags_clear_in_normal_operation(direction):
    tel, pipe_flow = _run(100.0, 0.08, flow_direction=direction)
    assert tel["pressure_cap_reached"] is False and tel["suction_limit_reached"] is False
    assert pipe_flow == pytest.approx(100.0 * LMIN, rel=0.01)   # positive: a draw has its pipe drawn into it
    assert tel["ports"][0]["flow_rate"] == pytest.approx(100.0 * LMIN if direction == "draw" else -100.0 * LMIN, rel=0.01)


@pytest.mark.parametrize("flow_split", ["total_split", "per_port"])
def test_each_port_has_its_own_pressure_and_only_the_port_at_the_limit_sets_the_flag(flow_split):
    """Two ports into a wide short pipe and a narrow long one: every port is at its own pipe's pressure, not all at
    one pressure from the summed flow. With a 6 bar(a) limit only the narrow pipe's port is held at it, the
    flag is set and that pipe delivers less than its set flow; a 50 bar(a) limit sets nothing."""
    set_lmin = 200.0 if flow_split == "total_split" else 100.0   # 100 L/min per port either way
    result = {}
    for limit in (50.0, 6.0):
        nodes = [graph_node("fb", "flow_boundary", {"set_flow_lmin": set_lmin, "num_ports": 2, "flow_split": flow_split,
                                                    "max_discharge_pressure_bara": limit}),
                 graph_node("t0", "tank", {"level_m": 1.0}), graph_node("t1", "tank", {"level_m": 1.0})]
        edges = [graph_pipe("wide", "fb", "t0", "port-0", "port-0", length=10.0, diameter=0.1),
                 graph_pipe("narrow", "fb", "t1", "port-1", "port-0", length=100.0, diameter=0.025)]
        network, _ = solve_graph({"nodes": nodes, "edges": edges, "globalSettings": {"fluid_type": "water"}})
        tel = extract_telemetry(network)
        result[limit] = (tel["nodes"]["fb"], [tel["edges"][p]["inlets"][0]["flow_rate"] / LMIN for p in ("wide", "narrow")])
    free, (free_flows) = result[50.0]
    totals = [p["total_pressure"] for p in free["ports"]]
    assert totals[1] - totals[0] > 3.0e5                    # the narrow pipe needs far more pressure than the wide one
    assert totals[0] == pytest.approx(1.1e5, abs=0.05e5)   # the wide pipe's port sits just above its 1 m tank
    assert free_flows == pytest.approx([100.0, 100.0], rel=0.01) and free["pressure_cap_reached"] is False
    capped, capped_flows = result[6.0]
    totals = [p["total_pressure"] for p in capped["ports"]]
    assert totals[1] == pytest.approx(6.0e5, abs=5.0) and totals[0] == pytest.approx(1.1e5, abs=0.05e5)
    assert capped_flows[0] == pytest.approx(100.0, rel=0.01) and capped_flows[1] < 95.0
    assert capped["pressure_cap_reached"] is True
