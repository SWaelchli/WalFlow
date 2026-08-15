import sys
import os
import pytest
import numpy as np
import math

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from simulation.equipment.remote_control_valve import RemoteControlValve
from simulation.equipment.tank import Tank
from simulation.equipment.pipe import Pipe
from simulation.schemas import HydraulicNetwork, ReactFlowGraph
from simulation.solver import NetworkSolver
from simulation.graph_parser import GraphParser


def test_remote_control_valve_init_and_derivatives():
    """Verify initialization and derivative calculation consistency for RemoteControlValve."""
    rcv = RemoteControlValve(name="PCV-001", max_cv=50.0, set_pressure=300000.0)
    rcv.opening_pct = 75.0
    
    flow_rate = 0.005  # m3/s (~18 m3/h)
    density = 1000.0
    viscosity = 0.001
    
    dp = rcv.calculate_delta_p(flow_rate, density, viscosity)
    assert dp > 0, "Pressure drop across valve must be positive for positive forward flow"
    
    # Check analytical derivative against central finite difference
    analytical_deriv = rcv.calculate_dp_derivative(flow_rate, density, viscosity)
    dq = 1e-7
    dp_plus = rcv.calculate_delta_p(flow_rate + dq, density, viscosity)
    dp_minus = rcv.calculate_delta_p(flow_rate - dq, density, viscosity)
    numerical_deriv = (dp_plus - dp_minus) / (2.0 * dq)
    
    assert math.isclose(analytical_deriv, numerical_deriv, rel_tol=1e-2), (
        f"Analytical derivative ({analytical_deriv}) does not match numerical ({numerical_deriv})"
    )


def test_remote_control_valve_network_downstream_regulation():
    """
    Test steady-state simulation where an RCV throttles to maintain a set pressure
    at a downstream node.
    
    Topology:
      Tank 1 (fluid_level=50m -> ~5 bar static head)
        -> Pipe 1
        -> RCV (set_pressure = 2.0 bar at Tank 2)
        -> Pipe 2
        -> Tank 2 (fluid_level=1m -> ~0.1 bar static head)
    """
    tank1 = Tank("Tank1", elevation=0.0, fluid_level=50.0)
    tank2 = Tank("Tank2", elevation=0.0, fluid_level=1.0)
    
    rcv = RemoteControlValve("PCV-100", max_cv=100.0, set_pressure=200000.0)
    rcv.remote_sensing_config = {"node_id": "Tank2", "port_type": "inlet", "port_idx": 0}
    
    pipe1 = Pipe("Pipe1", length=20.0, diameter=0.05)
    pipe2 = Pipe("Pipe2", length=20.0, diameter=0.05)
    
    network = HydraulicNetwork(
        nodes={"Tank1": tank1, "RCV": rcv, "Tank2": tank2},
        edges=[
            {"id": "e1", "source": "Tank1", "target": "RCV", "pipe": pipe1},
            {"id": "e2", "source": "RCV", "target": "Tank2", "pipe": pipe2}
        ]
    )
    
    solver = NetworkSolver(network)
    solver.solve()
    
    # Verify mass balance (flow out of tank 1 == flow into tank 2)
    q_in = tank1.outlets[0].flow_rate
    q_out = tank2.inlets[0].flow_rate
    assert math.isclose(q_in, q_out, rel_tol=1e-3), f"Mass balance mismatch: {q_in} vs {q_out}"
    assert q_in > 0, "Fluid must flow from high pressure to low pressure tank"
    
    # Verify valve has throttled to a valid physical opening
    assert 0.0 < rcv.opening_pct <= 100.0


def test_graph_parser_signal_edge_handling():
    """Verify that GraphParser correctly attaches remote_sensing_config without creating hydraulic pipes."""
    rf_data = {
        "nodes": [
            {"id": "tank_src", "type": "tank", "position": {"x": 0, "y": 0}, "data": {"elevation": 10.0, "fluid_level": 2.0, "fluid": "water", "temperature": 20.0}},
            {"id": "rcv_1", "type": "remote_control_valve", "position": {"x": 100, "y": 0}, "data": {"max_cv": 50.0, "set_pressure": 2.5}},
            {"id": "tank_dst", "type": "tank", "position": {"x": 200, "y": 0}, "data": {"elevation": 0.0, "fluid_level": 1.0, "fluid": "water", "temperature": 20.0}}
        ],
        "edges": [
            {"id": "e_pipe1", "source": "tank_src", "target": "rcv_1", "type": "standard", "data": {"diameter": 0.05, "length": 10}},
            {"id": "e_pipe2", "source": "rcv_1", "target": "tank_dst", "type": "standard", "data": {"diameter": 0.05, "length": 10}},
            {
                "id": "e_sig1",
                "source": "tank_dst",
                "target": "rcv_1",
                "sourceHandle": "inlet-0",
                "targetHandle": "remote_sensing",
                "type": "signal",
                "data": {"type": "SIGNAL", "isSignal": True}
            }
        ]
    }
    
    rf_graph = ReactFlowGraph(**rf_data)
    network = GraphParser.parse_graph(rf_graph)
    
    assert len(network.nodes) == 3
    # Exactly 2 physical hydraulic pipes, signal edge must NOT be in physical edges
    assert len(network.edges) == 2
    
    rcv_node = network.nodes["rcv_1"]
    assert isinstance(rcv_node, RemoteControlValve)
    assert rcv_node.remote_sensing_config is not None
    assert rcv_node.remote_sensing_config["node_id"] == "tank_dst"
