"""F1-13: telemetry and temperature transport use the port an edge is connected to, not port 0,
including for reverse flow through junctions."""
import pytest

pytestmark = pytest.mark.audit("F1-13")

import pytest

from physics_refs import solve
from simulation.equipment.mixer import Mixer
from simulation.equipment.pipe import Pipe
from simulation.equipment.splitter import Splitter
from simulation.equipment.tank import Tank
from simulation.equipment.three_way_tcv import ThreeWayTCV

D, L = 0.05, 5.0
K = 273.15


def test_tcv_pipe_on_inlet_1_reports_that_ports_pressure():
    hot = Tank("Hot", fluid_level=12.0, temperature=60 + K)
    cold = Tank("Cold", fluid_level=6.0, temperature=15 + K)
    sink = Tank("Sink", fluid_level=0.0, temperature=40 + K)
    tcv = ThreeWayTCV("TCV", max_cv=20.0, set_temperature=40 + K, hot_port_idx=0)
    pc = Pipe("pc", L, D)
    ph = Pipe("ph", L, D)
    edges = [
        {"source": "h", "target": "v", "target_port": "inlet-0", "pipe": ph},
        {"source": "c", "target": "v", "target_port": "inlet-1", "pipe": pc},
        {"source": "v", "target": "s", "pipe": Pipe("po", L, D)},
    ]
    assert solve({"h": hot, "c": cold, "v": tcv, "s": sink}, edges)["success"]
    # The two TCV inlets have different pressures (different paths); each pipe arrives at its own
    assert tcv.inlets[0].pressure != pytest.approx(tcv.inlets[1].pressure, rel=1e-4)
    assert pc.outlets[0].pressure == pytest.approx(tcv.inlets[1].pressure)
    assert ph.outlets[0].pressure == pytest.approx(tcv.inlets[0].pressure)


def test_reverse_flow_through_a_splitter_keeps_the_supplying_temperature():
    # High, hot tank on outlet-1 pushes flow backwards through the splitter into the low tank on the inlet
    hot = Tank("Hot", fluid_level=15.0, temperature=60 + K)
    low = Tank("Low", fluid_level=0.0, temperature=20 + K)
    other = Tank("Other", fluid_level=0.0, temperature=20 + K)
    spl = Splitter("Spl", num_outlets=2)
    p_in, p_hot, p_other = Pipe("pin", L, D), Pipe("phot", L, D), Pipe("pother", L, D)
    edges = [
        {"source": "low", "target": "s", "pipe": p_in},
        {"source": "s", "target": "hot", "source_port": "outlet-1", "pipe": p_hot},
        {"source": "s", "target": "other", "source_port": "outlet-0", "pipe": p_other},
    ]
    stats = solve({"low": low, "s": spl, "hot": hot, "other": other}, edges)
    assert stats["success"]
    assert p_hot.inlets[0].flow_rate < 0          # flows from the hot tank into the splitter
    assert p_in.inlets[0].flow_rate < 0           # and on towards the tank on the inlet side
    assert p_hot.outlets[0].temperature == pytest.approx(60 + K, abs=0.05)
    # Everything leaving the splitter towards the inlet side carries the hot tank's temperature
    assert spl.inlets[0].temperature == pytest.approx(60 + K, abs=0.5)
    assert p_in.outlets[0].temperature == pytest.approx(60 + K, abs=0.5)


def test_reverse_flow_through_a_mixer_reaches_both_inlet_pipes_at_the_outlet_temperature():
    hot = Tank("Hot", fluid_level=15.0, temperature=60 + K)
    a = Tank("A", fluid_level=0.0, temperature=20 + K)
    b = Tank("B", fluid_level=0.0, temperature=25 + K)
    mix = Mixer("Mix", num_inlets=2)
    pa, pb, po = Pipe("pa", L, D), Pipe("pb", L, D), Pipe("po", L, D)
    edges = [
        {"source": "a", "target": "m", "target_port": "inlet-0", "pipe": pa},
        {"source": "b", "target": "m", "target_port": "inlet-1", "pipe": pb},
        {"source": "m", "target": "hot", "pipe": po},
    ]
    stats = solve({"a": a, "b": b, "m": mix, "hot": hot}, edges)
    assert stats["success"]
    assert po.inlets[0].flow_rate < 0
    assert pa.outlets[0].temperature == pytest.approx(60 + K, abs=0.5)
    assert pb.outlets[0].temperature == pytest.approx(60 + K, abs=0.5)
