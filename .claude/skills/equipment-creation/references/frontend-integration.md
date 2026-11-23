# Frontend Integration Guide

This guide details how to implement the visual node, property forms, sidebar card, and SVG symbols for new equipment in WalFlow.

---

## 1. Creating the Node Component

Create `frontend/src/nodes/<Name>Node.jsx`. Use `<BaseNode>` to handle selection boxes, node rotation, warnings, case override badges, and off-state indicators.

The template below is for a component with role ports (`inlet-0`, `outlet-0`). For a neutral-port component, see section 1b.

Text under the symbol goes through `NodeReadout` (values) and `StatusBadge` (states) only, as in MASTER.md "Canvas
values": every number in one style and one colour, colour only on a state badge, no hex or numeric `fontSize` in
the node. `src/test/styleGuard.test.js` checks this for `nodes/` and `components/details/`. Values reach
`NodeReadout` already formatted by the `useUnits()` formatters, with the unit from `labels` (never a hard-coded unit
string, never `toFixed`). Units follow MASTER.md: `bar(a)`, `bar(g)`, and plain `bar` for a pressure difference.

```jsx
import { Handle, Position } from 'reactflow';
import { useMemo } from 'react';
import { getRotatedPosition } from '../components/canvas/NodeRotationHandle';
import { SensingPin } from '../components/canvas/SensingPin';
import BaseNode from './BaseNode';
import NodeReadout from './NodeReadout';
import { useUnits } from '../context/UnitContext';

export default function CustomEquipmentNode({ id, data, selected }) {
  const { formatDiffPressurePa, labels } = useUnits();
  const telemetry = data.telemetry;
  const rotation = data.rotation || 0;
  const sensing = useMemo(() => data.sensing || {}, [data.sensing]);
  
  // Extract inlet/outlet telemetry
  const pIn = telemetry?.inlets?.[0]?.pressure || 0;
  const pOut = telemetry?.outlets?.[0]?.pressure || 0;
  const dP = pIn - pOut;

  return (
    <BaseNode
      id={id}
      data={data}
      selected={selected}
      width={60}
      height={60}
      footer={
        <NodeReadout
          name={data.label || 'EQUIPMENT'}
          rows={[{ label: 'ΔP', value: formatDiffPressurePa(dP), unit: labels.pressureDiff }]}
          // states only: badges={[{ kind: 'success', label: 'OPEN' }]} (kinds: neutral, success, warning,
          // danger, info); BaseNode already shows OFF
        />
      }
    >
      {/* 1. Component SVG Graphic */}
      <svg width="60" height="60" viewBox="0 0 60 60">
        <rect x="10" y="10" width="40" height="40" rx="4" fill="var(--color-surface)" stroke="var(--color-brand-dark)" strokeWidth="2" />
        <circle cx="30" cy="30" r="12" fill="var(--color-surface)" stroke="var(--color-brand-dark)" strokeWidth="2" />
      </svg>

      {/* 2. Inlet Handle with Rotation Support. The inline position style is the current pattern in every node
          (the handle sits on the symbol's port, which differs per symbol); keep the 8px size and the colour
          variables, and copy the offsets from a similar node. */}
      <Handle 
        type="target" 
        position={getRotatedPosition(Position.Left, rotation)} 
        id="inlet-0" 
        className="handle-inlet"
        style={{ 
          top: '30px', left: '10px', 
          marginTop: '-4px', marginLeft: '-4px',
          right: 'auto', bottom: 'auto', transform: 'none',
          background: 'var(--color-inlet)', width: '8px', height: '8px' 
        }} 
      />
      {sensing['inlet-0'] && <SensingPin portId="inlet-0" offset={{ x: -25, y: 0 }} />}

      {/* 3. Outlet Handle with Rotation Support */}
      <Handle 
        type="source" 
        position={getRotatedPosition(Position.Right, rotation)} 
        id="outlet-0" 
        className="handle-outlet"
        style={{ 
          top: '30px', left: '50px', 
          marginTop: '-4px', marginLeft: '-4px',
          right: 'auto', bottom: 'auto', transform: 'none',
          background: 'var(--color-outlet)', width: '8px', height: '8px' 
        }} 
      />
      {sensing['outlet-0'] && <SensingPin portId="outlet-0" offset={{ x: 25, y: 0 }} />}
    </BaseNode>
  );
}
```

**Sensing pin toggles and labels:** the inspector (`SetupPanel.jsx`) offers one sensing toggle per role port, taken from `sensingPortsFor(type)` in `frontend/src/utils/portLabels.js` (default `['inlet-0', 'outlet-0']`; role-port types only, neutral types list their `port-k` ids in `SetupPanel.jsx`). If the component has more role ports, such as the 3-way TCV's `inlet-1`, add them to `ROLE_SENSING_PORTS` there. Labels come from `sensingPinLabel(type, handle)`: "Inlet" / "Outlet" when there is one port of that role, "Inlet 1" / "Inlet 2" when there are several, and "Port N" for neutral ports. Never show raw handle ids such as `outlet-0` to the user.

### 1b. Neutral-port components

A component built on `InlineNode` (see backend Archetype 1) has no inlet or outlet. Reference: `frontend/src/nodes/OrificeNode.jsx`.

- **Handles:** use `id="port-0"` / `id="port-1"` with `className="handle-neutral"` and `title="Port 1"` / `"Port 2"`. Do not set a `background`: both ports are hollow rings in `--color-port-neutral`.
- **Handle type:** the canvas connects in loose mode, so `type` does not set a direction. Keep `target` on port 0 and `source` on port 1.
- **Sensing pins:** `sensing['port-k']` with `<SensingPin portId="port-k" />`. The signal handle is `signal-port-k`. Pilots and remote control valves can sense here.
- **Registration:** add the type to `NEUTRAL_TYPES` in `frontend/src/utils/networkValidation.js`, and to the port lists in `SetupPanel.jsx`.
- **Telemetry:** the backend sends `telemetry.ports[k]`, with `flow_rate` positive into the component. Do not read `inlets` / `outlets`. Use `neutralDrop(telemetry)` (Δp in the flow direction) and `neutralPorts(telemetry)` (upstream / downstream port) from `utils/nodeReadouts.js`.

---

## 2. Registering in `frontend/src/App.jsx`

1. **Import the node component:**
   ```jsx
   import CustomEquipmentNode from './nodes/CustomEquipmentNode';
   ```

2. **Add to `nodeTypes` map:**
   ```jsx
   const nodeTypes = {
     // ...
     custom_equipment: CustomEquipmentNode,
   };
   ```

3. **Default parameters:** add the type to `DEFAULTS_BY_TYPE` in `frontend/src/utils/nodeDefaults.js`, with the
   same field names and defaults as the parser and the `## Data Fields` table of the equipment `.md`:
   ```js
   custom_equipment: { cv: 10.0, flow_rated_lmin: 100.0 },
   ```

---

## 3. Adding to Sidebar Library (`frontend/src/components/panels/Sidebar.jsx`)

In `categorizedEquipment`, add an entry under the appropriate category:
```jsx
{
  // Categories: 'Boundaries', 'Power & Drive', 'Pressure & Flow Control', 'Piping & Fittings',
  // 'Instrumentation', 'Distribution & Manifolds', 'Auxiliary', 'Documentation & Notes'
  name: 'Pressure & Flow Control',
  items: [
    // ...
    { type: 'custom_equipment', label: 'Custom Equipment', description: 'Clearance restrictor', keywords: ['cr', 'restriction'] },
  ]
}
```

---

## 4. Adding Properties in `frontend/src/components/panels/SetupPanel.jsx`

Render parameter inputs inside the `SetupPanel`. Copy the pattern of an existing field: `renderLabel(text, field)`
gives the label (token styles) and the operating-case badge, the input uses `.form-input`, the value is shown in
the user's units through `toDisplayValue` and committed through `validateAndCommit`. A unit goes in square brackets
from `labels` (MASTER.md), never hard-coded:

```jsx
{isNode && type === 'custom_equipment' && (
  <>
    <div>
      {renderLabel('Flow Coefficient Cv', 'cv')}
      <input
        type="number" step="0.1"
        className="form-input" style={{ width: '100%' }}
        value={localDrafts.cv !== undefined ? localDrafts.cv : (effectiveData.cv ?? 10)}
        onChange={(e) => handleDraftChange('cv', e.target.value)}
        onBlur={(e) => validateAndCommit('cv', e.target.value)}
      />
    </div>
    <div>
      {renderLabel(`Rated Flow [${labels.flow}]`, 'flow_rated_lmin')}
      <input
        type="number"
        className="form-input" style={{ width: '100%' }}
        value={localDrafts.flow_rated_lmin !== undefined ? localDrafts.flow_rated_lmin : toDisplayValue('flow_rated_lmin', effectiveData.flow_rated_lmin || 100)}
        onChange={(e) => handleDraftChange('flow_rated_lmin', e.target.value)}
        onBlur={(e) => validateAndCommit('flow_rated_lmin', e.target.value, true)}
      />
    </div>
  </>
)}
```

Mirror the spacing wrapper of the neighbouring equipment blocks in `SetupPanel.jsx`; do not add new inline sizes.

---

## 5. Adding SVG Symbol in `frontend/src/components/symbols/SymbolLibrary.jsx`

Add a case under `EquipmentSymbol`. Colours are design tokens in the attribute form, as in the existing cases and
the canvas nodes; no hex or rgb literals (the style guard scans `components/symbols/`):

```jsx
case 'custom_equipment':
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <rect x="10" y="10" width="40" height="40" rx="4" fill="var(--color-surface)" stroke="var(--color-brand-dark)" strokeWidth="2.5" />
      <circle cx="30" cy="30" r="10" fill="none" stroke="var(--color-brand-dark)" strokeWidth="2" />
    </svg>
  );
```

---

## 6. Optional: Dedicated Results Inspector (`frontend/src/components/details/`)

If your equipment requires specialized telemetry, charts, or operating curves:
1. Create `frontend/src/components/details/<Name>Details.jsx`.
2. In `frontend/src/components/details/ResultsPanel.jsx`, import your component and add a `case '<name>': return <<Name>Details node={selectedNode} />;`.
*(If omitted, `GenericDetails` will automatically display standard inlet/outlet pressure and flow rates).*
