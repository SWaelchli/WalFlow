import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from simulation.equipment.check_valve_orifice import CheckValveOrifice
from simulation.schemas import ReactFlowNode
from simulation.graph_parser import GraphParser

def test_check_valve_orifice_physics():
    cvo = CheckValveOrifice(
        name="CVO_1",
        cv=10.0,
        cracking_pressure_bar=0.05,
        pipe_diameter=0.1,
        orifice_diameter=0.01
    )
    
    # Forward sub-cracking / orifice flow (low flow)
    dp_sub = cvo.calculate_delta_p(flow_rate=0.0001, density=1000.0)
    print(f"Sub-cracking forward dP: {dp_sub / 1e5:.5f} bar")
    assert dp_sub > 0, "Sub-cracking forward flow should have positive dP across orifice"

    # Reverse backflow through orifice
    dp_rev = cvo.calculate_delta_p(flow_rate=-0.0001, density=1000.0)
    print(f"Reverse backflow dP across orifice: {dp_rev / 1e5:.5f} bar")
    assert dp_rev < 0, "Reverse flow should have negative dP through orifice"

    # Forward flow above cracking pressure
    dp_open = cvo.calculate_delta_p(flow_rate=0.001, density=1000.0)
    print(f"Open forward dP: {dp_open / 1e5:.4f} bar")
    assert dp_open >= 0.05 * 1e5, "Open forward flow dP should exceed cracking pressure"

def test_graph_parser_check_valve_orifice():
    node_data = ReactFlowNode(
        id="cvo_node_1",
        type="check_valve_orifice",
        position={"x": 0.0, "y": 0.0},
        data={
            "label": "Check Valve w/ Orifice 1",
            "cv": 12.0,
            "cracking_pressure_bar": 0.08,
            "pipe_diameter": 0.1,
            "orifice_diameter": 0.015
        }
    )
    parsed_node = GraphParser.create_node(node_data)
    assert isinstance(parsed_node, CheckValveOrifice)
    assert parsed_node.cv == 12.0
    assert parsed_node.cracking_pressure_bar == 0.08
    assert parsed_node.orifice_diameter == 0.015
    print("GraphParser created CheckValveOrifice instance successfully!")

if __name__ == "__main__":
    test_check_valve_orifice_physics()
    test_graph_parser_check_valve_orifice()
    print("All Check Valve w/ Orifice tests passed successfully!")
