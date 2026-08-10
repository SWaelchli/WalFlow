import sys
import os

# Add backend directory to sys.path
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from simulation.equipment.check_valve import CheckValve
from simulation.schemas import ReactFlowNode, ReactFlowGraph
from simulation.graph_parser import GraphParser

def test_check_valve_forward_and_reverse():
    cv = CheckValve(name="CV_1", cv=10.0, cracking_pressure_bar=0.05)
    
    # Forward flow (Q = 0.001 m3/s = 60 L/min)
    dp_forward = cv.calculate_delta_p(flow_rate=0.001, density=1000.0)
    cracking_pa = 0.05 * 1e5
    assert dp_forward > cracking_pa, f"Forward dP {dp_forward} should exceed cracking pressure {cracking_pa}"
    print(f"Forward dP for 60 L/min: {dp_forward / 1e5:.4f} bar (Cracking: 0.05 bar)")
    
    # Reverse flow (Q = -0.001 m3/s)
    dp_reverse = cv.calculate_delta_p(flow_rate=-0.001, density=1000.0)
    assert dp_reverse < 0, f"Reverse dP {dp_reverse} should be strongly negative (resisting backflow)"
    print(f"Reverse dP for -60 L/min backflow: {dp_reverse / 1e5:.4f} bar (High backflow resistance)")

def test_graph_parser_check_valve():
    node_data = ReactFlowNode(
        id="cv_node_1",
        type="check_valve",
        position={"x": 0.0, "y": 0.0},
        data={"label": "Check Valve 1", "cv": 15.0, "cracking_pressure_bar": 0.1}
    )
    parsed_node = GraphParser.create_node(node_data)
    assert isinstance(parsed_node, CheckValve)
    assert parsed_node.cv == 15.0
    assert parsed_node.cracking_pressure_bar == 0.1
    print("GraphParser successfully created CheckValve instance with custom parameters!")

if __name__ == "__main__":
    test_check_valve_forward_and_reverse()
    test_graph_parser_check_valve()
    print("All Check Valve tests passed successfully!")
