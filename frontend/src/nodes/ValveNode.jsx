import { Handle, Position } from 'reactflow';
import { useState } from 'react';

export default function ValveNode({ data }) {
  // We give the valve its own React state so the slider moves smoothly
  // We initialize it to whatever value is passed in from the blueprint (default 50)
  const [opening, setOpening] = useState(data.opening || 50);

  // This function fires every time the user drags the slider
  const handleSliderChange = (e) => {
    const newValue = e.target.value;
    setOpening(newValue);
    
    // In the next step, we will pass a WebSocket function into data.onChange
    // so dragging this slider talks directly to Python.
    if (data.onChange) {
      data.onChange(newValue);
    }
  };

  return (
    <div style={{
      width: 130, padding: '10px', background: '#f8fafc',
      border: '2px solid #64748b', borderRadius: '6px',
      textAlign: 'center', boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
    }}>
      <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#334155', marginBottom: '8px' }}>
        {data.label || 'Control Valve'}
      </div>
      
      {/* Display the current opening percentage */}
      <div style={{ fontSize: '11px', color: '#475569', marginBottom: '4px' }}>
        Open: {opening}%
      </div>
      
      {/* The HTML Range Slider */}
      <input 
        className="nodrag"  // in order to not move whole node, when dragging handle.
        type="range" 
        min="0.1" 
        max="100" 
        step="0.1"
        value={opening} 
        onChange={handleSliderChange}
        style={{ width: '100%', cursor: 'pointer' }}
      />
      
      <Handle type="target" position={Position.Left} id="inlet" style={{ background: '#64748b', width: '8px', height: '8px' }} />
      <Handle type="source" position={Position.Right} id="outlet" style={{ background: '#64748b', width: '8px', height: '8px' }} />
    </div>
  );
}