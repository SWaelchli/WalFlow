import { Handle, Position } from 'reactflow';
import { useMemo } from 'react';
import { getRotatedPosition } from '../components/canvas/NodeRotationHandle';
import { SensingPin } from '../components/canvas/SensingPin';
import BaseNode from './BaseNode';

/**
 * Pressure Regulator (ISA / PFD style)
 */
export default function LinearRegulatorNode({ id, data, selected }) {
  const rotation = data.rotation || 0;
  const sensing = useMemo(() => data.sensing || {}, [data.sensing]);
  const telemetry = data.telemetry;
  const opening = telemetry?.opening_pct ?? (data.opening ?? 100);
  const setP = data.set_pressure ?? 500000;

  return (
    <BaseNode
      id={id}
      data={data}
      selected={selected}
      width={60}
      height={60}
      footer={
        <>
          <div style={{ fontSize: '9px', color: 'var(--color-text-primary)', fontWeight: 'bold' }}>{data.label || 'REGULATOR'}</div>
          <div style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--color-brand-dark)' }}>Set: {(setP / 100000).toFixed(1)} bar(a)</div>
          <div style={{ fontSize: '9px', color: 'var(--color-text-secondary)' }}>Pos: {opening.toFixed(1)} %</div>
        </>
      }
    >
      <svg width="60" height="60" viewBox="0 0 60 60">
        <line x1="30" y1="35" x2="30" y2="15" stroke="var(--color-brand-dark)" strokeWidth="1.5" />
        <path d="M 15 15 L 45 15" stroke="var(--color-brand-dark)" strokeWidth="2.5" />
        <path d="M 10 20 L 30 35 L 10 50 Z" fill="var(--color-surface)" stroke="var(--color-brand-dark)" strokeWidth="2.5" />
        <path d="M 50 20 L 30 35 L 50 50 Z" fill="var(--color-surface)" stroke="var(--color-brand-dark)" strokeWidth="2.5" />
        <line x1="15" y1="15" x2="10" y2="20" stroke="var(--color-brand-dark)" strokeWidth="1" strokeDasharray="2,2" />
      </svg>

      <Handle 
        type="target" 
        position={getRotatedPosition(Position.Left, rotation)} 
        id="inlet-0" 
        className="handle-inlet"
        style={{ 
          top: '35px', left: '10px', 
          marginTop: '-4px', marginLeft: '-4px',
          right: 'auto', bottom: 'auto', transform: 'none',
          background: 'var(--color-inlet)', width: '8px', height: '8px' 
        }} 
      />
      {sensing['inlet-0'] && <SensingPin portId="inlet-0" offset={{ x: -20, y: 5 }} />}

      <Handle 
        type="source" 
        position={getRotatedPosition(Position.Right, rotation)} 
        id="outlet-0" 
        className="handle-outlet"
        style={{ 
          top: '35px', left: '50px', 
          marginTop: '-4px', marginLeft: '-4px',
          right: 'auto', bottom: 'auto', transform: 'none',
          background: 'var(--color-outlet)', width: '8px', height: '8px' 
        }} 
      />
      {sensing['outlet-0'] && <SensingPin portId="outlet-0" offset={{ x: 20, y: 5 }} />}
    </BaseNode>
  );
}
