"""F1-07: physically impossible states are reported, not passed off as a clean solution."""
import pytest

from physics_refs import solve
from simulation.equipment.pipe import Pipe
from simulation.equipment.tank import Tank
from simulation.equipment.volumetric_pump import VolumetricPump


def _starving_pump(fluid):
    nodes = {
        "t1": Tank("Supply", fluid_level=1.0, fluid_type=fluid),
        "pump": VolumetricPump("PD Pump", flow_rated=100.0 / 60000.0, motor_power=30000.0, efficiency=0.85),
        "t2": Tank("Sink", fluid_level=1.0, fluid_type=fluid),
    }
    edges = [
        {"source": "t1", "target": "pump", "pipe": Pipe("suction", 30.0, 0.015)},   # 30 m of 15 mm: starved
        {"source": "pump", "target": "t2", "pipe": Pipe("discharge", 5.0, 0.04)},
    ]
    return nodes, solve(nodes, edges, fluid=fluid)


@pytest.mark.parametrize("fluid", ["water", "iso_vg_46"])
def test_starved_pd_pump_suction_below_vacuum_is_flagged(fluid):
    # Audit: success with -23.1 bar(a) (water) and -43.8 bar(a) (VG46) on the suction side
    nodes, stats = _starving_pump(fluid)
    assert stats["success"]
    validity = stats["physical_validity"]
    assert validity["valid"] is False
    pump_issues = [i for i in validity["issues"] if i["node"] == "PD Pump"]
    assert pump_issues and pump_issues[0]["reason"] == "negative_absolute_pressure"
    assert pump_issues[0]["pressure_bara"] == pytest.approx(nodes["pump"].inlets[0].pressure / 1e5)
    assert pump_issues[0]["pressure_bara"] < 0.0


def test_ordinary_circuit_is_valid():
    nodes = {
        "t1": Tank("Supply", fluid_level=5.0),
        "t2": Tank("Sink", fluid_level=0.0),
    }
    stats = solve(nodes, [{"source": "t1", "target": "t2", "pipe": Pipe("p", 10.0, 0.05)}])
    assert stats["physical_validity"] == {"valid": True, "issues": []}


def test_hot_water_below_vapour_pressure_is_flagged():
    # 120 °C water in an open tank at atmospheric pressure is already above its boiling point
    nodes = {
        "t1": Tank("Hot Supply", fluid_level=2.0, temperature=120 + 273.15),
        "t2": Tank("Sink", fluid_level=0.0, temperature=120 + 273.15),
    }
    stats = solve(nodes, [{"source": "t1", "target": "t2", "pipe": Pipe("p", 10.0, 0.05)}])
    reasons = {i["reason"] for i in stats["physical_validity"]["issues"]}
    assert "below_vapor_pressure" in reasons
