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

### Step E: Implement a Detail Component (Optional)
If your equipment requires specialized telemetry visualization (like a pump curve), create a new component in `frontend/src/details/NewEquipmentDetails.jsx`.

```jsx
import React from 'react';

export default function NewEquipmentDetails({ node }) {
  const { telemetry } = node.data;
  // Use telemetry data to render charts or detailed tables
  return (
    <div>
      {/* Your custom visualization */}
    </div>
  );
}
```

Then, register it in `frontend/src/DetailPanel.jsx`:
1. Import your new details component.
2. Add a case for your `node_type` in the `renderContent` switch statement.

If you don't create a custom detail component, the `GenericDetails` component will automatically be used to display basic pressure and flow data.
