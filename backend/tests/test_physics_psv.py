import pytest
from simulation.equipment.tank import Tank
from simulation.equipment.centrifugal_pump import CentrifugalPump
from simulation.equipment.pressure_safety_valve import PressureSafetyValve
from simulation.equipment.pipe import Pipe
from simulation.schemas import HydraulicNetwork
from simulation.solver import NetworkSolver

def test_psv_pop_action_cracking():
    tank_in = Tank(name="Supply Tank", elevation=0.0, fluid_level=2.0)
    pump = CentrifugalPump(name="Feed Pump", flow_rated=0.002, pressure_rated=500000.0) # 5 bar
    psv = PressureSafetyValve(name="PSV-101", set_pressure_bar=2.0, cv=10.0, action_mode="pop_action")
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
    assert psv.status in ["cracked", "overcapacity"]
    assert psv.inlets[0].flow_rate > 0.0001
    assert psv.capacity_utilization_pct > 0.0

def test_psv_unmitigated_higher_pressure():
    tank_in = Tank(name="Supply Tank", elevation=0.0, fluid_level=2.0)
    pump = CentrifugalPump(name="Feed Pump", flow_rated=0.002, pressure_rated=600000.0) # 6 bar
    psv = PressureSafetyValve(name="PSV-101", set_pressure_bar=3.0, cv=15.0, action_mode="pop_action")
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
    pump = CentrifugalPump(name="Feed Pump", flow_rated=0.002, pressure_rated=400000.0) # 4 bar
    psv = PressureSafetyValve(name="PSV-102", set_pressure_bar=2.5, cv=10.0, action_mode="modulating")
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

    # Modulating test
    stats = solver.solve()
    assert stats["success"] is True
    assert psv.status in ["cracked", "overcapacity"]

    # Rupture disc test
    psv.action_mode = "rupture_disc"
    psv.reset_run_state()
    stats = solver.solve()
    assert stats["success"] is True
    assert psv.is_burst is True
    assert psv.status in ["cracked", "overcapacity"]
