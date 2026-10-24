import math
import pytest


from simulation.equipment.calibrated_restriction import CalibratedRestriction
from simulation.fluid_utils import FluidProperties
from simulation.schemas import ReactFlowNode
from simulation.graph_parser import GraphParser

def test_calibrated_restriction_calibration():
    # Calibration baseline case:
    # 10 L/min flow, 3.5 bar inlet, 1.0 bar outlet (2.5 bar pressure drop) at 45°C
    # Let's test all three models: laminar, quadratic, and orifice
    
    flow_lmin = 10.0
    inlet_bar = 3.5
    outlet_bar = 1.0
    temp_c = 45.0
    
    q0 = flow_lmin / 60000.0
    dp0 = (inlet_bar - outlet_bar) * 1e5
    t0 = temp_c + 273.15
    
    # Using default water properties for simplicity first (or iso_vg_46)
    rho0 = FluidProperties.get_density("water", t0)
    mu0 = FluidProperties.get_viscosity("water", t0)
    
    for model in ["laminar", "quadratic", "orifice"]:
        res = CalibratedRestriction(
            name=f"CR_{model}",
            flow_base_lmin=flow_lmin,
            inlet_pressure_base_bar=inlet_bar,
            outlet_pressure_base_bar=outlet_bar,
            temp_base_c=temp_c,
            restriction_model=model,
            fluid_type="water"
        )
        
        # Test calibration point matches exactly
        dp_cal = res.calculate_delta_p(q0, rho0, mu0)
        assert math.isclose(dp_cal, dp0, rel_tol=1e-4), f"{model} model dP at calibration {dp_cal} != expected {dp0}"

@pytest.mark.parametrize("model, flow_factor, visc_factor", [
    # Laminar: double flow rate gives double pressure drop, double viscosity gives double pressure drop
    pytest.param("laminar", 2.0, 2.0, id="laminar"),
    # Quadratic: double flow rate gives quadruple pressure drop
    pytest.param("quadratic", 4.0, None, id="quadratic"),
])
def test_calibrated_restriction_scaling(model, flow_factor, visc_factor):
    # 10 L/min, 2.5 bar dP at 45 C
    res = CalibratedRestriction(
        name=f"CR_{model}",
        flow_base_lmin=10.0,
        inlet_pressure_base_bar=3.5,
        outlet_pressure_base_bar=1.0,
        temp_base_c=45.0,
        restriction_model=model,
        fluid_type="water"
    )

    q0 = 10.0 / 60000.0
    t0 = 45.0 + 273.15
    rho0 = FluidProperties.get_density("water", t0)
    mu0 = FluidProperties.get_viscosity("water", t0)

    dp_1 = res.calculate_delta_p(q0, rho0, mu0)
    dp_2 = res.calculate_delta_p(2.0 * q0, rho0, mu0)
    assert math.isclose(dp_2, flow_factor * dp_1, rel_tol=1e-5), f"{model} flow scaling failed: {dp_2} != {flow_factor * dp_1}"

    if visc_factor is not None:
        dp_visc = res.calculate_delta_p(q0, rho0, 2.0 * mu0)
        assert math.isclose(dp_visc, visc_factor * dp_1, rel_tol=1e-5), f"Laminar viscosity scaling failed: {dp_visc} != {visc_factor * dp_1}"

def test_graph_parser_calibrated_restriction():
    node_data = ReactFlowNode(
        id="cr_node_1",
        type="calibrated_restriction",
        position={"x": 10.0, "y": 20.0},
        data={
            "label": "Calibrated Restriction 1",
            "flow_base_lmin": 15.0,
            "inlet_pressure_base_bara": 4.0,
            "outlet_pressure_base_bara": 1.5,
            "temp_base_c": 50.0,
            "restriction_model": "laminar",
            "fluid_type": "iso_vg_46"
        }
    )
    parsed_node = GraphParser.create_node(node_data)
    assert isinstance(parsed_node, CalibratedRestriction)
    assert parsed_node.flow_base_lmin == 15.0
    assert parsed_node.inlet_pressure_base_bar == 4.0
    assert parsed_node.outlet_pressure_base_bar == 1.5
    assert parsed_node.temp_base_c == 50.0
    assert parsed_node.restriction_model == "laminar"
    assert parsed_node.fluid_type == "iso_vg_46"

def _restriction_graph(restriction_data, fluid="iso_vg_46"):
    from simulation.schemas import ReactFlowGraph
    return ReactFlowGraph(**{
        "nodes": [
            {"id": "t1", "type": "tank", "position": {"x": 0, "y": 0}, "data": {"label": "T1"}},
            {"id": "cr", "type": "calibrated_restriction", "position": {"x": 1, "y": 0},
             "data": {"label": "CR-1", **restriction_data}},
            {"id": "t2", "type": "tank", "position": {"x": 2, "y": 0}, "data": {"label": "T2"}},
        ],
        "edges": [
            {"id": "e1", "source": "t1", "target": "cr", "sourceHandle": "outlet-0", "targetHandle": "inlet-0",
             "data": {"length_m": 1.0, "diameter_m": 0.0266}},
            {"id": "e2", "source": "cr", "target": "t2", "sourceHandle": "outlet-0", "targetHandle": "inlet-0",
             "data": {"length_m": 1.0, "diameter_m": 0.0266}},
        ],
        "global_settings": {"fluid_type": fluid},
    })


@pytest.mark.parametrize("model", ["orifice", "laminar", "quadratic"])
def test_parsed_restriction_reproduces_calibration_at_first_call(model):
    # System fluid ISO VG 46 and a DN25 pipe are only known after the parser has built the node
    node = GraphParser.parse_graph(_restriction_graph({"restriction_model": model})).nodes["cr"]
    t0 = 45.0 + 273.15
    rho, mu = FluidProperties.get_density("iso_vg_46", t0), FluidProperties.get_viscosity("iso_vg_46", t0)
    assert node.calculate_delta_p(10.0 / 60000.0, rho, mu) == pytest.approx(2.5e5, rel=1e-4)


def test_outlet_properties_belong_to_the_warmed_outlet_temperature():
    """Throttling warms the leaving stream: its density and viscosity are those of the warmed temperature,
    not of the inlet (a stale copy left the outlet ~0.5 K off its own temperature)."""
    from simulation.schemas import GlobalSettings
    node = CalibratedRestriction("CR", 10.0, 3.5, 1.0, 45.0, "quadratic", "iso_vg_46")
    node.global_settings = GlobalSettings(fluid_type="iso_vg_46")
    inlet, outlet = node.inlets[0], node.outlets[0]
    inlet.flow_rate, inlet.pressure, inlet.temperature = 40.0 / 60000.0, 60e5, 318.15
    inlet.density = FluidProperties.get_density("iso_vg_46", 318.15)
    inlet.viscosity = FluidProperties.get_viscosity("iso_vg_46", 318.15)
    node.calculate()
    assert outlet.temperature - inlet.temperature > 0.2  # the row only means something with real warming
    assert outlet.density == pytest.approx(FluidProperties.get_density("iso_vg_46", outlet.temperature), rel=1e-12)
    assert outlet.viscosity == pytest.approx(FluidProperties.get_viscosity("iso_vg_46", outlet.temperature), rel=1e-12)


def test_calibration_runs_once_and_again_only_after_a_change(monkeypatch):
    node = CalibratedRestriction("CR", 10.0, 3.5, 1.0, 45.0, "orifice", "water")
    calls = []
    original = CalibratedRestriction._calibrate
    monkeypatch.setattr(CalibratedRestriction, "_calibrate", lambda self: (calls.append(1), original(self)))
    q, rho, mu = 10.0 / 60000.0, 990.0, 6e-4
    node.inlets[0].flow_rate, node.inlets[0].density, node.inlets[0].viscosity = q, rho, mu
    for _ in range(3):
        node.calculate_delta_p(q, rho, mu)
        node.calculate()
    assert len(calls) == 1
    node.pipe_diameter = 0.0266
    node.calculate_delta_p(q, rho, mu)
    node.calculate()
    assert len(calls) == 2


def test_zero_calibration_temperature_is_kept():
    assert CalibratedRestriction("CR", 10.0, 3.5, 1.0, 0.0).temp_base_c == 0.0
    node = GraphParser.parse_graph(_restriction_graph({"temp_base_c": 0.0})).nodes["cr"]
    assert node.temp_base_c == 0.0


@pytest.mark.parametrize("data, match", [
    ({"flow_base_lmin": 0.0}, "flow"),
    ({"flow_base_lmin": -5.0}, "flow"),
    ({"inlet_pressure_base_bara": 1.0, "outlet_pressure_base_bara": 1.0}, "inlet pressure"),
    ({"inlet_pressure_base_bara": 0.8, "outlet_pressure_base_bara": 1.0}, "inlet pressure"),
    ({"outlet_pressure_base_bara": 0.0}, "outlet pressure"),
    ({"temp_base_c": -300.0}, "temperature"),
])
def test_invalid_calibration_point_is_an_input_error(data, match):
    from simulation.graph_parser import ModelInputError
    with pytest.raises(ModelInputError, match=f"CR-1.*{match}"):
        GraphParser.parse_graph(_restriction_graph(data))


if __name__ == "__main__":
    test_calibrated_restriction_calibration()
    test_calibrated_restriction_scaling('laminar', 2.0, 2.0)
    test_graph_parser_calibrated_restriction()
