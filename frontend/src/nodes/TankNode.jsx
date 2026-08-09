import { Handle, Position } from 'reactflow';
import { useMemo } from 'react';
import { getRotatedPosition } from '../components/canvas/NodeRotationHandle';
import { SensingPin } from '../components/canvas/SensingPin';
import BaseNode from './BaseNode';

/**
 * Vertical Tank (ISA / PFD style)
 */
export default function TankNode({ id, data, selected }) {
  const rotation = data.rotation || 0;
  const sensing = useMemo(() => data.sensing || {}, [data.sensing]);
  const level = data.level || 0;
  const temp = ((data.temperature !== undefined ? data.temperature : data.telemetry?.outlets?.[0]?.temperature) || 293.15) - 273.15;

  return (
    <BaseNode
      id={id}
      data={data}
      selected={selected}
      width={60}
      height={100}
      footer={
        <>
          <div style={{ fontSize: '9px', color: 'var(--color-text-primary)', fontWeight: 'bold' }}>{data.label || 'TANK'}</div>
          <div style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--color-brand-dark)' }}>{level.toFixed(2)} m</div>
          <div style={{ fontSize: '9px', color: 'var(--color-text-secondary)' }}>{temp.toFixed(1)} °C</div>
        </>
      }
    >
      <svg width="60" height="100" viewBox="0 0 60 100">
        <path d="M 10 20 L 10 80 Q 10 95 30 95 Q 50 95 50 80 L 50 20 Q 50 5 30 5 Q 10 5 10 20 Z" fill="var(--color-surface)" stroke="var(--color-brand-dark)" strokeWidth="2.5" />
        <rect x="10" y={80 - Math.min(60, (level/5)*60)} width="40" height={Math.min(60, (level/5)*60)} fill="var(--color-primary)33" />
      </svg>

      <Handle 
        type="target" 
        position={getRotatedPosition(Position.Left, rotation)} 
        id="inlet-0" 
        className="handle-inlet"
        style={{ 
          top: '50%', left: '10px', 
          marginTop: '-4px', marginLeft: '-4px',
          right: 'auto', bottom: 'auto', transform: 'none',
          background: 'var(--color-inlet)', width: '8px', height: '8px' 
        }} 
      />
      {sensing['inlet-0'] && <SensingPin portId="inlet-0" offset={{ x: -20, y: 0 }} />}

      <Handle 
        type="source" 
        position={getRotatedPosition(Position.Right, rotation)} 
        id="outlet-0" 
        className="handle-outlet"
        style={{ 
          top: '80%', left: '50px', 
          marginTop: '-4px', marginLeft: '-4px',
          right: 'auto', bottom: 'auto', transform: 'none',
          background: 'var(--color-outlet)', width: '8px', height: '8px' 
        }} 
      />
      {sensing['outlet-0'] && <SensingPin portId="outlet-0" offset={{ x: 20, y: 30 }} />}
    </BaseNode>
  );
}
