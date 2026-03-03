import { Handle, Position, useUpdateNodeInternals } from 'reactflow';
import { useEffect } from 'react';
import { RotateButton, getRotatedPosition } from '../utils/rotation_logic.jsx';

/**
 * Vertical Tank (ISA / PFD style)
 */
export default function TankNode({ id, data, selected }) {
  const updateNodeInternals = useUpdateNodeInternals();
  const rotation = data.rotation || 0;
  const level = data.level || 0;
  const temp = (data.telemetry?.outlets?.[0]?.temperature || data.temperature || 293.15) - 273.15;

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

      {/* Symbol Container: 60x100 */}
      <div style={{ 
        width: 60, height: 100, background: 'transparent', position: 'relative',
        transform: `rotate(${rotation}deg)`
      }}>
        <svg width="60" height="100" viewBox="0 0 60 100">
          <path d="M 10 20 L 10 80 Q 10 95 30 95 Q 50 95 50 80 L 50 20 Q 50 5 30 5 Q 10 5 10 20 Z" fill="white" stroke="#334155" strokeWidth="2.5" />
          <rect x="10" y={80 - Math.min(60, (level/5)*60)} width="40" height={Math.min(60, (level/5)*60)} fill="#3b82f633" />
        </svg>

        {/* 
          Pixel-Perfect Handles
          Inlet at y=50 (Center of tank vertically)
          Outlet at y=80 (Bottom discharge port)
        */}
        <Handle 
          type="target" 
          position={getRotatedPosition(Position.Left, rotation)} 
          id="inlet-0" 
          style={{ 
            top: '50%', left: '10px', 
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
            top: '80%', left: '50px', 
            marginTop: '-4px', marginLeft: '-4px',
            right: 'auto', bottom: 'auto', transform: 'none',
            background: '#ef4444', width: '8px', height: '8px' 
          }} 
        />
      </div>

      <div style={{ textAlign: 'center', marginTop: '5px' }}>
        <div style={{ fontSize: '9px', color: '#334155', fontWeight: 'bold' }}>{data.label || 'TANK'}</div>
        <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#0369a1' }}>{level.toFixed(2)} m</div>
        <div style={{ fontSize: '9px', color: '#64748b' }}>{temp.toFixed(1)} °C</div>
      </div>
    </div>
  );
}
