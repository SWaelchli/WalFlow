"""F1-13: telemetry and temperature transport use the port an edge is connected to, not port 0,
including for reverse flow through junctions."""
import pytest

pytestmark = pytest.mark.audit("F1-13")

import pytest

from physics_refs import solve
from simulation.equipment.pipe import Pipe
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






