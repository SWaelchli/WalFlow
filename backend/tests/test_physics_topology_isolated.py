import sys
import os
import pytest
import math

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from simulation.equipment.tank import Tank
from simulation.equipment.pipe import Pipe
from simulation.equipment.linear_control_valve import LinearControlValve
from simulation.equipment.orifice import Orifice
from simulation.schemas import HydraulicNetwork
from simulation.solver import NetworkSolver


def test_disconnected_floating_subgraph_resilience():
    """
    Test that floating unlinked components placed on the canvas are cleanly pruned
    and do not cause solver singularity or crashes.
    """
    # Main active circuit
    tank1 = Tank("Tank1", elevation=0.0, fluid_level=20.0)
    tank2 = Tank("Tank2", elevation=0.0, fluid_level=1.0)
    pipe1 = Pipe("Pipe1", length=15.0, diameter=0.05)
    
    # Isolated unlinked components on the canvas
    floating_orifice = Orifice("FloatingOrifice", pipe_diameter=0.05, orifice_diameter=0.02)
    floating_valve = LinearControlValve("FloatingValve", max_cv=25.0)
    
    network = HydraulicNetwork(
        nodes={
            "Tank1": tank1,
            "Tank2": tank2,
            "FloatingOrifice": floating_orifice,
            "FloatingValve": floating_valve
        },
        edges=[
            {"id": "e1", "source": "Tank1", "target": "Tank2", "pipe": pipe1}
        ]
    )
    
    solver = NetworkSolver(network)
    solver.solve()
    
    # Verify main circuit solved correctly
    assert tank1.outlets[0].flow_rate > 0
    assert math.isclose(tank1.outlets[0].flow_rate, tank2.inlets[0].flow_rate, rel_tol=1e-3)


def test_zero_flow_fully_closed_valve():
    """
    Test numerical stability when a valve is 100% closed (0% opening),
    ensuring zero-flow conditions without division-by-zero or NaN residuals.
    """
    tank1 = Tank("Tank1", elevation=0.0, fluid_level=40.0)
    tank2 = Tank("Tank2", elevation=0.0, fluid_level=1.0)
    
    valve = LinearControlValve("ClosedValve", max_cv=50.0)
    valve.opening_pct = 0.0  # Fully closed deadhead
    
    pipe1 = Pipe("Pipe1", length=10.0, diameter=0.05)
    pipe2 = Pipe("Pipe2", length=10.0, diameter=0.05)
    
    network = HydraulicNetwork(
        nodes={
            "Tank1": tank1,
            "ClosedValve": valve,
            "Tank2": tank2
        },
        edges=[
            {"id": "e1", "source": "Tank1", "target": "ClosedValve", "pipe": pipe1},
            {"id": "e2", "source": "ClosedValve", "target": "Tank2", "pipe": pipe2}
        ]
    )
    
    solver = NetworkSolver(network)
    solver.solve()
    
    # In a deadheaded closed line, flow rate should be virtually zero
    q_flow = tank1.outlets[0].flow_rate
    assert abs(q_flow) < 1e-4, f"Expected near-zero flow through closed valve, got {q_flow}"
