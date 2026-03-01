import { Handle, Position } from 'reactflow';
import { useState, useEffect } from 'react';
import { paToBar, kToC, m3sToLmin } from '../utils/converters';

export default function ValveNode({ id, data }) {
  const [opening, setOpening] = useState(data.opening || 50);
  const telemetry = data.telemetry;
  const pIn = telemetry?.inlets?.[0]?.pressure || 0;
  const pOut = telemetry?.outlets?.[0]?.pressure || 0;
  const t = telemetry?.inlets?.[0]?.temperature || 293.15;
  const Q = telemetry?.inlets?.[0]?.flow_rate || 0;
  const dP = pIn - pOut;

  // Sync internal slider with external updates (e.g. from save/load)
  useEffect(() => {
    if (data.opening !== undefined) setOpening(data.opening);
  }, [data.opening]);

  const handleSliderChange = (e) => {
    const newValue = parseFloat(e.target.value);
    setOpening(newValue);
    if (data.onChange) {
      data.onChange(newValue, id); // Pass ID so backend knows which valve
    }
  };

  return (
    <div style={{
      width: 140, padding: '10px', background: '#f8fafc',
      border: '2px solid #64748b', borderRadius: '6px',
      textAlign: 'center', boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
    }}>
      <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#334155', marginBottom: '4px' }}>
        {data.label || 'Control Valve'}
      </div>
      
      {/* Telemetry Display */}
      <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '8px', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '5px' }}>
        <span>dP: {paToBar(dP)} bar</span>
        <span style={{ fontWeight: 'bold', color: '#0284c7' }}>{m3sToLmin(Q)} L/min</span>
        <span style={{ color: '#0369a1' }}>{kToC(t)}°C</span>
      </div>
      
      <div style={{ fontSize: '11px', color: '#475569', marginBottom: '4px' }}>
        Open: {opening.toFixed(1)}%
      </div>
      
      <input 
        className="nodrag"
        type="range" 
        min="0.1" 
        max="100" 
        step="0.1"
        value={opening} 
        onChange={handleSliderChange}
        style={{ width: '100%', cursor: 'pointer' }}
      />
      
      <Handle type="target" position={Position.Left} id="inlet-0" style={{ background: '#64748b', width: '8px', height: '8px' }} />
      <Handle type="source" position={Position.Right} id="outlet-0" style={{ background: '#64748b', width: '8px', height: '8px' }} />
    </div>
  );
}
