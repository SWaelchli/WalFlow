import pytest
from simulation.schemas import ReactFlowGraph, ReactFlowNode, ReactFlowEdge, GlobalSettings, OperatingCase, OperatingCaseOverrides
from simulation.graph_parser import GraphParser
from simulation.solver import NetworkSolver

def test_resolve_graph_for_case_overrides():
    """
    Tests that GraphParser.resolve_graph_for_case correctly applies node and global overrides
    when resolving an operating case.
    """
    # 1. Setup Base ReactFlowGraph
    node_valve = ReactFlowNode(
        id="valve_1",
        type="linear_control_valve",
        position={"x": 0, "y": 0},
        data={"label": "Control Valve", "opening": 50.0, "max_cv": 0.05}
    )
    
    global_settings = GlobalSettings(ambient_temperature=293.15)
    
    # 2. Setup Operating Cases
    base_case = OperatingCase(
        id="case_base",
        name="Base Case",
        is_base=True,
        overrides=OperatingCaseOverrides()
    )
    
    cold_start_case = OperatingCase(
        id="case_cold_start",
        name="Cold Start Case",
        is_base=False,
        overrides=OperatingCaseOverrides(
            global_settings={"ambient_temperature": 283.15},
            nodes={"valve_1": {"opening": 100.0}}
        )
    )
    
    graph = ReactFlowGraph(
        nodes=[node_valve],
        edges=[],
        global_settings=global_settings,
        cases=[base_case, cold_start_case],
        active_case_id="case_cold_start"
    )
    
    # 3. Resolve graph for cold start case
    resolved = GraphParser.resolve_graph_for_case(graph, "case_cold_start")
    
    # Assert global setting was overridden (283.15 K)
    assert resolved.global_settings.ambient_temperature == 283.15
    
    # Assert node opening was overridden (100.0)
    target_node = next(n for n in resolved.nodes if n.id == "valve_1")
    assert target_node.data["opening"] == 100.0
    # Global property max_cv remains untouched
    assert target_node.data["max_cv"] == 0.05

def test_parse_graph_with_operating_cases():
    """
    Tests that GraphParser.parse_graph instantiates equipment nodes using resolved case values.
    """
    tank_node = ReactFlowNode(
        id="tank_1",
        type="tank",
        position={"x": 0, "y": 0},
        data={"label": "Main Tank", "temperature": 293.15, "level": 1.0}
    )
    
    hot_case = OperatingCase(
        id="case_hot",
        name="Hot Case",
        is_base=False,
        overrides=OperatingCaseOverrides(
            nodes={"tank_1": {"temperature": 348.15}}
        )
    )
    
    graph = ReactFlowGraph(
        nodes=[tank_node],
        edges=[],
        cases=[hot_case],
        active_case_id="case_hot"
    )
    
    network = GraphParser.parse_graph(graph, "case_hot")
    parsed_tank = network.nodes["tank_1"]
    
    assert parsed_tank.temperature == 348.15
