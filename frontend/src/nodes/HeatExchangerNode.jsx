import { Handle, Position, useUpdateNodeInternals } from 'reactflow';
import { useEffect } from 'react';
import { RotateButton, getRotatedPosition } from '../utils/rotation_logic.jsx';

/**
 * Shell and Tube Heat Exchanger (ISA / PFD style)
 */
export default function HeatExchangerNode({ id, data, selected }) {
  const updateNodeInternals = useUpdateNodeInternals();
  const telemetry = data.telemetry;
  const rotation = data.rotation || 0;
  const tIn = telemetry?.inlets?.[0]?.temperature || 293.15;
  const tOut = telemetry?.outlets?.[0]?.temperature || 293.15;
  const duty = data.heat_duty_kw || 0;

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
          <circle cx="30" cy="30" r="25" fill="white" stroke="#334155" strokeWidth="2.5" />
          <path d="M 10 30 L 20 20 L 30 40 L 40 20 L 50 30" fill="none" stroke="#334155" strokeWidth="2" />
        </svg>

        <Handle 
          type="target" 
          position={getRotatedPosition(Position.Left, rotation)} 
          id="inlet-0" 
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
            top: '30px', left: '55px', 
            marginTop: '-4px', marginLeft: '-4px',
            right: 'auto', bottom: 'auto', transform: 'none',
            background: '#ef4444', width: '8px', height: '8px' 
          }} 
        />
      </div>

      <div style={{ textAlign: 'center', marginTop: '5px' }}>
        <div style={{ fontSize: '9px', color: '#334155', fontWeight: 'bold' }}>{data.label || 'HEAT EXCH'}</div>
        <div style={{ fontSize: '10px', fontWeight: 'bold', color: duty < 0 ? '#3b82f6' : '#ef4444' }}>{duty} kW</div>
        <div style={{ fontSize: '9px', color: '#64748b' }}>ΔT: {(tOut - tIn).toFixed(1)} K</div>
      </div>
    </div>
  );
}
