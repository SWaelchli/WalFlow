"""F1-05: the solver uses the real (oil) viscosity for TCV path losses, so the solved
pressures agree with the TCV's own viscous path ΔP and with Darcy–Weisbach in the feed pipes."""
import pytest

from physics_refs import pipe_dp, solve
from simulation.equipment.tank import Tank
from simulation.equipment.pipe import Pipe
from simulation.equipment.three_way_tcv import ThreeWayTCV

FLUID = "iso_vg_46"
D, L = 0.025, 5.0


def test_f1_05_tcv_paths_consistent_with_viscous_dp():
    hot = Tank("Hot", fluid_level=12.0, temperature=60 + 273.15, fluid_type=FLUID)
    cold = Tank("Cold", fluid_level=12.0, temperature=15 + 273.15, fluid_type=FLUID)
    sink = Tank("Sink", fluid_level=0.0, temperature=40 + 273.15, fluid_type=FLUID)
    tcv = ThreeWayTCV("TCV", max_cv=0.3, set_temperature=40 + 273.15, hot_port_idx=0)
    edges = [
        {"source": "h", "target": "v", "target_port": "inlet-0", "pipe": Pipe("ph", L, D)},
        {"source": "c", "target": "v", "target_port": "inlet-1", "pipe": Pipe("pc", L, D)},
        {"source": "v", "target": "s", "pipe": Pipe("po", L, D)},
    ]
    stats = solve({"h": hot, "c": cold, "v": tcv, "s": sink}, edges, fluid=FLUID)
    assert stats["success"]

    for idx, (edge, tank) in enumerate(((edges[0], hot), (edges[1], cold))):
        port = tcv.inlets[idx]
        assert port.flow_rate > 0
        # Path ΔP evaluated with the port's real viscosity (what telemetry reports)
        dp_path = tcv.calculate_path_dp(port.flow_rate, port.density, idx, port.viscosity)
        assert port.pressure - tcv.outlets[0].pressure == pytest.approx(dp_path, rel=1e-3)
        # Feed pipe: tank head minus independent Darcy loss must arrive at the TCV inlet
        pipe = edge["pipe"]
        p_tank = tank.outlets[0].pressure
        dp_feed = pipe_dp(port.flow_rate, L, D, pipe.roughness, pipe.inlets[0].density, pipe.inlets[0].viscosity)
        assert port.pressure == pytest.approx(p_tank - dp_feed, abs=max(200.0, 0.01 * dp_path))
