import { Handle, Position } from 'reactflow';
import { useMemo } from 'react';
import { getRotatedPosition } from '../components/canvas/NodeRotationHandle';
import { SensingPin } from '../components/canvas/SensingPin';
import BaseNode from './BaseNode';
import { useUnits } from '../context/UnitContext';

/**
 * Centrifugal Pump (ISA / PFD style)
 */
export default function CentrifugalPumpNode({ id, data, selected }) {
  const { formatPressurePa, formatFlowM3s, labels } = useUnits();
  const rotation = data.rotation || 0;
  const sensing = useMemo(() => data.sensing || {}, [data.sensing]);
  const pIn = data.telemetry?.inlets?.[0]?.pressure || 0;
  const pOut = data.telemetry?.outlets?.[0]?.pressure || 0;
  const q = data.telemetry?.outlets?.[0]?.flow_rate || 0;
  const dP = pOut - pIn;
  const cavitation = data.telemetry?.cavitation_warning || false;

  return (
    <BaseNode
      id={id}
      data={data}
      selected={selected}
      width={60}
      height={60}
      warningMessage={cavitation ? '⚠' : null}
      warningTitle="CAVITATION RISK: Low Suction Pressure"
      footer={
        <>
          <div style={{ fontSize: '9px', color: 'var(--color-text-primary)', fontWeight: 'bold' }}>{data.label || 'C-PUMP'}</div>
          <div style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--color-brand-dark)' }}>+{formatPressurePa(dP)} {labels.pressureDiff}</div>
          <div style={{ fontSize: '9px', color: 'var(--color-text-secondary)' }}>{formatFlowM3s(q)} {labels.flow}</div>
        </>
      }
    >
      <svg width="60" height="60" viewBox="0 0 60 60">
        <circle cx="30" cy="35" r="20" fill="var(--color-surface)" stroke="var(--color-brand-dark)" strokeWidth="2.5" />
        <line x1="30" y1="15" x2="30" y2="55" stroke="var(--color-brand-dark)" strokeWidth="1" strokeDasharray="2,2" />
        <line x1="10" y1="35" x2="50" y2="35" stroke="var(--color-brand-dark)" strokeWidth="1" strokeDasharray="2,2" />
        <line x1="30" y1="15" x2="60" y2="15" stroke="var(--color-brand-dark)" strokeWidth="2.5" />
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
          top: '15px', left: '60px', 
          marginTop: '-4px', marginLeft: '-4px',
          right: 'auto', bottom: 'auto', transform: 'none',
          background: 'var(--color-outlet)', width: '8px', height: '8px' 
        }} 
      />
      {sensing['outlet-0'] && <SensingPin portId="outlet-0" offset={{ x: 30, y: -15 }} />}
    </BaseNode>
  );
}
