import { Handle, Position } from 'reactflow';
import { useMemo } from 'react';
import { getRotatedPosition } from '../components/canvas/NodeRotationHandle';
import { SensingPin } from '../components/canvas/SensingPin';
import BaseNode from './BaseNode';
import { useUnits } from '../context/UnitContext';

/**
 * Check Valve with Orifice Node (Non-Return Valve with Bypass Restriction)
 */
export default function CheckValveOrificeNode({ id, data, selected }) {
  const { formatFlowM3s, labels } = useUnits();
  const telemetry = data.telemetry;
  const rotation = data.rotation || 0;
  const sensing = useMemo(() => data.sensing || {}, [data.sensing]);
  
  const flow = telemetry?.outlets?.[0]?.flow_rate || 0;
  const flowFormatted = formatFlowM3s(flow);
  const isOpen = flow > 1e-4;
  const isBypass = Math.abs(flow) > 1e-6 && !isOpen;

  let statusText = 'CLOSED';
  let statusColor = '#64748b';
  if (isOpen) {
    statusText = 'OPEN';
    statusColor = '#16a34a';
  } else if (isBypass || flow < -1e-6) {
    statusText = 'BYPASS';
    statusColor = 'var(--color-primary)';
  }

  return (
    <BaseNode
      id={id}
      data={data}
      selected={selected}
      width={60}
      height={60}
      footer={
        <>
          <div style={{ fontSize: '9px', color: 'var(--color-text-primary)', fontWeight: 'bold' }}>{data.label || 'CHECK W/ ORIFICE'}</div>
          <div style={{ fontSize: '10px', fontWeight: 'bold', color: statusColor }}>
            {statusText}
          </div>
          <div style={{ fontSize: '9px', color: 'var(--color-text-secondary)' }}>{flowFormatted} {labels.flow}</div>
        </>
      }
    >
      <svg width="60" height="60" viewBox="0 0 60 60">
        <line x1="10" y1="20" x2="10" y2="50" stroke="var(--color-brand-dark)" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="10" cy="20" r="3.5" fill="var(--color-brand-dark)" />
        <line x1="50" y1="20" x2="50" y2="50" stroke="var(--color-brand-dark)" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="10" y1="20" x2="48" y2="46" stroke="var(--color-brand-dark)" strokeWidth="2.5" strokeLinecap="round" />
        <polygon points="50,48 39,44 45,37" fill="var(--color-brand-dark)" stroke="var(--color-brand-dark)" strokeWidth="0.5" />
        <circle cx="30" cy="35" r="4" fill="var(--color-surface)" stroke="var(--color-brand-dark)" strokeWidth="1.5" />
        <circle cx="30" cy="35" r="1.5" fill="var(--color-brand-dark)" />
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
