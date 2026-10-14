# Frontend Integration Guide

This guide details how to implement the visual node, property forms, sidebar card, and SVG symbols for new equipment in WalFlow.

---

## 1. Creating the Node Component

Create `frontend/src/nodes/<Name>Node.jsx`. Use `<BaseNode>` to handle selection boxes, node rotation, warnings, case override badges, and off-state indicators.

```jsx
import { Handle, Position } from 'reactflow';
import { useMemo } from 'react';
import { paToBar } from '../utils/converters';
import { getRotatedPosition } from '../components/canvas/NodeRotationHandle';
import { SensingPin } from '../components/canvas/SensingPin';
import BaseNode from './BaseNode';

export default function CustomEquipmentNode({ id, data, selected }) {
  const telemetry = data.telemetry;
  const rotation = data.rotation || 0;
  const sensing = useMemo(() => data.sensing || {}, [data.sensing]);
  
  // Extract inlet/outlet telemetry
  const pIn = telemetry?.inlets?.[0]?.pressure || 0;
  const pOut = telemetry?.outlets?.[0]?.pressure || 0;
  const flowRate = telemetry?.inlets?.[0]?.flow_rate || 0;
  const dP = pIn - pOut;

  return (
    <BaseNode
      id={id}
      data={data}
      selected={selected}
      width={60}
      height={60}
      footer={
        <>
          <div style={{ fontSize: '9px', color: 'var(--color-text-primary)', fontWeight: 'bold' }}>
            {data.label || 'EQUIPMENT'}
          </div>
          <div style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--color-danger)' }}>
            -{paToBar(dP)} bar(d)
          </div>
        </>
      }
    >
      {/* 1. Component SVG Graphic */}
      <svg width="60" height="60" viewBox="0 0 60 60">
        <rect x="10" y="10" width="40" height="40" rx="4" fill="var(--color-surface)" stroke="var(--color-brand-dark)" strokeWidth="2" />
        <circle cx="30" cy="30" r="12" fill="white" stroke="var(--color-brand-dark)" strokeWidth="2" />
      </svg>

      {/* 2. Inlet Handle with Rotation Support */}
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

3. **Define Default Parameters in `onDrop`:**
   In the `onDrop` handler inside `App.jsx`, add default properties for the new equipment type:
   ```jsx
   ...(type === 'custom_equipment' && { 
     param1: 10.0, 
     param2: 2.5,
     active: true 
   }),
   ```

---

## 3. Adding to Sidebar Library (`frontend/src/components/panels/Sidebar.jsx`)

In `categorizedEquipment`, add an entry under the appropriate category:
```jsx
{
  name: 'Pressure & Flow Control', // or 'Fluid Sources', 'Power & Drive', 'Auxiliary', 'Distribution'
  items: [
    // ...
    { type: 'custom_equipment', label: 'Custom Equipment', description: 'Clearance restrictor' },
  ]
}
```

---

## 4. Adding Properties in `frontend/src/components/panels/SetupPanel.jsx`

Render parameter inputs inside the `SetupPanel`:

```jsx
{isNode && type === 'custom_equipment' && (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <label style={{ fontSize: '11px', fontWeight: '600', color: 'var(--color-text-secondary)' }}>
        Flow Coefficient (Cv)
      </label>
      <input
        type="number"
        step="0.1"
        value={data.cv ?? 10.0}
        onChange={(e) => handleNumericChange('cv', e.target.value)}
        className="form-control"
      />
    </div>

    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <label style={{ fontSize: '11px', fontWeight: '600', color: 'var(--color-text-secondary)' }}>
        Set Pressure (bar)
      </label>
      <input
        type="number"
        step="0.1"
        value={data.set_pressure_bar ?? 3.5}
        onChange={(e) => handleNumericChange('set_pressure_bar', e.target.value)}
        className="form-control"
      />
    </div>
  </div>
)}
```

---

## 5. Adding SVG Symbol in `frontend/src/components/symbols/SymbolLibrary.jsx`

Add a case under `EquipmentSymbol`:

```jsx
case 'custom_equipment':
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <rect x="10" y="10" width="40" height="40" rx="4" fill="white" stroke="#334155" strokeWidth="2.5" />
      <circle cx="30" cy="30" r="10" fill="none" stroke="#334155" strokeWidth="2" />
    </svg>
  );
```

---

## 6. Optional: Dedicated Results Inspector (`frontend/src/components/details/`)

If your equipment requires specialized telemetry, charts, or operating curves:
1. Create `frontend/src/components/details/<Name>Details.jsx`.
2. In `frontend/src/components/details/ResultsPanel.jsx`, import your component and add a `case '<name>': return <<Name>Details node={selectedNode} />;`.
*(If omitted, `GenericDetails` will automatically display standard inlet/outlet pressure and flow rates).*
