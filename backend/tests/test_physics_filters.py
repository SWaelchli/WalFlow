"""F1-41: filter – the user's rating point is reproduced, and colder oil gives a higher ΔP."""
import pytest

from physics_refs import solve
from simulation.equipment.tank import Tank
from simulation.equipment.pipe import Pipe
from simulation.equipment.flow_source import FlowSource
from simulation.equipment.filter import Filter

Q_REF_LMIN = 100.0


def _filter_dp(fluid, temp_c):
    t_k = temp_c + 273.15
    src = FlowSource("Feed", source_flow=Q_REF_LMIN / 60000.0, temperature=t_k)
    filt = Filter("Oil Filter", dp_clean_bar=1.0, flow_ref_lmin=Q_REF_LMIN)
    sink = Tank("Return Tank", fluid_level=1.0, temperature=t_k, fluid_type=fluid)
    edges = [
        {"source": "src", "target": "f1", "pipe": Pipe("p1", 1, 0.05)},
        {"source": "f1", "target": "t2", "pipe": Pipe("p2", 1, 0.05)},
    ]
    stats = solve({"src": src, "f1": filt, "t2": sink}, edges, fluid=fluid)
    assert stats["success"]
    assert filt.inlets[0].flow_rate == pytest.approx(Q_REF_LMIN / 60000.0, rel=1e-3)
    return filt.inlets[0].pressure - filt.outlets[0].pressure


def test_clean_filter_reproduces_rating_point_with_water():
    # dp_clean is defined at the reference flow with water (filter.py docstring)
    assert _filter_dp("water", 20.0) == pytest.approx(1.0e5, rel=0.05)


def test_cold_oil_gives_higher_filter_dp():
    dp_cold = _filter_dp("iso_vg_46", 20.0)
    dp_warm = _filter_dp("iso_vg_46", 60.0)
    assert dp_cold > dp_warm
