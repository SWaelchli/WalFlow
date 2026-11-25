"""An infeasible heat exchanger rating is reported, not silently clamped."""



import pytest
from physics_refs import solve
from services.simulation_service import extract_telemetry
from simulation.equipment.heat_exchanger import HeatExchanger
from simulation.equipment.pipe import Pipe
from simulation.equipment.tank import Tank
from simulation.schemas import GlobalSettings, HydraulicNetwork

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


@pytest.mark.parametrize("kind, medium_c, rated_kw, status, effectiveness_sign", [
    pytest.param("air_cooled", 45.0, 300.0, "infeasible", -1, id="air_hotter_than_inlet"),
    pytest.param("air_cooled", 40.0, 300.0, "infeasible", None, id="air_equals_inlet_with_duty"),
    pytest.param("water_cooled", 45.0, 300.0, "infeasible", -1, id="water_hotter_than_inlet"),
    pytest.param("air_cooled", 45.0, 0.0, "ok", 0, id="zero_duty_with_air_above_inlet"),
])
def test_rating_with_medium_on_wrong_side_of_inlet(kind, medium_c, rated_kw, status, effectiveness_sign):
    # Design inlet 40 C: the medium must be colder than the inlet for any cooling duty to be possible
    hx = HeatExchanger("HX", rated_cooling_kw=rated_kw, rated_flow_lmin=100.0, design_inlet_temp_c=40.0,
                       cooler_type=kind, **({"design_air_temp_c": medium_c} if kind == "air_cooled" else {"medium_temp_c": medium_c}))
    hx.global_settings = GlobalSettings(fluid_type="water")
    hx._ua_rated()
    assert hx.rating_status == status
    if effectiveness_sign is None:
        assert hx.design_effectiveness is None
    elif effectiveness_sign < 0:
        assert hx.design_effectiveness is not None and hx.design_effectiveness < 0.0
    else:
        assert hx.design_effectiveness == 0.0
