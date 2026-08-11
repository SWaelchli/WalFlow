# Testing & Verification Guide

Every new hydraulic equipment must be validated with automated unit and network simulation tests.

---

## 1. Test File Structure

Create `backend/tests/test_physics_<name>.py`.

### Required Test Sections:
1. **Calibration Point Test:** Verify equations match known baseline design points.
2. **Derivative Accuracy Test:** Compare analytical derivative against numerical central finite differences.
3. **End-to-End Network Solve:** Connect component into a complete hydraulic loop (Tank $\to$ Pump $\to$ Equipment $\to$ Tank) and solve with `NewtonRaphsonSolver`.

---

## 2. Complete Test Template

```python
import sys
import os
import math
import pytest

# Ensure backend directory is in python path
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from simulation.equipment.custom_equipment import CustomEquipment
from simulation.equipment.tank import Tank
from simulation.equipment.pipe import Pipe
from simulation.equipment.centrifugal_pump import CentrifugalPump
from simulation.fluid_utils import FluidProperties
from simulation.schemas import ReactFlowNode, ReactFlowGraph, ReactFlowEdge
from simulation.graph_parser import GraphParser
from simulation.solver import NewtonRaphsonSolver

def test_component_calibration_and_derivative():
    """
    1. Verify pressure drop at known design flow.
    2. Verify analytical derivative matches numerical finite difference.
    """
    flow_lmin = 60.0
    q0 = flow_lmin / 60000.0  # 0.001 m3/s
    rho0 = 1000.0             # kg/m3 (water)
    mu0 = 0.001               # Pa.s
    
    eq = CustomEquipment(name="TestEq", param1=100.0)
    
    # 1. Test pressure drop
    dp = eq.calculate_delta_p(q0, rho0, mu0)
    assert dp > 0, "Pressure drop must be positive for positive flow"
    
    # 2. Test analytical derivative vs numerical central difference
    analytical_deriv = eq.calculate_dp_derivative(q0, rho0, mu0)
    
    dq = 1e-6
    dp_plus = eq.calculate_delta_p(q0 + dq, rho0, mu0)
    dp_minus = eq.calculate_delta_p(q0 - dq, rho0, mu0)
    numerical_deriv = (dp_plus - dp_minus) / (2.0 * dq)
    
    assert math.isclose(analytical_deriv, numerical_deriv, rel_tol=1e-2), (
        f"Analytical derivative ({analytical_deriv}) differs from numerical ({numerical_deriv})"
    )

def test_network_equilibrium_solve():
    """
    Build a closed loop ReactFlow graph and solve steady-state equilibrium.
    Tank1 -> Pump -> CustomEquipment -> Tank2
    """
    nodes = [
        ReactFlowNode(id="t1", type="tank", data={"label": "Tank 1", "level": 2.0, "elevation": 0.0}),
        ReactFlowNode(id="p1", type="centrifugal_pump", data={"label": "Pump 1", "flow_rated_lmin": 100.0, "pressure_rated_bar": 4.0}),
        ReactFlowNode(id="eq1", type="custom_equipment", data={"label": "Custom Eq", "param1": 100.0}),
        ReactFlowNode(id="t2", type="tank", data={"label": "Tank 2", "level": 1.0, "elevation": 0.0}),
    ]
    
    edges = [
        ReactFlowEdge(id="e1", source="t1", target="p1", data={"diameter": 0.05248, "length": 5.0}),
        ReactFlowEdge(id="e2", source="p1", target="eq1", data={"diameter": 0.05248, "length": 5.0}),
        ReactFlowEdge(id="e3", source="eq1", target="t2", data={"diameter": 0.05248, "length": 5.0}),
    ]
    
    graph = ReactFlowGraph(nodes=nodes, edges=edges)
    network = GraphParser.parse_graph(graph)
    solver = NewtonRaphsonSolver(network)
    
    converged = solver.solve()
    assert converged, "Solver failed to converge on network containing custom equipment"
    
    # Verify telemetry results are physical
    results = solver.get_telemetry()
    assert results is not None
    assert "nodes" in results
    eq_telemetry = results["nodes"].get("eq1")
    assert eq_telemetry is not None
    
    p_in = eq_telemetry["inlets"][0]["pressure"]
    p_out = eq_telemetry["outlets"][0]["pressure"]
    assert p_in > p_out, "Inlet pressure must be greater than outlet pressure"
```

---

## 3. Running Verification Commands

Execute the test suite and frontend linter:

```bash
# 1. Run the specific component test
pytest backend/tests/test_physics_<name>.py -v

# 2. Run the entire backend test suite
pytest

# 3. Verify frontend code quality & syntax
cd frontend && npm run lint
```
