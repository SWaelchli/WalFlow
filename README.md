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

## Phase 1: Backend Data Structures & The "Dumb" Physics
*Goal: Establish the object-oriented structure for the hydraulic components without worrying about the solver or UI.*

1. **Initialize the Python Environment:** Set up a clean Python project. Install `fastapi`, `pydantic`, `numpy`, and `scipy`.
2. **Define the `Port` Class:** Create a Pydantic model or standard Python dataclass for a port. It must hold the state variables: Pressure ($P$), Flow Rate ($Q$), and fluid properties (density, viscosity).
3. **Create the `HydraulicNode` Base Class:** This is the parent class for all equipment. It needs attributes for its inputs and outputs (lists of `Port` objects) and a standard method structure for calculating pressure drop or head.
4. **Build Static Components:** * Write a `Tank` class (acts as a constant pressure boundary condition).
    * Write a `Pipe` class (calculates pressure drop using the Darcy-Weisbach equation or a simplified resistance factor).

## Phase 2: The Core Simulation Engine (The Solver)
*Goal: Write the algorithm that figures out the operating conditions of a connected network.*

1. **Graph Representation:** Write a utility function that takes a list of connected `HydraulicNode` objects and builds an adjacency list or matrix. The engine needs to know what is connected to what.
2. **Mass Balance Logic:** Implement Kirchhoff's First Law for fluid: the sum of flow rates entering any junction (like a T-piece) must equal the flow rates leaving it.
3. **Energy Balance Logic:** The sum of pressure drops and gains around any closed loop must be zero. 
4. **The Iterative Solver:** Use `scipy.optimize.root` or write a custom Newton-Raphson solver. The solver will guess a flow rate $Q$, calculate the resulting pressures across all nodes, check the errors at the boundaries, and iterate until the system converges. 
    * *Testing Step:* Hardcode a simple Tank -> Pipe -> Tank network in a Python script and verify the solver finds the correct flow rate.

## Phase 3: Active Rotating Equipment
*Goal: Introduce complex physics into the solver.*

1. **The `Pump` Class:** Implement the centrifugal pump logic. The class should take its performance curve coefficients ($A, B, C$) and calculate the generated pressure differential based on the solver's current guess for $Q$. 
2. **The `Valve` Class:** Implement a valve that uses a Flow Coefficient ($C_v$) to determine pressure drop based on an adjustable "open percentage."
3. **Integration Testing:** Add the pump and valve to your hardcoded Python test script and ensure the solver still converges.

## Phase 4: The FastAPI & WebSocket Layer
*Goal: Expose your simulation engine so a frontend can talk to it.*

1. **REST Endpoints:** Create standard HTTP `POST` routes in FastAPI to receive a JSON payload of the network layout (the nodes and how they are connected).
2. **WebSocket Endpoint:** Create a `ws://` endpoint. This is crucial for real-time simulation. The backend will run the solver in a continuous loop and broadcast the calculated $P$ and $Q$ values for every node through this WebSocket connection.

## Phase 5: The React Flow Frontend Canvas
*Goal: Build the interactive Process Flow Diagram (PFD) interface.*

1. **Initialize React:** Set up a new React application and install `reactflow` and `axios`.
2. **Create Custom Nodes:** Build visually distinct React components for each equipment type. Building these custom React Flow nodes and styling the SVG elements will feel like a natural progression from writing standard JavaScript canvas drawings for things like tanks and compressors. 
3. **Drag-and-Drop Implementation:** Configure the React Flow canvas so users can drag equipment from a sidebar, drop it onto the grid, and draw edges (pipes) between the handles. 

## Phase 6: Integration & Finalization
*Goal: Connect the visual canvas to the mathematical engine.*

1. **State Synchronization:** Write the frontend logic that translates the visual React Flow graph (nodes and edges) into the JSON payload your FastAPI backend expects.
2. **The Real-Time Loop:** Connect the React app to the FastAPI WebSocket. When the user changes a valve position on the UI, send the update via WebSocket. The backend recalculates, sends back the new pressures, and the React app updates the text labels on the PFD in real-time.
3. **Save/Load Functionality:** Add a button to download the React Flow state and backend parameters as a `.json` file, and an upload button to restore them.
4. **Containerization (Optional but Recommended):** Write a `Dockerfile` for the FastAPI backend and another for the React frontend, orchestrating them with `docker-compose.yml`. Containerizing the app makes it incredibly easy to spin up in a local development environment or deploy directly to a Proxmox environment.


# Hydraulic System Simulator: Project Structure

## 1. Initial Folder Structure
*(Start Phase 1 with this structure)*

```text
hydraulic-simulator/
│
├── backend/
│   ├── requirements.txt      # Your Python BOM (fastapi, pydantic, numpy, scipy, websockets)
│   ├── main.py               # The entry point for your FastAPI server
│   └── simulation/           # Folder for your physics and solver logic
│       ├── __init__.py       # Tells Python this folder is a module
│       └── core.py           # Where you'll start writing your base classes
│
└── frontend/
    └── (This will remain empty until Phase 5, when we initialize React)
```

## 2. Finished Example Structure
*(How the project will look as you complete Phase 6)*

```text
hydraulic-simulator/
│
├── backend/
│   ├── requirements.txt
│   ├── main.py                     # FastAPI app initialization and WebSocket routing
│   │
│   ├── api/                        # REST API routes (Save/Load state)
│   │   ├── __init__.py
│   │   └── routes.py               
│   │
│   └── simulation/                 # The Physics Engine
│       ├── __init__.py
│       ├── solver.py               # The Newton-Raphson network solver
│       ├── schemas.py              # Pydantic models (Port definitions, data validation)
│       │
│       └── equipment/              # Modular equipment classes
│           ├── __init__.py
│           ├── base_node.py        # The parent HydraulicNode class
│           ├── pipe.py             
│           ├── tank.py             
│           ├── pump.py             # Centrifugal pump logic
│           └── valve.py            # Cv and pressure drop logic
│
└── frontend/                       # The React App
    ├── package.json                # The JavaScript equivalent of requirements.txt
    ├── public/
    │   └── index.html
    │
    └── src/
        ├── App.js                  # Main React component
        ├── App.css                 # Global styles
        │
        ├── components/             # Reusable UI pieces
        │   ├── Toolbar.js          # Sidebar for drag-and-drop
        │   └── ControlPanel.js     # Start/Stop simulation buttons
        │
        ├── nodes/                  # Custom React Flow visual nodes
        │   ├── PumpNode.js         # The visual canvas drawing of a pump
        │   ├── ValveNode.js
        │   └── TankNode.js
        │
        └── services/
            ├── api.js              # Axios logic for REST calls (save/load)
            └── websocket.js        # Logic to receive real-time P and Q updates
```
