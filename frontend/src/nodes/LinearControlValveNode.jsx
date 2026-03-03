import { Handle, Position, useUpdateNodeInternals } from 'reactflow';
import { useEffect } from 'react';
import { RotateButton, getRotatedPosition } from '../utils/rotation_logic.jsx';

/**
 * Linear Control Valve (ISA / PFD style)
 */
export default function LinearControlValveNode({ id, data, selected }) {
  const updateNodeInternals = useUpdateNodeInternals();
  const telemetry = data.telemetry;
  const rotation = data.rotation || 0;
  const opening = data.opening ?? 50;
  const flow = telemetry?.outlets?.[0]?.flow_rate || 0;
  const flowLmin = (flow * 60000).toFixed(1);

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
          <line x1="30" y1="35" x2="30" y2="15" stroke="#334155" strokeWidth="1.5" />
          <path d="M 20 15 Q 30 5 40 15 Z" fill="white" stroke="#334155" strokeWidth="1.5" />
          <path d="M 10 20 L 30 35 L 10 50 Z" fill="white" stroke="#334155" strokeWidth="2.5" />
          <path d="M 50 20 L 30 35 L 50 50 Z" fill="white" stroke="#334155" strokeWidth="2.5" />
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
            top: '35px', left: '50px', 
            marginTop: '-4px', marginLeft: '-4px',
            right: 'auto', bottom: 'auto', transform: 'none',
            background: '#ef4444', width: '8px', height: '8px' 
          }} 
        />
      </div>

      <div style={{ textAlign: 'center', marginTop: '5px' }}>
        <div className="nodrag" style={{ padding: '2px 0' }}>
          <input type="range" min="0" max="100" step="1" value={opening} 
            onChange={(e) => data.onChange && data.onChange(parseFloat(e.target.value), id)}
            style={{ width: '60px', cursor: 'pointer', display: 'block', margin: '0 auto' }} />
        </div>
        <div style={{ fontSize: '9px', color: '#334155', fontWeight: 'bold' }}>{data.label || 'LIN VALVE'}</div>
        <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#0369a1' }}>{opening.toFixed(1)} %</div>
        <div style={{ fontSize: '9px', color: '#64748b' }}>{flowLmin} L/min</div>
      </div>
    </div>
  );
}
