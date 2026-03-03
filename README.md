Copyright (c) 2026 Sebastian Waelchli (https://swaelchli.com). All rights reserved. Licensed under the PolyForm Noncommercial License.

# WalFlow
WalFlow is a web-based hydraulic simulator. Drag and drop rotating equipment, valves, and pipes to build interactive PFDs and instantly simulate real-time network operating conditions.


# App Strategy

I want to vibe code an app with the help of Google AI Studio. Help me develope a strategy prompt to use as input in AI Studio.

Description of the App that I already have is below. Please help me expand and refine the strategy

## Functionallity.

* Draw PFD of hydraulic systems
* App has a library of different equipment, such as pumps, filters, valves, tanks, etc., pipe branching (t-pieces)
	* Allows drag and drop equipments onto PFD.
	* connect the equipments per drag and drop (e.g. outlet of pump to filter)
* Simulate the drawn hydraulic systems in realtime
* Graphical display of operating conditions
* Save and load of simulation models

This app should be a simplified version of ASPEN hysis or Mathworks Simulink, focusing on hydraulic simulations.

see
https://en.wikipedia.org/wiki/Aspen_HYSYS
https://www.mathworks.com/products/simulink.html

## App layout:

* Equipment files (preferably in Python). Each equipment should be one file for a modular approach. Each equipment has at least one inlet and one outlet. Depending on it's exact reallife funcitonality. These inlet and outlets can be connected to other equipment.
* Simulation Engine. Is doing the calulations of the hydraulic simulation. (preferably in Python). Based on how the equipment is connected to eachother.
* GUI: Suggest a programming language that is best suited to create a graphical user interface.
the GUI should allow on adding equipment, connecting it to eachother, starting, stoping the simulation, save and load files and also displays the operating conditions.

The app should be modularized and easaly to maintain and expand. 

---


# Hydraulic System Simulator: Development Roadmap

**Tech Stack:** * Backend: Python 3.10+, FastAPI, Pydantic, NumPy, SciPy
* Frontend: React, React Flow, Axios
* Architecture: WebSocket-driven real-time node simulation

## Master Roadmap

## Stage 1: Setting up the Initial App (MVP) [COMPLETED]
**Goal:** Create a foundational Python backend to simulate physics and a React frontend to control it.

### Phase 1: Backend Data Structures & The "Dumb" Physics [x]
*Goal: Establish the object-oriented structure for the hydraulic components without worrying about the solver or UI.*
* **Initialize the Python Environment:** [x] Set up a clean Python project. Install `fastapi`, `pydantic`, `numpy`, and `scipy`.
* **Define the `Port` Class:** [x] Create a model for a port holding state variables: Pressure ($P$), Flow Rate ($Q$), and fluid properties (density).
* **Create the `HydraulicNode` Base Class:** [x] Parent class for all equipment with standard methods for calculating pressure drop/head.
* **Build Static Components:** [x] Write `Tank` (boundary condition), `Pipe` (resistance), and `Orifice` classes.

### Phase 2: The Core Simulation Engine (The Solver) [x]
*Goal: Write the algorithm that figures out the operating conditions of a connected network.*
* **Energy Balance Logic:** [x] The sum of pressure drops and gains around a closed loop must be zero.
* **The Iterative Solver:** [x] Use `scipy.optimize.root` (Levenberg-Marquardt) to guess flow rates, calculate resulting pressures, and iterate until the system converges.

### Phase 3: Active Rotating Equipment [x]
*Goal: Introduce complex physics into the solver.*
* **The `Pump` Class:** [x] Implement centrifugal pump logic calculating generated head based on a quadratic performance curve.
* **The `Valve` Class:** [x] Implement a control valve using a Flow Coefficient ($C_v$) to determine variable pressure drop.

### Phase 4: The FastAPI & WebSocket Layer [x]
*Goal: Expose the simulation engine so a frontend can interact with it.*
* **REST Endpoints:** [x] Create standard health-check routes.
* **WebSocket Endpoint:** [x] Create a `ws://` endpoint to receive commands (e.g., valve throttling) and broadcast calculated $P$ and $Q$ values in real-time.

### Phase 5: The React Flow Frontend Canvas [x]
*Goal: Build the interactive Process Flow Diagram (PFD) interface.*
* **Initialize React:** [x] Set up Vite with `reactflow` and `axios`.
* **Create Custom Nodes:** [x] Build visually distinct React components for `Tank`, `Pump`, `Orifice`, and `Valve` (including an HTML range slider).
* **Canvas Layout:** [x] Render the equipment on a gridded, interactive workspace.

### Phase 6: Integration & Finalization [x]
*Goal: Connect the visual canvas to the mathematical engine and lock in the MVP.*
* **The Real-Time Loop:** [x] Wire the React valve slider to the FastAPI WebSocket to trigger real-time SciPy calculations and display the updated flow rate on the UI.

---

## Stage 2: The Dynamic Engineering Tool [IN PROGRESS]
**Goal:** Evolve the MVP into a legitimate sizing and troubleshooting utility for API 614 lube oil systems.

### Phase 7: The Dynamic Graph Engine [x]
*Goal: Demolish the hardcoded backend and replace it with an engine that mathematically reads and interprets the React Flow canvas.*
* **JSON Graph Parsing:** [x] Write a FastAPI endpoint that accepts the full array of nodes and edges from React Flow and dynamically instantiates Python objects on the fly.
* **Edge as a Pipe:** [x] Upgrade the edge logic so every drawn line represents a physical `Pipe` object with user-defined length and diameter.
* **State Propagation (Node-to-Node Math):** [x] Mathematically chain the objects so the calculated outlet state of one node feeds directly into the inlet state of the next ($P_{in, n+1} = P_{out, n}$).

### Phase 8: Parallel Networks & Junctions [x]
*Goal: Evolve the solver from a simple 1D series circuit to a complex network capable of handling headers and branches.*
* **Junction Nodes (Tees and Manifolds):** [x] Create `Splitter` and `Mixer` nodes to handle flow division (e.g., supplying thrust and journal bearings simultaneously).
* **Kirchhoff's Flow Logic:** [x] Upgrade the SciPy solver to guess pressures at every junction, ensuring the sum of flows entering a tee exactly equals the flows leaving it.

### Phase 9: Lube Oil Specific Physics [x]
*Goal: Introduce the thermodynamics and specialized equipment required for compressor lubrication.*
* **Dynamic Viscosity & Temperature:** [x] Update the `Port` class to track Temperature ($T$). Implement viscosity-temperature curves so cold startups dynamically increase system friction.
* **Heat Exchanger Node:** [x] Create a component that removes heat and calculates tube-bundle pressure drop.
* **Filter Node:** [x] Implement duplex filters allowing input of "clean" vs "dirty" $\Delta P$ to simulate clogging.
* **Bi-directional Propagation:** [x] Upgrade the solver and equipment classes to correctly propagate thermal and fluid properties even during reverse flow.

### Phase 10: Frontend Integration & Canvas UX [x]
*Goal: Polish the frontend into a professional CAD environment and prepare the application for self-hosted deployment.*
* **New Equipment Nodes:** [x] Create React Flow visual components for `Heat Exchanger` and `Filter`.
* **The Equipment Library:** [x] Build a drag-and-drop sidebar menu to pull unlimited components onto the canvas.
* **Live Node Telemetry:** [x] Display specific $\Delta P$ or generated head directly inside the visual icons on the canvas.
* **Save/Load Functionality:** [x] Add the ability to download the entire React Flow state and backend parameters as a `.json` file, and upload to restore a specific system design.

### Phase 11: Refining of App & Bug Fixing [ ]
*Goal: Refining and debugging of existing app. Find inconsistencies, missing essential features and layout issues. Resolve the same.*
* **Find Missing Features:** [ ] Finding essential features such as deleting equipment and connections on canvas.
* **Add more visuals:** [ ] In order to make the tool more usable add more live operating data. This has to be aligned in concuntion with Me. Iterate this step with me until satisfactory.
* **Verify Functionalities** [ ] Test and simulate different PFDs by draging equipment from libary into canvas and test their output. Build different test cases.

## Stage 3: The Dynamic Engineering Tool [ ]

* **Containerization:** [ ] Write a `Dockerfile` for the FastAPI backend and the React frontend, orchestrating them with a `docker-compose.yml` file so the finished tool can be easily deployed to a self-hosted Docker environment.

---

# How to Add New Equipment

Adding a new hydraulic component to WalFlow requires updates to both the physics engine (Backend) and the visual canvas (Frontend).

## 1. Backend Integration (Physics)

### Step A: Create the Equipment Class
Create a new file in `backend/simulation/equipment/<name>.py`. Your class must inherit from `HydraulicNode`.

```python
from simulation.equipment.base_node import HydraulicNode

class NewEquipment(HydraulicNode):
    def __init__(self, name: str, param1: float):
        # node_type must match the frontend type string
        super().__init__(name, node_type="new_equipment")
        self.param1 = param1
        
        # Define the number of ports
        self.add_inlet()
        self.add_outlet()

    def calculate(self):
        """Mandatory: Update outlet state based on inlet and physics."""
        inlet = self.inlets[0]
        outlet = self.outlets[0]
        
        # Implement your physics here (e.g., pressure drop)
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

### Step B: Register in Graph Parser
Open `backend/simulation/graph_parser.py` and:
1.  Import your new class.
2.  Add a case in the `create_node` static method to instantiate it from the incoming JSON data.

```python
elif t == 'new_equipment':
    return NewEquipment(
        name=name,
        param1=float(d.get('param1', 1.0))
    )
```

## 2. Frontend Integration (UI)

### Step A: Create the Node Component
Create a new React component in `frontend/src/nodes/NewNode.jsx`. Use the standard `Handle` components for connections.

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

### Step B: Register Node Type
In `frontend/src/App.jsx`:
1.  Import your new node component.
2.  Add it to the `nodeTypes` object.
3.  Update the `onDrop` function to include default parameters in the `data` object for your new type.

### Step C: Add to Sidebar
In `frontend/src/Sidebar.jsx`, add an entry to the `equipmentTypes` array so it appears in the draggable library.

### Step D: Add Property Controls
In `frontend/src/PropertyEditor.jsx`, add a conditional block for your `type` to render the input fields (labels, number inputs, etc.) required to edit your equipment's parameters.
