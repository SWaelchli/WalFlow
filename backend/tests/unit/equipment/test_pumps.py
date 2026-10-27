"""Pump regressions: head-based curve and efficiency, reverse flow, pushed PD pump, shaft power KPI,
rated head required."""
import pytest


import io
import contextlib

import pytest

from physics_refs import solve
from simulation.schemas import HydraulicNetwork
from simulation.equipment.tank import Tank
from simulation.equipment.pipe import Pipe
from simulation.equipment.pressure_source import PressureSource
from simulation.equipment.centrifugal_pump import CentrifugalPump
from simulation.equipment.volumetric_pump import VolumetricPump
from simulation.fluid_utils import FluidProperties
from simulation.graph_parser import GraphParser, ModelInputError
from simulation.schemas import ReactFlowGraph
from routers.simulation import calculate_case_kpis, extract_telemetry

G = 9.81
Q_R = 100.0 / 60000.0


@pytest.mark.parametrize("fluid,temp_c", [("water", 20.0), ("iso_vg_46", 20.0), ("iso_vg_46", 80.0)])
def test_pump_pressure_rise_follows_density(fluid, temp_c):
    pump = CentrifugalPump("P", flow_rated=Q_R, head_rated=50.0, rise_to_shutoff_pct=20.0)
    rho = FluidProperties.get_density(fluid, temp_c + 273.15)
    assert pump.calculate_delta_p(Q_R, rho) == pytest.approx(rho * G * 50.0, rel=1e-9)
    assert pump.calculate_delta_p(0.0, rho) == pytest.approx(rho * G * 60.0, rel=1e-9)


def test_operating_point_in_oil_system():
    # Pump lifts VG46 between two open tanks 30 m apart through a short, wide pipe
    fluid, t_k = "iso_vg_46", 40 + 273.15
    nodes = {
        "t1": Tank("Low", fluid_level=1.0, temperature=t_k, fluid_type=fluid),
        "p": CentrifugalPump("P", flow_rated=Q_R, head_rated=50.0, rise_to_shutoff_pct=20.0),
        "t2": Tank("High", elevation=30.0, fluid_level=1.0, temperature=t_k, fluid_type=fluid),
    }
    edges = [
        {"source": "t1", "target": "p", "pipe": Pipe("s", 0.5, 0.1)},
        {"source": "p", "target": "t2", "pipe": Pipe("d", 0.5, 0.1)},
    ]
    assert solve(nodes, edges, fluid=fluid)["success"]
    pump = nodes["p"]
    q = pump.inlets[0].flow_rate
    rho = pump.inlets[0].density
    # Pipes are negligible: pump head equals the static lift of 30 m (in head, independent of ρ)
    head = (pump.outlets[0].pressure - pump.inlets[0].pressure) / (rho * G)
    assert head == pytest.approx(30.0, abs=0.3)
    # Independent curve: H = 60 − 10·(Q/Q_R)² → Q = Q_R·√3
    assert q == pytest.approx(Q_R * 3 ** 0.5, rel=0.01)


def test_running_pump_resists_reverse_flow():
    pump = CentrifugalPump("P", flow_rated=Q_R, head_rated=50.0, rise_to_shutoff_pct=20.0)
    rho = 998.0
    assert pump.calculate_delta_p(-Q_R, rho) == pytest.approx(rho * G * 70.0, rel=1e-9)
    # Derivative is continuous through zero flow
    assert pump.calculate_dp_derivative(0.0, rho) == 0.0
    assert pump.calculate_dp_derivative(-Q_R, rho) == pytest.approx(pump.calculate_dp_derivative(Q_R, rho))


def test_stopped_pump_loses_rated_head_at_rated_flow():
    pump = CentrifugalPump("P", flow_rated=Q_R, head_rated=50.0)
    pump.active = False
    for q in (Q_R, -Q_R):
        assert pump.calculate_delta_p(q, 1000.0) == pytest.approx(-1000.0 * G * 50.0 * (1 if q > 0 else -1), rel=1e-9)


def test_pushed_pd_pump_passes_its_displacement():
    # 10 bar(a) header feeds a 100 L/min PD pump discharging to an open tank
    nodes = {
        "src": PressureSource("Header", source_pressure=10.0e5),
        "p": VolumetricPump("PD", flow_rated=Q_R, motor_power=5000.0, efficiency=0.85),
        "t": Tank("Sink", fluid_level=1.0),
    }
    edges = [
        {"source": "src", "target": "p", "pipe": Pipe("s", 1.0, 0.05)},
        {"source": "p", "target": "t", "pipe": Pipe("d", 1.0, 0.05)},
    ]
    assert solve(nodes, edges)["success"]
    pump = nodes["p"]
    assert pump.inlets[0].flow_rate == pytest.approx(Q_R, rel=0.01)   # was 1918 L/min
    assert pump.outlets[0].pressure < pump.inlets[0].pressure          # pump brakes


def _pd_network(drive):
    nodes = {
        "t1": Tank("Source", fluid_level=1.0),
        "p": VolumetricPump("PD", flow_rated=Q_R, motor_power=5000.0, efficiency=0.85, drive_type=drive),
        "t2": Tank("Sink", elevation=400.0, fluid_level=1.0),  # ~39 bar lift
    }
    edges = [
        {"source": "t1", "target": "p", "pipe": Pipe("s", 1.0, 0.05)},
        {"source": "p", "target": "t2", "pipe": Pipe("d", 1.0, 0.05)},
    ]
    with contextlib.redirect_stdout(io.StringIO()):
        stats = solve(nodes, edges)
    return nodes, stats


def test_fixed_speed_keeps_flow_and_flags_overload():
    nodes, stats = _pd_network("fixed_speed")
    pump = nodes["p"]
    tel = extract_telemetry(HydraulicNetwork(nodes=nodes, edges=[]))["nodes"]["p"]
    assert pump.inlets[0].flow_rate == pytest.approx(Q_R, rel=0.01)
    assert tel["motor_overload"] and not tel["power_limited"]
    dp = pump.outlets[0].pressure - pump.inlets[0].pressure
    assert tel["shaft_power_kw"] == pytest.approx(pump.inlets[0].flow_rate * dp / 0.85 / 1000.0, rel=1e-6)
    assert tel["motor_load_pct"] > 100.0


def test_vfd_power_limit_reduces_flow_and_flags_it():
    nodes, stats = _pd_network("vfd_power_limit")
    pump = nodes["p"]
    tel = extract_telemetry(HydraulicNetwork(nodes=nodes, edges=[]))["nodes"]["p"]
    assert pump.inlets[0].flow_rate < 0.8 * Q_R
    assert tel["power_limited"] and not tel["motor_overload"]
    assert tel["shaft_power_kw"] == pytest.approx(5.0, rel=0.02)


def test_kpi_power_is_shaft_power_and_stopped_pump_counts_zero():
    nodes, stats = _pd_network("fixed_speed")
    net = HydraulicNetwork(nodes=nodes, edges=[])
    kpi = calculate_case_kpis(net, extract_telemetry(net), stats)
    assert kpi["total_pump_power_kw"] == pytest.approx(round(nodes["p"].shaft_power() / 1000.0, 2), abs=0.01)
    nodes["p"].active = False
    assert calculate_case_kpis(net, extract_telemetry(net), stats)["total_pump_power_kw"] == 0.0


def _pump_graph(pump_data, pump_type="centrifugal_pump"):
    return ReactFlowGraph(**{
        "nodes": [
            {"id": "t1", "type": "tank", "position": {"x": 0, "y": 0}, "data": {"label": "T1", "level_m": 1.0}},
            {"id": "p1", "type": pump_type, "position": {"x": 1, "y": 0}, "data": {"label": "P-101", "flow_rated_lmin": 100.0, **pump_data}},
            {"id": "t2", "type": "tank", "position": {"x": 2, "y": 0}, "data": {"label": "T2", "level_m": 1.0}},
        ],
        "edges": [
            {"id": "e1", "source": "t1", "target": "p1", "sourceHandle": "outlet-0", "targetHandle": "inlet-0", "data": {"length_m": 1.0, "diameter_m": 0.05}},
            {"id": "e2", "source": "p1", "target": "t2", "sourceHandle": "outlet-0", "targetHandle": "inlet-0", "data": {"length_m": 1.0, "diameter_m": 0.05}},
        ],
    })


def test_old_file_with_rated_pressure_only_is_blocked():
    with pytest.raises(ModelInputError, match="P-101.*rated head missing"):
        GraphParser.parse_graph(_pump_graph({"pressure_rated_bar": 5.0}))


def test_efficiency_is_read_from_the_file():
    net = GraphParser.parse_graph(_pump_graph({"head_rated_m": 50.0, "efficiency_pct": 62.0}))
    assert net.nodes["p1"].efficiency == pytest.approx(0.62)
    assert GraphParser.parse_graph(_pump_graph({"head_rated_m": 50.0})).nodes["p1"].efficiency == pytest.approx(0.75)


@pytest.mark.parametrize("pump_type,data", [
    ("centrifugal_pump", {"head_rated_m": 50.0}),
    ("volumetric_pump", {"motor_power_kw": 5.0}),
])
@pytest.mark.parametrize("eff_pct", [0.0, 0.5, 101.0])
def test_efficiency_outside_1_to_100_pct_is_rejected(pump_type, data, eff_pct):
    with pytest.raises(ModelInputError, match="P-101.*efficiency must be between 1 and 100"):
        GraphParser.parse_graph(_pump_graph({**data, "efficiency_pct": eff_pct}, pump_type))
