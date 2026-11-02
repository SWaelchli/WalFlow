"""Telemetry equipment restriction and performance curves (Orifice, Filter, Valve, Pump).

Ensures telemetry provides full curves that include the exact solved operating point,
scaling to local flow conditions, using upstream fluid properties in both flow directions,
and matching the total (stagnation) pressure difference across unequal pipe diameters.
"""
import math
import pytest

from networks import neutral_graph
from routers.simulation import extract_telemetry
from simulation.graph_parser import GraphParser
from simulation.schemas import GlobalSettings
from simulation.solver import NetworkSolver


def test_orifice_curves_include_operating_point_and_match_total_pressure():
    """Low-beta viscous oil case: orifice curves include q_op and match total dP."""
    nodes = [
        {"id": "t1", "type": "tank", "position": {"x": 0, "y": 0}, "data": {"label": "T1", "level_m": 10.0, "temperature_k": 293.15}},
        {"id": "ori", "type": "orifice", "position": {"x": 1, "y": 0}, "data": {"label": "ORI", "orifice_diameter_m": 0.003}},
        {"id": "t2", "type": "tank", "position": {"x": 2, "y": 0}, "data": {"label": "T2", "level_m": 1.0, "temperature_k": 293.15}},
    ]
    edges = [
        {"id": "e1", "source": "t1", "target": "ori", "sourceHandle": "outlet-0", "targetHandle": "port-0", "data": {"diameter_m": 0.0315, "length_m": 2.0}},
        {"id": "e2", "source": "ori", "target": "t2", "sourceHandle": "port-1", "targetHandle": "inlet-0", "data": {"diameter_m": 0.05248, "length_m": 2.0}},
    ]
    graph = neutral_graph(nodes=nodes, edges=edges, global_settings=GlobalSettings(fluid_type="iso_vg_46"))
    net = GraphParser.parse_graph(graph)
    stats = NetworkSolver(net).solve()
    assert stats["success"], stats.get("error")

    tel = extract_telemetry(net)
    ori_tel = tel["nodes"]["ori"]
    assert "orifice_curves" in ori_tel, "telemetry must include orifice_curves"
    curves = ori_tel["orifice_curves"]

    flows = curves["flow_m3s"]
    dps = curves["dp_pa"]
    assert flows[0] == 0.0
    assert all(flows[i] < flows[i + 1] for i in range(len(flows) - 1))

    ports = ori_tel["ports"]
    up_port = ports[1] if ports[1]["flow_rate"] > 0 else ports[0]
    down_port = ports[0] if ports[1]["flow_rate"] > 0 else ports[1]
    q_op = abs(up_port["flow_rate"])
    assert q_op > 0.0

    # Unequal pipe bores mean static dP != total dP
    dp_static = abs(up_port["pressure"] - down_port["pressure"])
    dp_total = up_port["total_pressure"] - down_port["total_pressure"]
    assert abs(dp_static - dp_total) > 0.1, "Test setup must have unequal static vs total dP"

    assert q_op in flows, "flow_m3s must contain exact operating point q_op"
    idx = flows.index(q_op)
    assert math.isclose(dps[idx], dp_total, rel_tol=1e-4, abs_tol=1.0)


def test_filter_curves_include_operating_point_and_laminar_scaling():
    """Viscous oil case with 50% clogging: curves include q_op, match total dP, and scale laminarly."""
    nodes = [
        {"id": "t1", "type": "tank", "position": {"x": 0, "y": 0}, "data": {"label": "T1", "level_m": 10.0, "temperature_k": 293.15}},
        {"id": "flt", "type": "filter", "position": {"x": 1, "y": 0}, "data": {"label": "FLT", "dp_clean_bar": 0.2, "dp_terminal_bar": 1.0, "flow_ref_lmin": 100.0, "clogging_pct": 50.0}},
        {"id": "t2", "type": "tank", "position": {"x": 2, "y": 0}, "data": {"label": "T2", "level_m": 1.0, "temperature_k": 293.15}},
    ]
    edges = [
        {"id": "e1", "source": "t1", "target": "flt", "sourceHandle": "outlet-0", "targetHandle": "port-0", "data": {"diameter_m": 0.0315, "length_m": 2.0}},
        {"id": "e2", "source": "flt", "target": "t2", "sourceHandle": "port-1", "targetHandle": "inlet-0", "data": {"diameter_m": 0.05248, "length_m": 2.0}},
    ]
    graph = neutral_graph(nodes=nodes, edges=edges, global_settings=GlobalSettings(fluid_type="iso_vg_46"))
    net = GraphParser.parse_graph(graph)
    stats = NetworkSolver(net).solve()
    assert stats["success"], stats.get("error")

    tel = extract_telemetry(net)
    flt_tel = tel["nodes"]["flt"]
    assert "filter_curves" in flt_tel, "telemetry must include filter_curves"
    curves = flt_tel["filter_curves"]

    flows = curves["flow_m3s"]
    dp_clean = curves["dp_clean_pa"]
    dp_curr = curves["dp_current_pa"]
    dp_term = curves["dp_terminal_pa"]

    ports = flt_tel["ports"]
    up_port = ports[1] if ports[1]["flow_rate"] > 0 else ports[0]
    down_port = ports[0] if ports[1]["flow_rate"] > 0 else ports[1]
    q_op = abs(up_port["flow_rate"])
    assert q_op in flows, "flow_m3s must contain exact operating point q_op"

    idx = flows.index(q_op)
    dp_total = up_port["total_pressure"] - down_port["total_pressure"]
    assert math.isclose(dp_curr[idx], dp_total, rel_tol=1e-4, abs_tol=1.0)

    # Clean < current < terminal for all q > 0
    assert all(dp_clean[i] < dp_curr[i] < dp_term[i] for i in range(1, len(flows)))

    # Laminar non-parabolic scaling: dp(q_max) / dp(q_max/2) < 3.9
    q_max = flows[-1]
    q_half = q_max / 2.0
    if q_half in flows:
        dp_half = dp_curr[flows.index(q_half)]
    else:
        j = max(k for k, f in enumerate(flows) if f <= q_half)
        dp_half = dp_curr[j] + (dp_curr[j + 1] - dp_curr[j]) * (q_half - flows[j]) / (flows[j + 1] - flows[j])
    assert dp_curr[-1] / dp_half < 3.9


VALVE_TYPES = ["linear_control_valve", "linear_regulator", "remote_control_valve"]


@pytest.mark.parametrize("valve_type", VALVE_TYPES)
def test_valve_curves_small_forward_flow(valve_type):
    """Small forward flow (< 5 L/min): flow_m3s scales to 2 * q_op and includes q_op."""
    nodes = [
        {"id": "t1", "type": "tank", "position": {"x": 0, "y": 0}, "data": {"label": "T1", "level_m": 3.0}},
        {"id": "v", "type": valve_type, "position": {"x": 1, "y": 0}, "data": {"label": "V", "max_cv": 2.0, "opening_pct": 50.0, "set_pressure_pa": 120000.0}},
        {"id": "t2", "type": "tank", "position": {"x": 2, "y": 0}, "data": {"label": "T2", "level_m": 1.0}},
    ]
    edges = [
        {"id": "e1", "source": "t1", "target": "v", "sourceHandle": "outlet-0", "targetHandle": "inlet-0", "data": {"diameter_m": 0.05, "length_m": 5.0}},
        {"id": "e2", "source": "v", "target": "t2", "sourceHandle": "outlet-0", "targetHandle": "inlet-0", "data": {"diameter_m": 0.01, "length_m": 20.0}},
    ]
    graph = neutral_graph(nodes=nodes, edges=edges)
    net = GraphParser.parse_graph(graph)
    stats = NetworkSolver(net).solve()
    assert stats["success"], stats.get("error")

    tel = extract_telemetry(net)
    v_tel = tel["nodes"]["v"]
    assert "valve_curves" in v_tel
    curves = v_tel["valve_curves"]

    inlet = v_tel["inlets"][0]
    q_op = abs(inlet["flow_rate"])
    assert q_op < 5.0 / 60000.0, f"Flow {q_op * 60000} L/min must be under 5 L/min"

    flows = curves["flow_m3s"]
    assert math.isclose(flows[-1], 2.0 * q_op, rel_tol=1e-6)
    assert q_op in flows


@pytest.mark.parametrize("valve_type", VALVE_TYPES)
def test_valve_curves_reverse_flow_uses_upstream_fluid(valve_type):
    """Reverse flow: flow_m3s includes q_op and dp_current_pa matches total dP using outlet fluid."""
    nodes = [
        {"id": "t1", "type": "tank", "position": {"x": 0, "y": 0}, "data": {"label": "T1", "level_m": 1.0, "temperature_k": 293.15}},
        {"id": "v", "type": valve_type, "position": {"x": 1, "y": 0}, "data": {"label": "V", "max_cv": 2.0, "opening_pct": 50.0, "set_pressure_pa": 120000.0}},
        {"id": "t2", "type": "tank", "position": {"x": 2, "y": 0}, "data": {"label": "T2", "level_m": 10.0, "temperature_k": 330.0}},
    ]
    edges = [
        {"id": "e1", "source": "t1", "target": "v", "sourceHandle": "outlet-0", "targetHandle": "inlet-0", "data": {"diameter_m": 0.05, "length_m": 5.0}},
        {"id": "e2", "source": "v", "target": "t2", "sourceHandle": "outlet-0", "targetHandle": "inlet-0", "data": {"diameter_m": 0.05, "length_m": 5.0}},
    ]
    graph = neutral_graph(nodes=nodes, edges=edges, global_settings=GlobalSettings(fluid_type="iso_vg_46"))
    net = GraphParser.parse_graph(graph)
    stats = NetworkSolver(net).solve()
    assert stats["success"], stats.get("error")

    tel = extract_telemetry(net)
    v_tel = tel["nodes"]["v"]
    inlet = v_tel["inlets"][0]
    outlet = v_tel["outlets"][0]
    assert outlet["total_pressure"] > inlet["total_pressure"]
    assert outlet["temperature"] != inlet["temperature"]

    q_op = abs(inlet["flow_rate"])
    curves = v_tel["valve_curves"]
    flows = curves["flow_m3s"]
    assert q_op in flows

    idx = flows.index(q_op)
    dp_total = abs(outlet["total_pressure"] - inlet["total_pressure"])
    assert math.isclose(curves["dp_current_pa"][idx], dp_total, rel_tol=1e-4, abs_tol=1.0)


def _build_centrifugal_running():
    nodes = [
        {"id": "t1", "type": "tank", "position": {"x": 0, "y": 0}, "data": {"label": "T1", "level_m": 2.0}},
        {"id": "p", "type": "centrifugal_pump", "position": {"x": 1, "y": 0}, "data": {"label": "P", "flow_rated_lmin": 100.0, "head_rated_m": 30.0, "active": True}},
        {"id": "t2", "type": "tank", "position": {"x": 2, "y": 0}, "data": {"label": "T2", "level_m": 10.0}},
    ]
    edges = [
        {"id": "e1", "source": "t1", "target": "p", "sourceHandle": "outlet-0", "targetHandle": "inlet-0", "data": {"diameter_m": 0.1, "length_m": 5.0}},
        {"id": "e2", "source": "p", "target": "t2", "sourceHandle": "outlet-0", "targetHandle": "inlet-0", "data": {"diameter_m": 0.04, "length_m": 5.0}},
    ]
    return neutral_graph(nodes=nodes, edges=edges)


def _build_centrifugal_stopped():
    nodes = [
        {"id": "t1", "type": "tank", "position": {"x": 0, "y": 0}, "data": {"label": "T1", "level_m": 20.0}},
        {"id": "p", "type": "centrifugal_pump", "position": {"x": 1, "y": 0}, "data": {"label": "P", "flow_rated_lmin": 100.0, "head_rated_m": 30.0, "active": False}},
        {"id": "t2", "type": "tank", "position": {"x": 2, "y": 0}, "data": {"label": "T2", "level_m": 1.0}},
    ]
    edges = [
        {"id": "e1", "source": "t1", "target": "p", "sourceHandle": "outlet-0", "targetHandle": "inlet-0", "data": {"diameter_m": 0.1, "length_m": 5.0}},
        {"id": "e2", "source": "p", "target": "t2", "sourceHandle": "outlet-0", "targetHandle": "inlet-0", "data": {"diameter_m": 0.04, "length_m": 5.0}},
    ]
    return neutral_graph(nodes=nodes, edges=edges)


def _build_volumetric_capped():
    nodes = [
        {"id": "t1", "type": "tank", "position": {"x": 0, "y": 0}, "data": {"label": "T1", "level_m": 2.0}},
        {"id": "p", "type": "volumetric_pump", "position": {"x": 1, "y": 0}, "data": {"label": "P", "flow_rated_lmin": 100.0, "max_discharge_pressure_bara": 5.0}},
        {"id": "t2", "type": "tank", "position": {"x": 2, "y": 0}, "data": {"label": "T2", "level_m": 60.0}},
    ]
    edges = [
        {"id": "e1", "source": "t1", "target": "p", "sourceHandle": "outlet-0", "targetHandle": "inlet-0", "data": {"diameter_m": 0.05, "length_m": 5.0}},
        {"id": "e2", "source": "p", "target": "t2", "sourceHandle": "outlet-0", "targetHandle": "inlet-0", "data": {"diameter_m": 0.05, "length_m": 50.0}},
    ]
    return neutral_graph(nodes=nodes, edges=edges)


@pytest.mark.parametrize("case_name, build_fn, expect_negative, expect_cap", [
    ("running_unequal_pipes", _build_centrifugal_running, False, False),
    ("stopped_pump", _build_centrifugal_stopped, True, False),
    ("pressure_capped_volumetric", _build_volumetric_capped, False, True),
])
def test_pump_curves_contain_operating_point_and_match_total_pressure_rise(case_name, build_fn, expect_negative, expect_cap):
    graph = build_fn()
    net = GraphParser.parse_graph(graph)
    stats = NetworkSolver(net).solve()
    assert stats["success"], stats.get("error")

    tel = extract_telemetry(net)
    p_tel = tel["nodes"]["p"]
    if expect_cap:
        assert p_tel.get("pressure_cap_reached") is True

    assert "pump_curves" in p_tel, "telemetry must include pump_curves"
    curves = p_tel["pump_curves"]
    flows = curves["flow_m3s"]
    dps = curves["dp_pa"]

    inlet = p_tel["inlets"][0]
    outlet = p_tel["outlets"][0]
    q_op = abs(inlet["flow_rate"])
    assert q_op in flows, "flow_m3s must contain exact operating point q_op"

    idx = flows.index(q_op)
    dp_total = outlet["total_pressure"] - inlet["total_pressure"]
    assert math.isclose(dps[idx], dp_total, rel_tol=1e-4, abs_tol=1.0)
    if expect_negative:
        assert dps[idx] < 0.0
