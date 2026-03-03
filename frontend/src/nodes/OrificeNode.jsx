import { Handle, Position, useUpdateNodeInternals } from 'reactflow';
import { useEffect } from 'react';
import { paToBar } from '../utils/converters';
import { RotateButton, getRotatedPosition } from '../utils/rotation_logic.jsx';
import { SensingPin } from '../utils/SensingPin.jsx';

/**
 * Orifice Plate (ISA / PFD style)
 */
export default function OrificeNode({ id, data, selected }) {
  const updateNodeInternals = useUpdateNodeInternals();
  const telemetry = data.telemetry;
  const rotation = data.rotation || 0;
  const sensing = data.sensing || {};
  const pIn = telemetry?.inlets?.[0]?.pressure || 0;
  const pOut = telemetry?.outlets?.[0]?.pressure || 0;
  const dP = pIn - pOut;

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, rotation, sensing, updateNodeInternals]);

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
        width: 40, height: 60, background: 'transparent', position: 'relative',
        transform: `rotate(${rotation}deg)`
      }}>
        <svg width="40" height="60" viewBox="0 0 40 60">
          <line x1="20" y1="10" x2="20" y2="25" stroke="#334155" strokeWidth="2.5" />
          <line x1="20" y1="35" x2="20" y2="50" stroke="#334155" strokeWidth="2.5" />
          <line x1="0" y1="30" x2="40" y2="30" stroke="#334155" strokeWidth="1.5" strokeDasharray="4,4" />
        </svg>

        <Handle 
          type="target" 
          position={getRotatedPosition(Position.Left, rotation)} 
          id="inlet-0" 
          style={{ 
            top: '30px', left: '0px', 
            marginTop: '-4px', marginLeft: '-4px',
            right: 'auto', bottom: 'auto', transform: 'none',
            background: '#3b82f6', width: '8px', height: '8px' 
          }} 
        />
        {sensing['inlet-0'] && <SensingPin portId="inlet-0" offset={{ x: -20, y: 0 }} />}

        <Handle 
          type="source" 
          position={getRotatedPosition(Position.Right, rotation)} 
          id="outlet-0" 
          style={{ 
            top: '30px', left: '40px', 
            marginTop: '-4px', marginLeft: '-4px',
            right: 'auto', bottom: 'auto', transform: 'none',
            background: '#ef4444', width: '8px', height: '8px' 
          }} 
        />
        {sensing['outlet-0'] && <SensingPin portId="outlet-0" offset={{ x: 20, y: 0 }} />}
      </div>

      <div style={{ textAlign: 'center', marginTop: '5px' }}>
        <div style={{ fontSize: '9px', color: '#334155', fontWeight: 'bold' }}>{data.label || 'ORIFICE'}</div>
        <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#ef4444' }}>-{paToBar(dP)} bar</div>
      </div>
    </div>
  );
}
