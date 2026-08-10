import sys
import os
import pytest
import numpy as np

# Add backend directory to sys.path
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from simulation.equipment.tank import Tank
from simulation.equipment.pipe import Pipe
from simulation.equipment.check_valve import CheckValve
from simulation.equipment.pressure_safety_valve import PressureSafetyValve
from simulation.equipment.volumetric_pump import VolumetricPump
from simulation.schemas import HydraulicNetwork, GlobalSettings
from simulation.solver import NetworkSolver

def test_fischer_burmeister_check_valve():
    """
    Test check valve calculate_delta_p directly under MCP mode.
    """
    cv = CheckValve(name="CV_1", cv=10.0, cracking_pressure_bar=0.05)
    
    # 1. Forward flow under MCP mode (p_in > p_out + cracking)
    # At converged manifold, p_in - p_out should match cracking + open friction
    flow_rate = 0.001
    density = 1000.0
    dp_friction, _ = cv.calculate_open_friction_and_deriv(flow_rate, density)
    cracking_pa = 0.05 * 100000.0
    target_dp = cracking_pa + dp_friction
    
    p_in = 200000.0
    p_out_est = p_in - target_dp
    dp = cv.calculate_delta_p(flow_rate=flow_rate, density=density, p_in_pa=p_in, p_out_pa=p_out_est)
    assert abs(dp - target_dp) < 1.0
    
    # 2. Reverse flow under MCP mode (p_in < p_out)
    # The valve is closed, meaning flow should be 0.0 and dp matches delta P
    p_in = 50000.0
    p_out_est = 100000.0
    dp_reverse = cv.calculate_delta_p(flow_rate=0.0, density=1000.0, p_in_pa=p_in, p_out_pa=p_out_est)
    assert abs(dp_reverse - (p_in - p_out_est)) < 1.0

def test_dynamic_topology_reduction():
    """
    Verify that an inactive volumetric pump triggers graph pruning.
    The active set should be completely empty, and telemetry should update successfully.
    """
    gs = GlobalSettings(fluid_type="water")
    
    t1 = Tank("Source", fluid_level=5.0, elevation=0.0, temperature=293.15, fluid_type="water")
    p1 = VolumetricPump("VolPump", flow_rated=100.0/60000.0, motor_power=5000.0, efficiency=0.85)
    p1.active = False  # Pruning trigger
    t2 = Tank("Sink", fluid_level=1.0, elevation=0.0, temperature=293.15, fluid_type="water")

    nodes = {"t1": t1, "p1": p1, "t2": t2}
    edges = [
        {"source": "t1", "target": "p1", "pipe": Pipe("p1", 1.0, 0.05)},
        {"source": "p1", "target": "t2", "pipe": Pipe("p2", 1.0, 0.05)}
    ]
    
    network = HydraulicNetwork(nodes=nodes, edges=edges)
    for n in nodes.values(): n.global_settings = gs
    for e in edges: e['pipe'].global_settings = gs

    solver = NetworkSolver(network)
    
    # Pruned node IDs should contain p1, and since DFS starting from Tanks is blocked,
    # the entire network is pruned or isolated
    assert "p1" in solver.pruned_node_ids
    
    # Run solver
    stats = solver.solve()
    assert stats["success"] is True
    assert stats["system_size"] == 0
    
    # Telemetry should be populated correctly with zero flow
    assert p1.inlets[0].flow_rate == 0.0
    assert p1.outlets[0].flow_rate == 0.0

def test_check_valve_mcp_in_solver():
    """
    Solve a network with a dynamic check valve preventing reverse flow.
    If back-pressure is higher, flow should go to zero.
    """
    gs = GlobalSettings(fluid_type="water")
    
    # Source Tank is lower pressure (1.0 bar atm + 1m head = ~1.1 bar)
    t1 = Tank("Source", fluid_level=1.0, elevation=0.0, temperature=293.15, fluid_type="water")
    cv = CheckValve(name="CheckValve", cv=10.0, cracking_pressure_bar=0.05)
    # Sink Tank is higher pressure (1.0 bar atm + 10m head = ~2.0 bar)
    t2 = Tank("Sink", fluid_level=10.0, elevation=0.0, temperature=293.15, fluid_type="water")

    nodes = {"t1": t1, "cv": cv, "t2": t2}
    edges = [
        {"source": "t1", "target": "cv", "pipe": Pipe("p1", 1.0, 0.05)},
        {"source": "cv", "target": "t2", "pipe": Pipe("p2", 1.0, 0.05)}
    ]
    
    network = HydraulicNetwork(nodes=nodes, edges=edges)
    for n in nodes.values(): n.global_settings = gs
    for e in edges: e['pipe'].global_settings = gs

    solver = NetworkSolver(network)
    stats = solver.solve()
    
    assert stats["success"] is True
    # Flow should be zero since the check valve prevents backflow
    q = cv.inlets[0].flow_rate
    assert abs(q) < 1e-5

if __name__ == "__main__":
    pytest.main(["-v", __file__])
