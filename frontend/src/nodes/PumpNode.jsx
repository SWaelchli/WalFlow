import { Handle, Position, useUpdateNodeInternals } from 'reactflow';
import { useEffect } from 'react';
import { paToBar, m3sToLmin } from '../utils/converters';
import { RotateButton, getRotatedPosition } from '../utils/rotation_logic.jsx';

/**
 * Centrifugal Pump (ISA / PFD style)
 */
export default function PumpNode({ id, data, selected }) {
  const updateNodeInternals = useUpdateNodeInternals();
  const rotation = data.rotation || 0;
  const pIn = data.telemetry?.inlets?.[0]?.pressure || 0;
  const pOut = data.telemetry?.outlets?.[0]?.pressure || 0;
  const q = data.telemetry?.outlets?.[0]?.flow_rate || 0;
  const dP = pOut - pIn;

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, rotation, updateNodeInternals]);

  return (
    <div style={{ position: 'relative' }}>
      {selected && (
        <div style={{
          position: 'absolute',
          top: -5, left: -5, right: -5, bottom: -5,
          border: '2px solid #3b82f6',
          borderRadius: '6px',
          boxShadow: '0 0 10px rgba(59, 130, 246, 0.3)',
          pointerEvents: 'none'
        }} />
      )}

      <RotateButton visible={selected} onClick={() => data.onRotate(id)} />

      <div style={{ 
        width: 60, height: 60, background: 'transparent', position: 'relative',
        transform: `rotate(${rotation}deg)`
      }}>
        <svg width="60" height="60" viewBox="0 0 60 60">
          <circle cx="30" cy="35" r="20" fill="white" stroke="#334155" strokeWidth="2.5" />
          <line x1="30" y1="15" x2="30" y2="55" stroke="#334155" strokeWidth="1" strokeDasharray="2,2" />
          <line x1="10" y1="35" x2="50" y2="35" stroke="#334155" strokeWidth="1" strokeDasharray="2,2" />
          <line x1="30" y1="15" x2="60" y2="15" stroke="#334155" strokeWidth="2.5" />
        </svg>

        <Handle 
          type="target" 
          position={getRotatedPosition(Position.Left, rotation)} 
          id="inlet-0" 
          style={{ 
            top: '35px', left: '10px', 
            marginTop: '-4px', marginLeft: '-4px',
            right: 'auto', bottom: 'auto', transform: 'none',
            background: '#3b82f6', width: '8px', height: '8px' 
          }} 
        />
        <Handle 
          type="source" 
          position={getRotatedPosition(Position.Right, rotation)} 
          id="outlet-0" 
          style={{ 
            top: '15px', left: '60px', 
            marginTop: '-4px', marginLeft: '-4px',
            right: 'auto', bottom: 'auto', transform: 'none',
            background: '#ef4444', width: '8px', height: '8px' 
          }} 
        />
      </div>

      <div style={{ textAlign: 'center', marginTop: '5px' }}>
        <div style={{ fontSize: '9px', color: '#334155', fontWeight: 'bold' }}>{data.label || 'PUMP'}</div>
        <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#0369a1' }}>+{paToBar(dP)} bar</div>
        <div style={{ fontSize: '9px', color: '#64748b' }}>{m3sToLmin(q)} L/min</div>
      </div>
    </div>
  );
}
