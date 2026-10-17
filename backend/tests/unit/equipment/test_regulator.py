"""F1-41: pressure regulators – at setpoint when reachable, otherwise saturated on the physically correct side."""
import pytest

pytestmark = pytest.mark.audit("F1-41")

import pytest

from physics_refs import solve, water_head
from networks import assert_regulator_consistent, ID_1IN, ATM
from simulation.equipment.tank import Tank
from simulation.equipment.pipe import Pipe
from simulation.equipment.orifice import Orifice
from simulation.equipment.centrifugal_pump import CentrifugalPump
from simulation.equipment.linear_regulator import LinearRegulator





def test_prv_holds_reachable_setpoint():
    # 6 bar(g) feed head, orifice load downstream: 2 bar(g) is reachable
    set_pa = 2.0e5 + ATM
    nodes = {
        "t1": Tank("Source", fluid_level=61.0),
        "reg": LinearRegulator("PRV", max_cv=5.0, set_pressure=set_pa, backpressure=False),
        "ori": Orifice("Load", pipe_diameter=ID_1IN, orifice_diameter=0.008),
        "t2": Tank("Sink", fluid_level=0.0),
    }
    edges = [
        {"source": "t1", "target": "reg", "pipe": Pipe("p1", 5, ID_1IN)},
        {"source": "reg", "target": "ori", "pipe": Pipe("p2", 1, ID_1IN)},
        {"source": "ori", "target": "t2", "pipe": Pipe("p3", 1, ID_1IN)},
    ]
    assert solve(nodes, edges)["success"]
    assert assert_regulator_consistent(nodes["reg"], set_pa) == "regulated"


def test_prv_into_open_tank_saturates_open():
    # A PRV discharging straight into an atmospheric tank cannot build 3 bar(g) downstream
    set_pa = 3.0e5 + ATM
    nodes = {
        "t1": Tank("Source", fluid_level=50.0),
        "reg": LinearRegulator("PRV", max_cv=5.0, set_pressure=set_pa, backpressure=False),
        "t2": Tank("Sink", fluid_level=0.0),
    }
    edges = [
        {"source": "t1", "target": "reg", "pipe": Pipe("p1", 5, ID_1IN)},
        {"source": "reg", "target": "t2", "pipe": Pipe("p2", 5, ID_1IN)},
    ]
    assert solve(nodes, edges)["success"]
    assert assert_regulator_consistent(nodes["reg"], set_pa) == "saturated open"


def test_bpr_holds_upstream_pressure():
    set_pa = 8.0e5 + ATM
    nodes = {
        "t1": Tank("Source", fluid_level=1.0),
        "p1": CentrifugalPump("Feed Pump", flow_rated=100.0 / 60000.0, head_rated=water_head(10.0e5), rise_to_shutoff_pct=20.0),
        "reg": LinearRegulator("BPR", max_cv=5.0, set_pressure=set_pa, backpressure=True),
        "t2": Tank("Sink", fluid_level=1.0),
    }
    edges = [
        {"source": "t1", "target": "p1", "pipe": Pipe("p1", 1, ID_1IN)},
        {"source": "p1", "target": "reg", "pipe": Pipe("p2", 1, ID_1IN)},
        {"source": "reg", "target": "t2", "pipe": Pipe("p3", 1, ID_1IN)},
    ]
    assert solve(nodes, edges)["success"]
    assert assert_regulator_consistent(nodes["reg"], set_pa) == "regulated"
