# WalFlow Development Guide

This guide is intended for developers and contributors looking to understand the architecture of WalFlow, run local development environments, or extend the app with new hydraulic components.

---

## 🛠️ Local Development Setup

### Backend (Python & FastAPI)

1. **Navigate to the root directory and set up a Python virtual environment:**
   ```bash
   python -m venv .venv
   # Windows (PowerShell):
   .\.venv\Scripts\Activate.ps1
   # Linux/macOS:
   source .venv/bin/activate
   ```

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Start the FastAPI server with reload:**
   ```bash
   uvicorn main:app --app-dir backend --reload --port 8000
   ```
   The backend API and WebSocket endpoints will be available at `http://localhost:8000`.

### Frontend (React & Vite)

1. **Navigate to the frontend directory:**
   ```bash
   cd frontend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the Vite development server:**
   ```bash
   npm run dev
   ```
   The frontend will run at `http://localhost:5173` and connect automatically to `ws://localhost:8000/ws/simulate`.

4. **Linting & Code Quality:**
   ```bash
   npm run lint
   ```

---

## 🧩 How to Add New Equipment

Adding a new hydraulic component to WalFlow requires updating both the physics engine (**Backend**) and the visual canvas (**Frontend**).

### 1. Backend Integration (Physics Engine)

#### Step A: Create the Equipment Class
Create a new file in `backend/simulation/equipment/<name>.py`. First, decide the ports:

- **Neutral ports:** for a two-port component whose law is the same in both flow directions (orifice, filter, calibrated restriction).
  - Inherit from `InlineNode` and implement only `calculate_delta_p`, which must be odd in Q.
  - There are no ports to add and no `calculate()`.
  - The parser makes the component a `ComponentLink` edge between two hidden junctions at its ports, and the solved flow sign picks the upstream port. See `backend/simulation/equipment/component_link.md` and the `equipment-creation` skill (Archetype 1).
- **Role ports:** for anything whose physics depends on the direction.
  - Inherit from `HydraulicNode` and add inlets and outlets, as in the example below.
  - A line must run from an outlet to an inlet.

Do not add a "reversed" flag to a role-port component to imitate neutrality.

```python
from simulation.equipment.base_node import HydraulicNode

class NewEquipment(HydraulicNode):
    def __init__(self, name: str, param1: float):
        # node_type must match the frontend type string
        super().__init__(name, node_type="new_equipment")
        self.param1 = param1
        
        # Define inlet and outlet ports
        self.add_inlet()
        self.add_outlet()

    def calculate(self):
        """Mandatory: Update outlet state based on inlet conditions and physics."""
        inlet = self.inlets[0]
        outlet = self.outlets[0]
        
        # Implement hydraulic calculations (e.g., pressure drop)
        dp = self.param1 * (inlet.flow_rate ** 2)
        
        outlet.pressure = inlet.pressure - dp
        outlet.flow_rate = inlet.flow_rate
        # Always propagate fluid properties
        outlet.density = inlet.density
        outlet.viscosity = inlet.viscosity
        
        # Mandatory: Calculate temperature propagation/change
        self.calculate_temperature()
        return dp
```

No analytical `calculate_dp_derivative` is needed: the solver differentiates every component numerically except pipes and pumps.

#### Step A.2: Solver Stability Guidelines
To ensure compatibility with the high-speed Newton solver:
1. **Laminar Viscosity Derivatives:** If a component includes a viscous correction multiplier of the form $(1 + C / \text{Re})$ (e.g., porous filters, orifices), the pressure drop behaves as $dp \propto (q|q| + C' q)$ in the laminar regime. Its exact derivative is proportional to $(2|q| + C')$, **not** $(2|q| + 2C')$. Ensure you derive the viscosity-corrected term carefully.
2. **Smooth Blending & Continuous Curves ($C^0$ and $C^1$ Continuity):** Avoid step jumps or conditional branch discontinuities in pressure drop formulas or correction factors (e.g., hard-coding a cut-off boundary like `if Re >= 2000` which introduces a step change in viscosity multipliers). Ensure all curves are asymptotically continuous or smoothly blended (e.g., blending over a transitional range like $\text{Re} \in [2000, 4000]$).
3. **Uncapped & Recoverable Curves for Derivatives:** Never cap pressure drop curves (like `max(0.0, dp)` for pumps or control valves) or make derivatives zero when operating limits are exceeded. The analytical derivative must remain active and continuous across all flow rates (even negative flow) to provide a smooth gradient that guides the Newton solver back to the valid physical domain during intermediate iterations.
4. **Fischer-Burmeister Complementarity (MCP) for Dynamic Closed Components:** Do not use high linear resistances (like $R = 10^{10}$) for dynamic closed components like check valves or active relief valves. Instead, set `self.use_mcp_formulation = True` in your component's constructor and compute the open pressure drop as a value (`open_seat_dp(cv, q, rho, mu)` from `check_valve.py` for a Cv seat; `open_dp` on a relief device). The solver will automatically evaluate using the Fischer-Burmeister smooth C-function:
   $$\Phi(a, b) = \sqrt{a^2 + b^2 + \epsilon^2} - (a + b) = 0$$
   where $a = Q / Q_{scale}$ and $b = (P_{cracking} + \Delta P_{friction} - \Delta P_{valve}) / P_{scale}$.
5. **Dynamic Topology Reduction for Static Inactive Components:** Components that block flow completely when inactive (like positive displacement pumps or forced-closed valves) should set `self.blocks_flow_on_shutdown = True` in their constructor. The solver will automatically perform DFS reachability analysis and leaf pruning to isolate and prune these inactive branches, preventing singular matrices and numerical collinearity.
6. **Classification Attributes on base node:** When implementing new equipment, make sure to explicitly override the following boolean attributes in your node class:
   - `is_pressure_boundary`: Set `True` if it is a constant pressure boundary (e.g. `Tank`, `PressureBoundary`).
   - `blocks_flow_on_shutdown`: Set `True` if it blocks all flow when inactive.
   - `use_mcp_formulation`: Set `True` if it models dynamic closed-to-open logic using complementarity equations.
   - `is_relief_driver`: Set `True` if the equipment drives the system pressure (pump, source). The relief analysis then ramps it with a factor λ (0 = at rest, 1 = case value) to find the steady state at which each relief device reaches its set pressure. Also implement `apply_relief_ramp(lam)` (scale your driving parameters, keep the case values) and `reset_relief_ramp()` (restore them), and add the type to `RELIEF_DRIVER_TYPES` in `frontend/src/constants/case_constants.js` so the "Ramp during relief analysis" option (`relief_ramp_enabled`) appears in the setup panel.
7. **Analytical Jacobians for Fallback Solvers:** When falling back to Scipy's dense solvers (`root` with `method='lm'` or `method='hybr'`), always pass a dense-wrapped analytical Jacobian (`jac=dense_jacobian` where `dense_jacobian = lambda x: calculate_jacobian(x).toarray()`). This avoids slow numerical finite-difference approximations, keeping fallback solves under ~600ms on large systems.
8. **No Dynamic Time-Steps:** All equations must represent steady-state algebraic relations. Do not integrate over time.
9. **Newton Discontinuity Elimination:** Do not check dynamic thresholds (like checking if pressure exceeds set pressure) during Newton solver iterations (`update_state=False`). Perform popping or bursting status updates only when `update_state=True` (during telemetry and post-solve state updates). During solver iterations, use static state flags (e.g. `_was_open` or `is_burst`) to maintain a smooth and continuous Jacobian.
10. **Open Flow Coefficient for Closed State MCP:** When closed, the Fischer-Burmeister complementarity function evaluates pressure drops using open friction characteristics. Ensure the open pressure drop uses the fully open flow coefficient (e.g. `self.cv`), rather than state-dependent effective flow coefficients, to prevent extremely stiff derivatives when the device is closed.
11. **Solver Backtracking Depth:** Highly non-linear network systems require sufficient line-search backtracking depth (at least 25 steps) to successfully step through intermediate high-resistance transitions without failing to decrease the residual.
12. **Pruned Node Pressure Propagation:** `_fill_pruned_pressures` carries the solved pressures at zero flow into the nodes left out of the solve, side by side (each node has an inlet and an outlet side). `_carry_at_rest` does the carrying for both this step and the stagnant step: unchanged along a pipe, across a device by its zero-flow rise or drop in either direction (`_get_node_p_out`, inverted by `_p_in_at_rest`). Device state is refreshed once from the final pressures. Blocking devices (`blocks_at_rest`: closed relief devices, stopped PD pumps) pass no pressure from one side to the other, so each side takes its own neighbour's pressure; the outlet of a closed relief device takes its downstream pressure. `is_pressure_reference` is the test for a node that fixes a circuit (pruning, islands); the stagnant step anchors only on pressure boundaries and flowing edges, since a flow source at zero flow fixes no pressure.
15. **Stagnant Sections:** A section shut in by blocking devices (stopped PD pump, check valve without flow, closed relief device) has no pressure in the equations. `_assign_stagnant_pressures` sets it from the strongest leak path (stopped pump to its suction, then check valve, then relief seat; highest pressure on a tie), carries it through the section with `_carry_at_rest` (a running pump keeps its shutoff head) and shifts it so that no check valve opens and no relief device lifts, and flags the ports `stagnant`. Leakage never lifts an 'auto' relief device (also while the relief passes hold it closed, `NetworkSolver.held_closed_ids`); in the unmitigated pass the device has failed and the section takes the full leak-path pressure. If a check valve pushes a section above a set pressure, the check valve wins so the breach stays visible. A new check valve type goes into `CHECK_VALVE_TYPES` in `solver.py` and needs `cracking_pressure_bar`.
13. **Sign Convention of `calculate_delta_p`:** Pressure drop must be an odd function of flow: use `q * abs(q)`, never `q**2`. An even function makes a branch with reversed flow act as a pressure source and breaks the Jacobian (its derivative `2*c*|q|` is even, so the function must be odd). Test it with `calculate_delta_p(+q) == -calculate_delta_p(-q)`.
14. **Relief State Is Restored:** `run_sequential_relief_simulation` changes `forced_state` of relief devices during its passes and restores it in a `finally`. If you add another analysis that temporarily mutates shared node state, do the same, because the WebSocket reuses the network between runs.

#### Step B: Register in Graph Parser
Open `backend/simulation/graph_parser.py` and:
1. Import your new class.
2. Add a case in the `_build_node` static method (the `elif` chain behind `create_node`) to instantiate it from the incoming JSON node data. `create_node` wraps it: an empty or non-numeric field (`ValueError`/`TypeError`) is turned into a `ModelInputError` that names the component, so plain `float(d.get(...))` is fine here:

```python
elif t == 'new_equipment':
    return NewEquipment(
        name=name,
        param1=float(d.get('param1', 1.0))
    )
```
3. If a parameter is used as a divisor or must be positive (rated flow, diameter), check it in `_check_node_geometry` and raise `ModelInputError("'<name>': ... must be above 0 ...")`. The message is shown to the user unchanged, so keep it readable. Never let such input reach the solver as a `ZeroDivisionError`.

---

### 2. Frontend Integration (UI & ReactFlow)

#### Step A: Create the Node Component
Create a new React component in `frontend/src/nodes/NewNode.jsx`. Use ReactFlow `Handle` components for port connections. Use `inlet-k` / `outlet-k` for role ports. For neutral ports, use `port-0` / `port-1` with `className="handle-neutral"`, register the type in `NEUTRAL_TYPES` (`utils/networkValidation.js`), and read `telemetry.ports` (see `OrificeNode.jsx`).

```jsx
import { Handle, Position } from 'reactflow';

export default function NewNode({ data }) {
  const telemetry = data.telemetry || {};
  
  return (
    <div className="custom-node">
      <Handle type="target" position={Position.Left} id="inlet-0" />
      <div>
        <strong>{data.label}</strong>
        {/* Display live telemetry if available */}
        <div className="telemetry-text">
          {telemetry.p_in_bar?.toFixed(2)} bar
        </div>
      </div>
      <Handle type="source" position={Position.Right} id="outlet-0" />
    </div>
  );
}
```

#### Step B: Register Node Type
In `frontend/src/App.jsx`:
1. Import your new node component.
2. Add it to the `nodeTypes` map object.
3. Update the `onDrop` handler to include default parameters in the `data` object for your new node type.

#### Step C: Add to Sidebar Library
In `frontend/src/Sidebar.jsx`, add an entry to the `equipmentTypes` array so the item appears in the drag-and-drop component library.

#### Step D: Add Property Controls
In `frontend/src/PropertyEditor.jsx`, add a conditional section for your `type` to render user input fields (labels, numeric parameters, selections) required to edit the component's properties.

#### Step E: Implement a Detail Component (Optional)
If your equipment requires custom telemetry visualisations (such as operating curves or efficiency charts), create a component in `frontend/src/details/NewEquipmentDetails.jsx`:

```jsx
import React from 'react';

export default function NewEquipmentDetails({ node }) {
  const { telemetry } = node.data;
  return (
    <div>
      {/* Custom visual charts or data tables */}
    </div>
  );
}
```

Then register it in `frontend/src/DetailPanel.jsx`:
1. Import your new details component.
2. Add a `case` for your `node_type` in the `renderContent` switch statement.

*(Note: If no custom detail component is provided, `GenericDetails` will automatically display standard pressure and flow telemetry).*

---

## 🏗️ Architecture & Solver Model

* **Steady-State Static Solver:** WalFlow solves static hydraulic equilibrium ($P, Q, T$) instantly without time-stepping ($\Delta t = 0$).
* **Data Flow:** ReactFlow canvas graph $\rightarrow$ WebSocket JSON payload $\rightarrow$ Python Graph Parser & Matrix Solver $\rightarrow$ WebSocket telemetry stream $\rightarrow$ React UI state update.
