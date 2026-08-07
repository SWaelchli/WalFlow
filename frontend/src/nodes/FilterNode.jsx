import { Handle, Position } from 'reactflow';
import { useMemo } from 'react';
import { paToBar } from '../utils/converters';
import { getRotatedPosition } from '../components/canvas/NodeRotationHandle';
import { SensingPin } from '../components/canvas/SensingPin';
import BaseNode from './BaseNode';

/**
 * Strainer (ISA style)
 */
export default function FilterNode({ id, data, selected }) {
  const telemetry = data.telemetry;
  const rotation = data.rotation || 0;
  const sensing = useMemo(() => data.sensing || {}, [data.sensing]);
  const pIn = telemetry?.inlets?.[0]?.pressure || 0;
  const pOut = telemetry?.outlets?.[0]?.pressure || 0;
  const dP = pIn - pOut;
  const clogging = data.clogging || 0;

  return (
    <BaseNode
      id={id}
      data={data}
      selected={selected}
      width={60}
      height={40}
      footer={
        <>
          <div style={{ fontSize: '9px', color: '#334155', fontWeight: 'bold' }}>{data.label || 'STRAINER'}</div>
          <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#ef4444' }}>-{paToBar(dP)} bar(d)</div>
          <div style={{ fontSize: '8px', color: '#64748b' }}>Clogging: {clogging.toFixed(0)}%</div>
        </>
      }
    >
      <svg width="60" height="40" viewBox="0 0 60 40">
        <rect x="5" y="5" width="50" height="30" fill="white" stroke="#334155" strokeWidth="2.5" />
        <line x1="5" y1="35" x2="55" y2="5" stroke="#334155" strokeWidth="2.5" />
      </svg>

      <Handle 
        type="target" 
        position={getRotatedPosition(Position.Left, rotation)} 
        id="inlet-0" 
        className="handle-inlet"
        style={{ 
          top: '20px', left: '5px', 
          marginTop: '-4px', marginLeft: '-4px',
          right: 'auto', bottom: 'auto', transform: 'none',
          background: '#0284C7', width: '8px', height: '8px' 
        }} 
      />
      {sensing['inlet-0'] && <SensingPin portId="inlet-0" offset={{ x: -25, y: 0 }} />}

      <Handle 
        type="source" 
        position={getRotatedPosition(Position.Right, rotation)} 
        id="outlet-0" 
        className="handle-outlet"
        style={{ 
          top: '20px', left: '55px', 
          marginTop: '-4px', marginLeft: '-4px',
          right: 'auto', bottom: 'auto', transform: 'none',
          background: '#E11D48', width: '8px', height: '8px' 
        }} 
      />
      {sensing['outlet-0'] && <SensingPin portId="outlet-0" offset={{ x: 25, y: 0 }} />}
    </BaseNode>
  );
}
