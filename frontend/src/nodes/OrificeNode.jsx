import { Handle, Position } from 'reactflow';
import { useMemo } from 'react';
import { paToBar } from '../utils/converters';
import { getRotatedPosition } from '../components/canvas/NodeRotationHandle';
import { SensingPin } from '../components/canvas/SensingPin';
import BaseNode from './BaseNode';

/**
 * Orifice Plate (ISA / PFD style)
 */
export default function OrificeNode({ id, data, selected }) {
  const telemetry = data.telemetry;
  const rotation = data.rotation || 0;
  const sensing = useMemo(() => data.sensing || {}, [data.sensing]);
  const pIn = telemetry?.inlets?.[0]?.pressure || 0;
  const pOut = telemetry?.outlets?.[0]?.pressure || 0;
  const dP = pIn - pOut;

  return (
    <BaseNode
      id={id}
      data={data}
      selected={selected}
      width={40}
      height={60}
      footer={
        <>
          <div style={{ fontSize: '9px', color: '#334155', fontWeight: 'bold' }}>{data.label || 'ORIFICE'}</div>
          <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#ef4444' }}>-{paToBar(dP)} bar(d)</div>
        </>
      }
    >
      <svg width="40" height="60" viewBox="0 0 40 60">
        <line x1="20" y1="10" x2="20" y2="25" stroke="#334155" strokeWidth="2.5" />
        <line x1="20" y1="35" x2="20" y2="50" stroke="#334155" strokeWidth="2.5" />
        <line x1="0" y1="30" x2="40" y2="30" stroke="#334155" strokeWidth="1.5" strokeDasharray="4,4" />
      </svg>

      <Handle 
        type="target" 
        position={getRotatedPosition(Position.Left, rotation)} 
        id="inlet-0" 
        className="handle-inlet"
        style={{ 
          top: '30px', left: '0px', 
          marginTop: '-4px', marginLeft: '-4px',
          right: 'auto', bottom: 'auto', transform: 'none',
          background: '#0284C7', width: '8px', height: '8px' 
        }} 
      />
      {sensing['inlet-0'] && <SensingPin portId="inlet-0" offset={{ x: -20, y: 0 }} />}

      <Handle 
        type="source" 
        position={getRotatedPosition(Position.Right, rotation)} 
        id="outlet-0" 
        className="handle-outlet"
        style={{ 
          top: '30px', left: '40px', 
          marginTop: '-4px', marginLeft: '-4px',
          right: 'auto', bottom: 'auto', transform: 'none',
          background: '#E11D48', width: '8px', height: '8px' 
        }} 
      />
      {sensing['outlet-0'] && <SensingPin portId="outlet-0" offset={{ x: 20, y: 0 }} />}
    </BaseNode>
  );
}
