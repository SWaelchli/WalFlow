"""The heat exchanger cools the stream that enters it, in either flow direction."""
import pytest


from physics_refs import solve
from simulation.equipment.heat_exchanger import HeatExchanger
from simulation.equipment.pipe import Pipe
from simulation.equipment.tank import Tank


def _run(reverse):
    hx = HeatExchanger("hx", rated_cooling_kw=300.0, rated_flow_lmin=500.0, design_inlet_temp_c=50.0, medium_temp_c=10.0)
    hi = Tank("hi", fluid_level=10.0, temperature=323.15)
    lo = Tank("lo", fluid_level=0.0, temperature=323.15)
    if reverse:
        edges = [{"source": "lo", "target": "x", "pipe": Pipe("a", 1.0, 0.1)},
                 {"source": "x", "target": "hi", "pipe": Pipe("b", 1.0, 0.1)}]
    else:
        edges = [{"source": "hi", "target": "x", "pipe": Pipe("a", 1.0, 0.1)},
                 {"source": "x", "target": "lo", "pipe": Pipe("b", 1.0, 0.1)}]
    solve({"hi": hi, "lo": lo, "x": hx}, edges)
    return hx


def test_reverse_flow_gives_the_forward_duty_on_the_mirrored_ports():
    fwd = _run(reverse=False)
    rev = _run(reverse=True)
    assert fwd.inlets[0].flow_rate > 0 and rev.inlets[0].flow_rate < 0
    assert rev.actual_duty_kw == pytest.approx(fwd.actual_duty_kw, rel=0.01)
    # Forward: enters the inlet at 50 °C, leaves the outlet cooled; reverse: the other way round
    assert fwd.inlets[0].temperature == pytest.approx(323.15, abs=0.05)
    assert rev.outlets[0].temperature == pytest.approx(323.15, abs=0.05)
    assert rev.inlets[0].temperature == pytest.approx(fwd.outlets[0].temperature, abs=0.1)
    assert rev.inlets[0].temperature < 323.15 - 1.0
