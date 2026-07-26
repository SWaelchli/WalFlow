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
   uvicorn backend.main:app --reload --port 8000
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
Create a new file in `backend/simulation/equipment/<name>.py`. Your class must inherit from `HydraulicNode`.

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

#### Step B: Register in Graph Parser
Open `backend/simulation/graph_parser.py` and:
1. Import your new class.
2. Add a case in the `create_node` static method to instantiate it from the incoming JSON node data:

```python
elif t == 'new_equipment':
    return NewEquipment(
        name=name,
        param1=float(d.get('param1', 1.0))
    )
```

---

### 2. Frontend Integration (UI & ReactFlow)

#### Step A: Create the Node Component
Create a new React component in `frontend/src/nodes/NewNode.jsx`. Use ReactFlow `Handle` components for port connections:

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
