"""F1-41: regulator scenarios with pumps and parallel branches."""
from physics_refs import solve, water_head
from test_physics_regulator import assert_regulator_consistent, ID_1IN, ATM
from simulation.equipment.tank import Tank
from simulation.equipment.pipe import Pipe
from simulation.equipment.centrifugal_pump import CentrifugalPump
from simulation.equipment.splitter import Splitter
from simulation.equipment.orifice import Orifice
from simulation.equipment.linear_regulator import LinearRegulator


def test_prv_with_orifice_load_unreachable_setpoint_saturates_open():
    # Pump + PRV wide open still gives < 5 bar(g) after the PRV: correct answer is "fully open"
    set_pa = 5.0e5 + ATM
    nodes = {
        "t1": Tank("Source", fluid_level=1.0),
        "p1": CentrifugalPump("Feed Pump", flow_rated=100.0 / 60000.0, head_rated=water_head(10.0e5), rise_to_shutoff_pct=20.0),
        "reg": LinearRegulator("PRV", max_cv=5.0, set_pressure=set_pa, backpressure=False),
        "ori": Orifice("Load", pipe_diameter=ID_1IN, orifice_diameter=0.012),
        "t2": Tank("Sink", fluid_level=0.0),
    }
    edges = [
        {"source": "t1", "target": "p1", "pipe": Pipe("p1", 1, ID_1IN)},
        {"source": "p1", "target": "reg", "pipe": Pipe("p2", 1, ID_1IN)},
        {"source": "reg", "target": "ori", "pipe": Pipe("p3", 1, ID_1IN)},
        {"source": "ori", "target": "t2", "pipe": Pipe("p4", 1, ID_1IN)},
    ]
    assert solve(nodes, edges)["success"]
    assert assert_regulator_consistent(nodes["reg"], set_pa) == "saturated open"


def test_prv_with_orifice_load_reachable_setpoint():
    set_pa = 3.0e5 + ATM
    nodes = {
        "t1": Tank("Source", fluid_level=1.0),
        "p1": CentrifugalPump("Feed Pump", flow_rated=100.0 / 60000.0, head_rated=water_head(10.0e5), rise_to_shutoff_pct=20.0),
        "reg": LinearRegulator("PRV", max_cv=5.0, set_pressure=set_pa, backpressure=False),
        "ori": Orifice("Load", pipe_diameter=ID_1IN, orifice_diameter=0.012),
        "t2": Tank("Sink", fluid_level=0.0),
    }
    edges = [
        {"source": "t1", "target": "p1", "pipe": Pipe("p1", 1, ID_1IN)},
        {"source": "p1", "target": "reg", "pipe": Pipe("p2", 1, ID_1IN)},
        {"source": "reg", "target": "ori", "pipe": Pipe("p3", 1, ID_1IN)},
        {"source": "ori", "target": "t2", "pipe": Pipe("p4", 1, ID_1IN)},
    ]
    assert solve(nodes, edges)["success"]
    assert assert_regulator_consistent(nodes["reg"], set_pa) == "regulated"


def test_bpr_in_parallel_branch():
    # Large pump, BPR branch + orifice branch: BPR wide open still leaves the header above set
    set_pa = 8.0e5 + ATM
    nodes = {
        "t1": Tank("Source", fluid_level=1.0),
        "p1": CentrifugalPump("Pump", flow_rated=1.0, head_rated=water_head(15.0e5), rise_to_shutoff_pct=0.0),
        "split": Splitter("Splitter"),
        "reg": LinearRegulator("BPR", max_cv=5.0, set_pressure=set_pa, backpressure=True),
        "ori": Orifice("Bypass Load", pipe_diameter=ID_1IN, orifice_diameter=0.012),
        "t_sink1": Tank("Sink A", fluid_level=0.0),
        "t_sink2": Tank("Sink B", fluid_level=0.0),
    }
    edges = [
        {"source": "t1", "target": "p1", "pipe": Pipe("p1", 1, ID_1IN)},
        {"source": "p1", "target": "split", "pipe": Pipe("p2", 1, ID_1IN)},
        {"source": "split", "source_port": "outlet-0", "target": "reg", "target_port": "inlet-0", "pipe": Pipe("p3", 1, ID_1IN)},
        {"source": "split", "source_port": "outlet-1", "target": "ori", "target_port": "inlet-0", "pipe": Pipe("p4", 1, ID_1IN)},
        {"source": "reg", "target": "t_sink1", "pipe": Pipe("p5", 1, ID_1IN)},
        {"source": "ori", "target": "t_sink2", "pipe": Pipe("p6", 1, ID_1IN)},
    ]
    assert solve(nodes, edges)["success"]
    assert assert_regulator_consistent(nodes["reg"], set_pa) == "saturated open"
