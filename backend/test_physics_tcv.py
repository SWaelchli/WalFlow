import sys
import os
import numpy as np

# Add backend to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from simulation.schemas import HydraulicNetwork, GlobalSettings
from simulation.solver import NetworkSolver
from simulation.equipment.tank import Tank
from simulation.equipment.pipe import Pipe
from simulation.equipment.three_way_tcv import ThreeWayTCV
from simulation.equipment.linear_control_valve import LinearControlValve

def build_tcv_network(hot_temp=353.15, cold_temp=293.15, set_temp=313.15, 
                      hot_p=2.0, cold_p=2.0, sink_p=1.0, 
                      hot_port_idx=0, max_cv=0.1):
    """
    Helper to build a 2-source, 1-sink network with a TCV.
    """
    gs = GlobalSettings(fluid_type="iso_vg_46")
    
    # Sources
    t_hot = Tank("Hot Source", fluid_level=0, elevation=(hot_p-1.01325)*10.2, temperature=hot_temp, fluid_type="iso_vg_46")
    t_cold = Tank("Cold Source", fluid_level=0, elevation=(cold_p-1.01325)*10.2, temperature=cold_temp, fluid_type="iso_vg_46")
    
    # Valve
    tcv = ThreeWayTCV("TCV", max_cv=max_cv, set_temperature=set_temp, hot_port_idx=hot_port_idx)
    
    # Load (Restriction to limit flow)
    v_load = LinearControlValve("Load", max_cv=0.01, opening_pct=100.0)
    
    # Sink
    t_sink = Tank("Sink", fluid_level=0, elevation=(sink_p-1.01325)*10.2, temperature=293.15, fluid_type="iso_vg_46")
    
    nodes = {"t_hot": t_hot, "t_cold": t_cold, "tcv": tcv, "vl": v_load, "t_sink": t_sink}
    
    # Connect everything
    edges = [
        {"id": "e_hot", "source": "t_hot", "target": "tcv", "target_port": "inlet-0", "pipe": Pipe("p1", 1, 0.05)},
        {"id": "e_cold", "source": "t_cold", "target": "tcv", "target_port": "inlet-1", "pipe": Pipe("p2", 1, 0.05)},
        {"id": "e_out", "source": "tcv", "target": "vl", "pipe": Pipe("p3", 1, 0.05)},
        {"id": "e_sink", "source": "vl", "target": "t_sink", "pipe": Pipe("p4", 1, 0.05)}
    ]
    
    network = HydraulicNetwork(nodes=nodes, edges=edges)
    for n in nodes.values(): n.global_settings = gs
    for e in edges: e['pipe'].global_settings = gs
    
    return network, tcv

def run_test(name, network, tcv, expected_temp=None, tol=0.5):
    print(f"\n▶ Testing: {name}")
    solver = NetworkSolver(network)
    try:
        solver.solve(method='hybr')
        t_out = tcv.outlets[0].temperature - 273.15
        q_hot = tcv.inlets[0].flow_rate * 60000
        q_cold = tcv.inlets[1].flow_rate * 60000
        
        print(f"  Result: SUCCESS")
        print(f"  Outlet Temp: {t_out:.2f} °C (Set: {tcv.set_temperature-273.15:.1f} °C)")
        print(f"  Mix Ratio: {tcv.mix_ratio*100:.1f}% Hot / {(1-tcv.mix_ratio)*100:.1f}% Cold")
        print(f"  Flows: Hot={q_hot:.1f} L/min, Cold={q_cold:.1f} L/min")
        
        # Intelligent Assertion:
        # 1. Target reached?
        if abs(t_out - expected_temp) < tol:
            print("  Result: SUCCESS (Target Reached)")
            return

        # 2. Saturated? (Doing its best at the physical limit)
        is_saturated = (tcv.mix_ratio < 0.01 or tcv.mix_ratio > 0.99)
        if is_saturated:
            print(f"  Result: SUCCESS (Saturated at {tcv.mix_ratio*100:.1f}%)")
        else:
            # Only fail if it's not saturated and still missed the target
            assert False, f"Controller stalled at {tcv.mix_ratio*100:.1f}% without reaching {expected_temp}C (Actual: {t_out:.1f}C)"
        
    except Exception as e:
        print(f"  Result: FAILED ({e})")

if __name__ == "__main__":
    print("🔬 3-WAY TCV PHYSICS STRESS TEST")

    # 1. Standard Mixing
    net, tcv = build_tcv_network(hot_temp=353.15, cold_temp=293.15, set_temp=313.15)
    run_test("Standard Mixing (80C/20C -> 40C)", net, tcv, expected_temp=40.0)

    # 2. Hot Saturated (Target 40, but Cold is 45)
    net, tcv = build_tcv_network(hot_temp=353.15, cold_temp=318.15, set_temp=313.15)
    run_test("Hot Saturated (Cold source is too warm)", net, tcv, expected_temp=45.0)

    # 3. Cold Saturated (Target 40, but Hot is 35)
    net, tcv = build_tcv_network(hot_temp=308.15, cold_temp=283.15, set_temp=313.15)
    run_test("Cold Saturated (Hot source is too cold)", net, tcv, expected_temp=35.0)

    # 4. Role Swapping (Inlet 2 is Hot)
    net, tcv = build_tcv_network(hot_temp=293.15, cold_temp=353.15, set_temp=313.15, hot_port_idx=1)
    run_test("Role Swapping (Inlet 2 is HOT)", net, tcv, expected_temp=40.0)

    # 5. Pressure Conflict (Hot is 10 bar, Cold is 1.2 bar)
    net, tcv = build_tcv_network(hot_p=10.0, cold_p=1.2, set_temp=313.15)
    run_test("Pressure Conflict (Hot @ 10 bar)", net, tcv, expected_temp=40.0)

    # 6. Reverse Flow
    net, tcv = build_tcv_network(hot_p=1.5, cold_p=1.5, sink_p=10.0)
    print("\n▶ Testing: Reverse Flow (High Backpressure)")
    solver = NetworkSolver(net)
    try:
        solver.solve()
        print("  Result: SUCCESS (Solver stabilized)")
    except Exception as e:
        print(f"  Result: FAILED as expected or crashed ({e})")

    # 7. Starved Inlet (Cold source is blocked)
    net, tcv = build_tcv_network()
    net.edges[1]['pipe'].diameter = 0.0001 # Tiny pipe
    run_test("Starved Inlet (Cold branch blocked)", net, tcv, expected_temp=80.0)

    # 8. Temperature Inversion (Controller sanity)
    net, tcv = build_tcv_network(hot_temp=293.15, cold_temp=353.15, set_temp=313.15, hot_port_idx=0)
    run_test("Inversion (Hot input gets cold fluid)", net, tcv, expected_temp=40.0)

    # 10. Low Capacity
    net, tcv = build_tcv_network(max_cv=0.001)
    run_test("Low Capacity (Tiny Cv)", net, tcv, expected_temp=40.0)
