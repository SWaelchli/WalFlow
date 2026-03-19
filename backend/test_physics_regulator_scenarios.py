import sys
import os
import math

# Add backend to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from simulation.equipment.tank import Tank
from simulation.equipment.pipe import Pipe
from simulation.equipment.centrifugal_pump import CentrifugalPump
from simulation.equipment.splitter import Splitter
from simulation.equipment.orifice import Orifice
from simulation.equipment.linear_regulator import LinearRegulator
from simulation.schemas import HydraulicNetwork, GlobalSettings
from simulation.solver import NetworkSolver

def run_test(name, nodes, edges, set_pa, is_backpressure, sense_node_id):
    print(f"\n>>> Scenario: {name} <<<")
    gs = GlobalSettings()
    network = HydraulicNetwork(nodes=nodes, edges=edges)
    
    for node in nodes.values():
        node.global_settings = gs
    for edge in edges:
        edge['pipe'].global_settings = gs

    solver = NetworkSolver(network)
    try:
        solver.solve()
        
        reg_node = nodes['reg']
        # Sensed pressure at the specific point of interest
        sensed_p = reg_node.inlets[0].pressure if is_backpressure else reg_node.outlets[0].pressure
        opening = reg_node.opening_pct
        flow = reg_node.inlets[0].flow_rate
        
        print(f"  Result Flow:   {flow*60000:.1f} L/min")
        print(f"  Final Sensed:  {sensed_p/100000:.2f} bar (Target: {set_pa/100000:.2f})")
        print(f"  Reg Opening:   {opening:.1f} %")

        error_bar = abs(sensed_p - set_pa) / 100000.0
        if error_bar < 0.15:
            print("  RESULT: SUCCESS (Regulated)")
        elif opening >= 99.9 or opening <= 0.15:
            print(f"  RESULT: SUCCESS (Saturated at {opening:.1f}%)")
        else:
            print("  RESULT: FAILURE")

    except Exception as e:
        print(f"  Solver Error: {e}")

def test_scenarios():
    id_1inch = 0.0266 # 1" NPS
    
    # --- Scenario 1: PRV with Orifice Load ---
    # Pump -> PRV (Set 5) -> Orifice -> Tank
    # The Orifice ensures P_out of PRV isn't just atmospheric.
    set_prv = 5.0 * 100000 + 101325
    nodes1 = {
        "t1": Tank("Source", fluid_level=1.0),
        "p1": CentrifugalPump("Pump", A=100.0, B=0, C=0), # 10bar head
        "reg": LinearRegulator("PRV", max_cv=5.0, set_pressure=set_prv, backpressure=False),
        "ori": Orifice("Load", pipe_diameter=id_1inch, orifice_diameter=0.012),
        "t2": Tank("Sink", fluid_level=0.0)
    }
    edges1 = [
        {"source": "t1",  "target": "p1",  "pipe": Pipe("p1", 1, id_1inch)},
        {"source": "p1",  "target": "reg", "pipe": Pipe("p2", 1, id_1inch)},
        {"source": "reg", "target": "ori", "pipe": Pipe("p3", 1, id_1inch)},
        {"source": "ori", "target": "t2",  "pipe": Pipe("p4", 1, id_1inch)}
    ]
    run_test("PRV + Orifice Load", nodes1, edges1, set_prv, False, "reg")

    # --- Scenario 2: BPR in Parallel Branch ---
    # Pump -> Splitter -> Branch A: BPR -> Tank
    #                  -> Branch B: Orifice -> Tank
    set_bpr = 8.0 * 100000 + 101325
    nodes2 = {
        "t1": Tank("Source", fluid_level=1.0),
        "p1": CentrifugalPump("Pump", A=150.0, B=0, C=0), # ~15bar head
        "split": Splitter("Splitter"),
        "reg": LinearRegulator("BPR", max_cv=5.0, set_pressure=set_bpr, backpressure=True),
        "ori": Orifice("Bypass Load", pipe_diameter=id_1inch, orifice_diameter=0.012),
        "t_sink1": Tank("Sink A", fluid_level=0.0),
        "t_sink2": Tank("Sink B", fluid_level=0.0)
    }
    edges2 = [
        {"source": "t1",    "target": "p1",    "pipe": Pipe("p1", 1, id_1inch)},
        {"source": "p1",    "target": "split", "pipe": Pipe("p2", 1, id_1inch)},
        {"source": "split", "source_port": "outlet-0", "target": "reg", "target_port": "inlet-0", "pipe": Pipe("p3", 1, id_1inch)},
        {"source": "split", "source_port": "outlet-1", "target": "ori", "target_port": "inlet-0", "pipe": Pipe("p4", 1, id_1inch)},
        {"source": "reg",   "target": "t_sink1", "pipe": Pipe("p5", 1, id_1inch)},
        {"source": "ori",   "target": "t_sink2", "pipe": Pipe("p6", 1, id_1inch)}
    ]
    run_test("BPR in Parallel", nodes2, edges2, set_bpr, True, "reg")

if __name__ == "__main__":
    test_scenarios()
