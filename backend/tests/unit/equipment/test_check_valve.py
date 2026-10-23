

from simulation.equipment.check_valve import CheckValve
from simulation.schemas import ReactFlowNode
from simulation.graph_parser import GraphParser


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
