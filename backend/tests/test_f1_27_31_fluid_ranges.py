"""F1-27 (gasoline / crude vapour pressure) and F1-31 (validity ranges, unknown fluids)."""
import pytest

from physics_refs import solve
from simulation.equipment.pipe import Pipe
from simulation.equipment.tank import Tank
from simulation.fluid_utils import FluidProperties as FP, UnknownFluidError
from simulation.graph_parser import GraphParser, ModelInputError
from simulation.schemas import ReactFlowGraph


def test_f1_27_gasoline_vapor_pressure_in_en228_range():
    # EN 228 DVPE 45-90 kPa; the n-heptane model gave 11.2 kPa at 37.8 °C
    pv = FP.get_vapor_pressure("gasoline", 37.8 + 273.15)
    assert 45e3 <= pv <= 90e3
    assert FP.get_vapor_pressure("gasoline", 60 + 273.15) > 2.0 * pv
    assert FP.get_vapor_pressure("gasoline", 20 + 273.15) < pv


def test_f1_27_light_crude_has_finite_vapor_pressure():
    assert 20e3 <= FP.get_vapor_pressure("crude_light", 37.8 + 273.15) <= 70e3


def test_f1_31_unknown_fluid_is_an_error_everywhere():
    for fn in (FP.get_density, FP.get_viscosity, FP.get_vapor_pressure, FP.get_specific_heat):
        with pytest.raises(UnknownFluidError):
            fn("no_such_fluid", 293.15)


def test_f1_31_parser_rejects_unknown_system_fluid():
    graph = ReactFlowGraph(nodes=[], edges=[], global_settings={"fluid_type": "iso_vg_46_old"})
    with pytest.raises(ModelInputError, match="iso_vg_46_old"):
        GraphParser.parse_graph(graph)


def test_f1_31_every_fluid_has_a_temperature_range():
    for fid in FP.FLUIDS:
        lo, hi = FP.temperature_range_c(fid)
        assert lo < hi


def test_f1_31_cold_oil_is_reported_out_of_range():
    nodes = {
        "t1": Tank("Cold Supply", fluid_level=3.0, temperature=-30 + 273.15, fluid_type="iso_vg_220"),
        "t2": Tank("Sink", fluid_level=0.0, temperature=-30 + 273.15, fluid_type="iso_vg_220"),
    }
    stats = solve(nodes, [{"source": "t1", "target": "t2", "pipe": Pipe("p", 5.0, 0.1)}], fluid="iso_vg_220")
    reasons = {i["reason"] for i in stats["physical_validity"]["issues"]}
    assert "temperature_out_of_range" in reasons
