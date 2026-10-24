"""An infeasible heat exchanger rating is reported, not silently clamped."""



from physics_refs import solve
from routers.simulation import extract_telemetry
from simulation.equipment.heat_exchanger import HeatExchanger
from simulation.equipment.pipe import Pipe
from simulation.equipment.tank import Tank
from simulation.schemas import HydraulicNetwork

FLUID = "iso_vg_46"


def _status(rated_kw):
    hx = HeatExchanger("HX", rated_cooling_kw=rated_kw, rated_flow_lmin=100.0, design_inlet_temp_c=50.0, medium_temp_c=10.0)
    nodes = {"t1": Tank("Supply", fluid_level=5.0, temperature=323.15, fluid_type=FLUID), "hx": hx,
             "t2": Tank("Sink", fluid_level=0.0, temperature=323.15, fluid_type=FLUID)}
    edges = [{"source": "t1", "target": "hx", "pipe": Pipe("a", 3.0, 0.05)},
             {"source": "hx", "target": "t2", "pipe": Pipe("b", 3.0, 0.05)}]
    solve(nodes, edges, fluid=FLUID)
    net = HydraulicNetwork(nodes=nodes, edges=[])
    net.global_settings = hx.global_settings
    return extract_telemetry(net)["nodes"]["hx"]


def test_infeasible_rating_is_reported():
    # 300 kW from 100 L/min of oil with only 40 K available needs a 103 K drop
    tel = _status(300.0)
    assert tel["rating_status"] == "infeasible"
    assert tel["design_effectiveness"] > 1.0


def test_modest_rating_is_ok():
    tel = _status(30.0)
    assert tel["rating_status"] == "ok"
    assert 0.0 < tel["design_effectiveness"] < 0.95
