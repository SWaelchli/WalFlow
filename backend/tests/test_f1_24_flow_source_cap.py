"""F1-24: a flow source that hits its discharge pressure limit says so."""
import pytest

from physics_refs import solve
from routers.simulation import extract_telemetry
from simulation.equipment.flow_source import FlowSource
from simulation.equipment.pipe import Pipe
from simulation.equipment.tank import Tank
from simulation.schemas import HydraulicNetwork


def _run(max_bara, diameter):
    src = FlowSource("Src", source_flow=100.0 / 60000.0, max_discharge_pressure=max_bara * 1e5)
    nodes = {"src": src, "t": Tank("Sink", fluid_level=1.0)}
    edges = [{"source": "src", "target": "t", "pipe": Pipe("p", 200.0, diameter)}]
    solve(nodes, edges)
    net = HydraulicNetwork(nodes=nodes, edges=[])
    return extract_telemetry(net)["nodes"]["src"], src


def test_f1_24_cap_flag_set_when_limit_binds():
    tel, src = _run(max_bara=3.0, diameter=0.015)       # 100 L/min through 15 mm x 200 m needs far more than 3 bar
    assert tel["pressure_cap_reached"] is True
    assert src.outlets[0].flow_rate < 100.0 / 60000.0
    assert tel["max_discharge_pressure_bara"] == pytest.approx(3.0)


def test_f1_24_cap_flag_clear_in_normal_operation():
    tel, src = _run(max_bara=50.0, diameter=0.08)
    assert tel["pressure_cap_reached"] is False
    assert src.outlets[0].flow_rate == pytest.approx(100.0 / 60000.0, rel=0.01)
