"""NPSHa is reported at every pump, compared with NPSHr + margin; throttling devices are flagged below Pv."""
import pytest


import math

import pytest

from physics_refs import solve, water_head
from routers.simulation import extract_telemetry
from simulation.equipment.base_node import total_of
from simulation.equipment.centrifugal_pump import CentrifugalPump
from simulation.equipment.linear_control_valve import LinearControlValve
from simulation.equipment.pipe import Pipe
from simulation.equipment.tank import Tank
from simulation.fluid_utils import FluidProperties as FP
from simulation.graph_parser import GraphParser, ModelInputError
from simulation.schemas import HydraulicNetwork, ReactFlowGraph


def _pump_circuit(level, **pump_kw):
    pump = CentrifugalPump("P", flow_rated=100.0 / 60000.0, head_rated=water_head(3e5), **pump_kw)
    nodes = {"t1": Tank("Supply", fluid_level=level), "pump": pump, "t2": Tank("Sink", fluid_level=1.0)}
    edges = [{"source": "t1", "target": "pump", "pipe": Pipe("s", 3.0, 0.05)},
             {"source": "pump", "target": "t2", "pipe": Pipe("d", 5.0, 0.05)}]
    return pump, solve(nodes, edges)


def test_npsha_matches_hand_calculation():
    pump, stats = _pump_circuit(level=3.0)
    assert stats["success"]
    inlet = pump.inlets[0]
    pv = FP.get_vapor_pressure("water", inlet.temperature)
    # The suction head counts the velocity head: total pressure, the static port pressure plus rho v² / 2 of the pipe
    v = inlet.flow_rate / (math.pi * 0.05 ** 2 / 4.0)
    assert inlet.pressure + 0.5 * inlet.density * v * v == pytest.approx(total_of(inlet), rel=1e-6)
    assert pump.npsha_m == pytest.approx((total_of(inlet) - pv) / (inlet.density * 9.81), rel=1e-6)
    assert pump.npsha_m > (inlet.pressure - pv) / (inlet.density * 9.81)
    assert 9.0 < pump.npsha_m < 13.0       # ~ 10 m atmospheric + 3 m static - friction - Pv


def test_warns_when_npsha_below_npshr_plus_margin():
    pump, _ = _pump_circuit(level=3.0, npshr_m=20.0)
    assert pump.cavitation_warning is True
    pump, _ = _pump_circuit(level=3.0, npshr_m=3.0, npsh_margin_m=0.5)
    assert pump.cavitation_warning is False


def test_margin_is_editable():
    pump, _ = _pump_circuit(level=3.0, npshr_m=3.0, npsh_margin_m=0.5)
    na = pump.npsha_m
    pump, _ = _pump_circuit(level=3.0, npshr_m=3.0, npsh_margin_m=na)   # margin pushes NPSHr + margin above NPSHa
    assert pump.cavitation_warning is True


def test_telemetry_reports_npsh():
    pump, _ = _pump_circuit(level=3.0, npshr_m=3.0)
    tel = extract_telemetry(HydraulicNetwork(nodes={pump.id: pump}, edges=[]))
    node = tel["nodes"][pump.id]
    assert node["npsha_m"] == pytest.approx(pump.npsha_m)
    assert node["npshr_m"] == 3.0


def test_negative_npshr_is_an_input_error():
    graph = ReactFlowGraph(nodes=[{"id": "p", "type": "centrifugal_pump", "position": {"x": 0, "y": 0},
                                   "data": {"label": "P1", "head": 30, "npshr_m": -1}}], edges=[])
    with pytest.raises(ModelInputError):
        GraphParser.parse_graph(graph)


def _valve_circuit(temp_c):
    t = temp_c + 273.15
    valve = LinearControlValve("V", max_cv=5.0, opening_pct=50.0)
    nodes = {"t1": Tank("Supply", fluid_level=5.0, temperature=t), "v": valve,
             "t2": Tank("Sink", fluid_level=0.0, temperature=t)}
    edges = [{"source": "t1", "target": "v", "pipe": Pipe("a", 3.0, 0.05)},
             {"source": "v", "target": "t2", "pipe": Pipe("b", 3.0, 0.05)}]
    solve(nodes, edges)
    network = HydraulicNetwork(nodes=nodes, edges=[])
    network.global_settings = valve.global_settings
    return extract_telemetry(network)["nodes"]["v"]


@pytest.mark.parametrize("temp_c, flagged", [
    pytest.param(120.0, True, id="valve-outlet-below-vapor-pressure"),
    pytest.param(20.0, False, id="cold-valve"),
])
def test_valve_flashing_flag(temp_c, flagged):
    assert _valve_circuit(temp_c)["flashing_warning"] is flagged
