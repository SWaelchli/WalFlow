
from networks import create_simple_network
from simulation.equipment.volumetric_pump import VolumetricPump
from simulation.equipment.tank import Tank
from simulation.equipment.pipe import Pipe
from simulation.schemas import HydraulicNetwork
from simulation.solver import NetworkSolver

def approx(val, target, rel=0.01):
    if target == 0: return abs(val) < rel
    return abs(val - target) <= abs(target * rel)

def test_volumetric_physics_isolation():
    """
    Scenarios 1-6: Testing the calculate_delta_p method directly.
    """
    # Q_rated = 100 L/min = 0.001666 m3/s
    # Use very high power to test slip in isolation
    q_rated_m3s = 100.0 / 60000.0
    pump = VolumetricPump("TestPump", flow_rated=q_rated_m3s, motor_power=1e6, efficiency=1.0)

    # 1. Ideal Flow (0.1% slip)
    # At Q = Q_rated, dP should be 0
    dp = pump.calculate_delta_p(q_rated_m3s, 1000.0)
    assert dp == 0.0

    # 2. Slight resistance (99 L/min)
    q_99 = 99.0 / 60000.0
    dp_99 = pump.calculate_delta_p(q_99, 1000.0)
    # 1 L/min drop = 1% drop. Slip is defined as 1% drop at 100 bar.
    # So 1 L/min drop SHOULD be 100 bar (1e7 Pa).
    assert approx(dp_99, 100e5, rel=0.01)

    # 3. Power Limit Hit (VFD with power limit; a fixed-speed drive keeps its flow, see below)
    pump_lim = VolumetricPump("LimPump", flow_rated=q_rated_m3s, motor_power=5000.0, efficiency=0.8, drive_type="vfd_power_limit")
    q_50 = 50.0 / 60000.0
    dp_50 = pump_lim.calculate_delta_p(q_50, 1000.0)
    # Usable = 4000W. P = 4000 / (50/60000) = 4,800,000 Pa (48 bar)
    assert approx(dp_50, 48e5, rel=0.01)

    # 4. Dead Head (Very low flow): the outlet is held at the 50 bar(a) default limit (+ max. 1 % accumulation)
    q_1 = 1.0 / 60000.0
    p_in = 1e5
    p_out_1 = p_in + pump.calculate_delta_p(q_1, 1000.0, p_in_pa=p_in)
    assert 50e5 <= p_out_1 <= 50e5 * 1.01

    # 5. Efficiency Scaling
    pump_low_eff = VolumetricPump("LowEff", flow_rated=q_rated_m3s, motor_power=5000.0, efficiency=0.4, drive_type="vfd_power_limit")
    dp_50_low = pump_low_eff.calculate_delta_p(q_50, 1000.0)
    assert approx(dp_50_low * 2, dp_50, rel=0.05)

    # 6. Aiding Flow (F1-35): Q > Q_rated, the pump brakes (negative ΔP) instead of passing freely
    q_101 = 101.0 / 60000.0
    dp_101 = pump.calculate_delta_p(q_101, 1000.0)
    assert approx(dp_101, -100e5, rel=0.01)

    # 3b. Fixed-speed drive (default) ignores the motor rating for the flow
    pump_fixed = VolumetricPump("Fixed", flow_rated=q_rated_m3s, motor_power=5000.0, efficiency=0.8)
    p_out_fixed = p_in + pump_fixed.calculate_delta_p(q_50, 1000.0, p_in_pa=p_in)
    assert 50e5 <= p_out_fixed <= 50e5 * 1.01


def print_network_state(net, title="Network State"):
    print(f"\n--- {title} ---")
    for node_id, node in net.nodes.items():
        print(f"Node {node_id} ({node.node_type}):")
        for i, p in enumerate(node.inlets):
            print(f"  Inlet {i}: P={p.pressure/1e5:.2f} bar, Q={p.flow_rate*60000:.2f} L/min")
        for i, p in enumerate(node.outlets):
            print(f"  Outlet {i}: P={p.pressure/1e5:.2f} bar, Q={p.flow_rate*60000:.2f} L/min")

def test_volumetric_network_scenarios():
    """
    Scenarios 7-10: Network integration tests.
    """
    q_rated_lmin = 100.0
    q_rated_m3s = q_rated_lmin / 60000.0
    
    # 7. Density Independence
    # Verify flow remains constant when density changes (unlike centrifugal pumps)
    pump = VolumetricPump("VP", flow_rated=q_rated_m3s, motor_power=10000, efficiency=0.9)
    net = create_simple_network(pump, valve_opening=50.0)
    
    solver = NetworkSolver(net)
    stats_water = solver.solve() # Water density 1000
    q_water = pump.inlets[0].flow_rate
    
    # Change density to 800 (Oil)
    for node in net.nodes.values():
        for port in node.inlets + node.outlets:
            port.density = 800.0
    
    stats_oil = solver.solve()
    q_oil = pump.inlets[0].flow_rate
    # Flow should be almost identical (dominated by rated flow + tiny slip)
    assert approx(q_water, q_oil, rel=0.01)

    # 8. Parallel Pumps
    p1 = VolumetricPump("P1", flow_rated=q_rated_m3s, motor_power=10000, efficiency=0.9)
    p2 = VolumetricPump("P2", flow_rated=q_rated_m3s, motor_power=10000, efficiency=0.9)

    t_in = Tank("In", fluid_level=0)
    t_in.add_outlet() # Now has outlet-0 and outlet-1

    t_out = Tank("Out", fluid_level=0)
    t_out.add_inlet() # Now has inlet-0 and inlet-1

    nodes = {"tin": t_in, "p1": p1, "p2": p2, "tout": t_out}
    # Use 0.01m pipes to provide high resistance
    edges = [
        {"id": "e1", "source": "tin", "target": "p1", "source_port": "outlet-0", "target_port": "inlet-0", "pipe": Pipe("p1",1.0,0.01)},
        {"id": "e2", "source": "tin", "target": "p2", "source_port": "outlet-1", "target_port": "inlet-0", "pipe": Pipe("p2",1.0,0.01)},
        {"id": "e3", "source": "p1", "target": "tout", "source_port": "outlet-0", "target_port": "inlet-0", "pipe": Pipe("p3",1.0,0.01)},
        {"id": "e4", "source": "p2", "target": "tout", "source_port": "outlet-0", "target_port": "inlet-1", "pipe": Pipe("p4",1.0,0.01)},
    ]
    net_para = HydraulicNetwork(nodes=nodes, edges=edges)
    solver_para = NetworkSolver(net_para)
    stats_para = solver_para.solve()
    
    print_network_state(net_para, "Parallel Network State")
    
    # Calculate total flow by checking pump inlets
    p1_live = net_para.nodes["p1"]
    p2_live = net_para.nodes["p2"]
    q_total = p1_live.inlets[0].flow_rate + p2_live.inlets[0].flow_rate
    
    print(f"DEBUG: q_total parallel = {q_total * 60000} L/min, target = {2 * q_rated_lmin}")
    # Total flow should be ~200 L/min
    # Note: 143 L/min implies gravity/static head is still aiding. 
    # We use rel=0.5 if it's overspeeding, but let's see if 0.05 passes with resistance.
    assert approx(q_total, (2 * q_rated_m3s), rel=0.1)

    # 9. Power Limit in Network
    # Small motor (500W). Usable = 450W.
    # At 100 L/min, max dP = 450 / (100/60000) = 2.7e5 Pa (2.7 bar)
    # If we restrict the valve, flow MUST drop below 100 L/min to balance.
    p_small = VolumetricPump("Small", flow_rated=q_rated_m3s, motor_power=500, efficiency=0.9, drive_type="vfd_power_limit")
    net_small = create_simple_network(p_small, valve_opening=5.0) # Highly restricted
    solver_small = NetworkSolver(net_small)
    stats_small = solver_small.solve()
    q_res = p_small.inlets[0].flow_rate
    
    assert q_res < q_rated_m3s
    # Verify P*Q <= Power * Eff
    dp = p_small.outlets[0].pressure - p_small.inlets[0].pressure
    actual_power = dp * q_res
    assert actual_power <= 500 * 0.9 * 1.05 # Allow 5% tolerance for numerical convergence
    p_small.refresh_warnings()
    assert p_small.power_limited and not p_small.motor_overload

    # 9b. Same network, fixed-speed drive (D3): flow stays at displacement, motor overload flagged
    #     Valve sized for ~10 bar at 100 L/min (well below the 50 bar(a) limit), shaft power ~1.85 kW
    p_fixed = VolumetricPump("SmallFixed", flow_rated=q_rated_m3s, motor_power=500, efficiency=0.9)
    net_fixed = create_simple_network(p_fixed, valve_opening=100.0)
    net_fixed.nodes["v1"].max_cv = 2.2
    NetworkSolver(net_fixed).solve()
    assert not p_fixed.pressure_cap_reached
    assert approx(p_fixed.inlets[0].flow_rate, q_rated_m3s, rel=0.01)
    p_fixed.refresh_warnings()
    assert p_fixed.motor_overload and not p_fixed.power_limited
    dp_fixed = p_fixed.outlets[0].pressure - p_fixed.inlets[0].pressure
    assert approx(p_fixed.motor_load_pct, 100.0 * q_rated_m3s * dp_fixed / 0.9 / 500.0, rel=0.01)

    # 10. Series Stability
    # Two pumps in series. This is often unstable for solvers.
    p_s1 = VolumetricPump("S1", flow_rated=q_rated_m3s, motor_power=10000, efficiency=0.9)
    p_s2 = VolumetricPump("S2", flow_rated=q_rated_m3s, motor_power=10000, efficiency=0.9)
    nodes_ser = {"tin": t_in, "p1": p_s1, "p2": p_s2, "tout": t_out}
    edges_ser = [
        {"id": "e1", "source": "tin", "target": "p1", "pipe": Pipe("p1",1,0.01)},
        {"id": "e2", "source": "p1", "target": "p2", "pipe": Pipe("p2",1,0.01)},
        {"id": "e3", "source": "p2", "target": "tout", "pipe": Pipe("p3",1,0.01)},
    ]
    net_ser = HydraulicNetwork(nodes=nodes_ser, edges=edges_ser)
    solver_ser = NetworkSolver(net_ser)
    stats_ser = solver_ser.solve()
    q_ser = p_s1.inlets[0].flow_rate
    assert approx(q_ser, q_rated_m3s, rel=0.01)

if __name__ == "__main__":
    test_volumetric_physics_isolation()
    test_volumetric_network_scenarios()
    print("All 10 Volumetric Pump scenarios passed!")
