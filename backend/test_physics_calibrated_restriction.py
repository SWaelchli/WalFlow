import sys
import os
import math

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

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
        
        # Test analytical derivative is positive and reasonable
        deriv = res.calculate_dp_derivative(q0, rho0, mu0)
        assert deriv > 0, f"{model} derivative {deriv} should be positive"
        
        # Test numerical derivative vs analytical derivative
        num_deriv = res.calculate_dp_derivative(q0, rho0, mu0)
        # Using parent's numerical fallback to compare
        parent_deriv = super(CalibratedRestriction, res).calculate_dp_derivative(q0, rho0, mu0)
        assert math.isclose(deriv, parent_deriv, rel_tol=1e-2), f"{model} analytical derivative {deriv} != numerical derivative {parent_deriv}"

def test_laminar_scaling():
    # 10 L/min, 2.5 bar dP at 45°C
    res = CalibratedRestriction(
        name="CR_lam",
        flow_base_lmin=10.0,
        inlet_pressure_base_bar=3.5,
        outlet_pressure_base_bar=1.0,
        temp_base_c=45.0,
        restriction_model="laminar",
        fluid_type="water"
    )
    
    # Double flow rate => double pressure drop (Laminar model)
    q0 = 10.0 / 60000.0
    t0 = 45.0 + 273.15
    rho0 = FluidProperties.get_density("water", t0)
    mu0 = FluidProperties.get_viscosity("water", t0)
    
    dp_1 = res.calculate_delta_p(q0, rho0, mu0)
    dp_2 = res.calculate_delta_p(2.0 * q0, rho0, mu0)
    assert math.isclose(dp_2, 2.0 * dp_1, rel_tol=1e-5), f"Laminar scaling failed: {dp_2} != {2.0 * dp_1}"
    
    # Double viscosity => double pressure drop
    dp_visc = res.calculate_delta_p(q0, rho0, 2.0 * mu0)
    assert math.isclose(dp_visc, 2.0 * dp_1, rel_tol=1e-5), f"Laminar viscosity scaling failed: {dp_visc} != {2.0 * dp_1}"

def test_quadratic_scaling():
    res = CalibratedRestriction(
        name="CR_quad",
        flow_base_lmin=10.0,
        inlet_pressure_base_bar=3.5,
        outlet_pressure_base_bar=1.0,
        temp_base_c=45.0,
        restriction_model="quadratic",
        fluid_type="water"
    )
    
    # Double flow rate => quadruple pressure drop (Quadratic model)
    q0 = 10.0 / 60000.0
    t0 = 45.0 + 273.15
    rho0 = FluidProperties.get_density("water", t0)
    mu0 = FluidProperties.get_viscosity("water", t0)
    
    dp_1 = res.calculate_delta_p(q0, rho0, mu0)
    dp_2 = res.calculate_delta_p(2.0 * q0, rho0, mu0)
    assert math.isclose(dp_2, 4.0 * dp_1, rel_tol=1e-5), f"Quadratic flow scaling failed: {dp_2} != {4.0 * dp_1}"

def test_graph_parser_calibrated_restriction():
    node_data = ReactFlowNode(
        id="cr_node_1",
        type="calibrated_restriction",
        position={"x": 10.0, "y": 20.0},
        data={
            "label": "Calibrated Restriction 1",
            "flow_base_lmin": 15.0,
            "inlet_pressure_base_bar": 4.0,
            "outlet_pressure_base_bar": 1.5,
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
    print("GraphParser successfully created CalibratedRestriction instance!")

if __name__ == "__main__":
    test_calibrated_restriction_calibration()
    test_laminar_scaling()
    test_quadratic_scaling()
    test_graph_parser_calibrated_restriction()
    print("All Calibrated Restriction tests passed successfully!")
