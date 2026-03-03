import { Handle, Position, useUpdateNodeInternals } from 'reactflow';
import { useEffect } from 'react';
import { RotateButton, getRotatedPosition } from '../utils/rotation_logic.jsx';

/**
 * Mixer (ISA / PFD style)
 */
export default function MixerNode({ id, data, selected }) {
  const updateNodeInternals = useUpdateNodeInternals();
  const telemetry = data.telemetry;
  const rotation = data.rotation || 0;
  const qOut = telemetry?.outlets?.[0]?.flow_rate || 0;
  const qLmin = (qOut * 60000).toFixed(1);

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
        width: 40, height: 40, background: 'transparent', position: 'relative',
        transform: `rotate(${rotation}deg)`
      }}>
        <svg width="40" height="40" viewBox="0 0 40 40">
          <circle cx="20" cy="20" r="15" fill="white" stroke="#334155" strokeWidth="2.5" />
          <path d="M 5 10 L 15 15" stroke="#334155" strokeWidth="1.5" />
          <path d="M 5 30 L 15 25" stroke="#334155" strokeWidth="1.5" />
          <path d="M 25 20 L 35 20" stroke="#334155" strokeWidth="1.5" />
        </svg>

        <Handle 
          type="target" 
          position={getRotatedPosition(Position.Left, rotation)} 
          id="inlet-0" 
          style={{ 
            top: '10px', left: '5px', 
            marginTop: '-4px', marginLeft: '-4px',
            right: 'auto', bottom: 'auto', transform: 'none',
            background: '#3b82f6', width: '8px', height: '8px' 
          }} 
        />
        <Handle 
          type="target" 
          position={getRotatedPosition(Position.Left, rotation)} 
          id="inlet-1" 
          style={{ 
            top: '30px', left: '5px', 
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
            top: '20px', left: '35px', 
            marginTop: '-4px', marginLeft: '-4px',
            right: 'auto', bottom: 'auto', transform: 'none',
            background: '#ef4444', width: '8px', height: '8px' 
          }} 
        />
      </div>

      <div style={{ textAlign: 'center', marginTop: '5px' }}>
        <div style={{ fontSize: '9px', color: '#334155', fontWeight: 'bold' }}>{data.label || 'MIXER'}</div>
        <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#0369a1' }}>{qLmin} L/min</div>
      </div>
    </div>
  );
}
