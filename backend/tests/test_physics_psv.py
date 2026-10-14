import sys
import os
import pytest
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from physics_refs import water_head
from simulation.equipment.tank import Tank
from simulation.equipment.centrifugal_pump import CentrifugalPump
from simulation.equipment.pressure_safety_valve import PressureSafetyValve
from simulation.equipment.pipe import Pipe
from simulation.schemas import HydraulicNetwork
from simulation.solver import NetworkSolver

def test_psv_pop_action_cracking():
    tank_in = Tank(name="Supply Tank", elevation=0.0, fluid_level=2.0)
    pump = CentrifugalPump(name="Feed Pump", flow_rated=0.002, head_rated=water_head(500000.0)) # 5 bar
    psv = PressureSafetyValve(name="PSV-101", set_pressure_barg=2.0, cv=10.0, action_mode="pop_action")
    tank_out = Tank(name="Drain Tank", elevation=0.0, fluid_level=0.0)

    pipe1 = Pipe(name="p1", length=5.0, diameter=0.05)
    pipe2 = Pipe(name="p2", length=5.0, diameter=0.05)
    pipe3 = Pipe(name="p3", length=5.0, diameter=0.05)

    nodes = {"t1": tank_in, "pump": pump, "psv": psv, "t2": tank_out}
    edges = [
        {"id": "e1", "source": "t1", "target": "pump", "pipe": pipe1},
        {"id": "e2", "source": "pump", "target": "psv", "pipe": pipe2},
        {"id": "e3", "source": "psv", "target": "t2", "pipe": pipe3}
    ]

    net = HydraulicNetwork(nodes=nodes, edges=edges)
    solver = NetworkSolver(net)
    stats = solver.solve()

    assert stats["success"] is True
    # The pump holds the inlet above 110 % of set (2.2 barg) even at full lift: overcapacity (F1-38)
    p_in, p_out = psv.inlets[0].pressure, psv.outlets[0].pressure
    assert psv.lift_state == "open" and (p_in - 101325.0) / 1e5 > 2.2
    assert psv.status == "overcapacity"
    assert psv.inlets[0].flow_rate > 0.0001
    # Same Cv at the rated point: Q/Q_rated = √(ΔP / ΔP_rated), ΔP_rated = 1.1·set (gauge) + P_atm − P_out
    expected = 100.0 * ((p_in - p_out) / (2.2e5 + 101325.0 - p_out)) ** 0.5
    assert abs(psv.capacity_utilization_pct - expected) < 0.1

def test_psv_unmitigated_higher_pressure():
    tank_in = Tank(name="Supply Tank", elevation=0.0, fluid_level=2.0)
    pump = CentrifugalPump(name="Feed Pump", flow_rated=0.002, head_rated=water_head(600000.0)) # 6 bar
    psv = PressureSafetyValve(name="PSV-101", set_pressure_barg=3.0, cv=15.0, action_mode="pop_action")
    tank_out = Tank(name="Drain Tank", elevation=0.0, fluid_level=0.0)

    pipe1 = Pipe(name="p1", length=5.0, diameter=0.05)
    pipe2 = Pipe(name="p2", length=5.0, diameter=0.05)
    pipe3 = Pipe(name="p3", length=5.0, diameter=0.05)

    nodes = {"t1": tank_in, "pump": pump, "psv": psv, "t2": tank_out}
    edges = [
        {"id": "e1", "source": "t1", "target": "pump", "pipe": pipe1},
        {"id": "e2", "source": "pump", "target": "psv", "pipe": pipe2},
        {"id": "e3", "source": "psv", "target": "t2", "pipe": pipe3}
    ]

    net = HydraulicNetwork(nodes=nodes, edges=edges)
    solver = NetworkSolver(net)

    # 1. Unmitigated pass (PSV forced closed)
    psv.forced_state = "forced_closed"
    solver.solve()
    p_unmitigated = psv.inlets[0].pressure

    # 2. Mitigated pass (PSV auto)
    psv.forced_state = "auto"
    solver.solve()
    p_mitigated = psv.inlets[0].pressure

    assert p_unmitigated > p_mitigated

def test_psv_modulating_and_rupture_disc():
    tank_in = Tank(name="Supply Tank", elevation=0.0, fluid_level=2.0)
    pump = CentrifugalPump(name="Feed Pump", flow_rated=0.002, head_rated=water_head(400000.0)) # 4 bar
    psv = PressureSafetyValve(name="PSV-102", set_pressure_barg=2.5, cv=10.0, action_mode="modulating")
    tank_out = Tank(name="Drain Tank", elevation=0.0, fluid_level=0.0)

    pipe1 = Pipe(name="p1", length=5.0, diameter=0.05)
    pipe2 = Pipe(name="p2", length=5.0, diameter=0.05)
    pipe3 = Pipe(name="p3", length=5.0, diameter=0.05)

    nodes = {"t1": tank_in, "pump": pump, "psv": psv, "t2": tank_out}
    edges = [
        {"id": "e1", "source": "t1", "target": "pump", "pipe": pipe1},
        {"id": "e2", "source": "pump", "target": "psv", "pipe": pipe2},
        {"id": "e3", "source": "psv", "target": "t2", "pipe": pipe3}
    ]

    net = HydraulicNetwork(nodes=nodes, edges=edges)
    solver = NetworkSolver(net)

    # Modulating test: lift linear from set (2.5 barg) to full lift at +10 % (2.75 barg)
    stats = solver.solve()
    assert stats["success"] is True
    assert psv.status == "cracked"
    p_in_g = (psv.inlets[0].pressure - 101325.0) / 1e5
    assert 2.5 < p_in_g < 2.75
    assert abs(psv.lift_pct - 100.0 * (p_in_g - 2.5) / 0.25) < 0.01

    # Rupture disc test
    psv.action_mode = "rupture_disc"
    psv.reset_run_state()
    stats = solver.solve()
    assert stats["success"] is True
    assert psv.is_burst is True
    assert psv.status in ["cracked", "overcapacity"] and psv.lift_pct == 100.0
