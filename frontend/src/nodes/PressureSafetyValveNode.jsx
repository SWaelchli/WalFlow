import { Handle, Position } from 'reactflow';
import { useMemo } from 'react';
import { getRotatedPosition } from '../components/canvas/NodeRotationHandle';
import { SensingPin } from '../components/canvas/SensingPin';
import BaseNode from './BaseNode';

/**
 * Pressure Safety Relief Valve (PSV / PRV) Node
 * Represents an ISA standard 90-degree angle relief valve with live relief badging.
 */
export default function PressureSafetyValveNode({ id, data, selected }) {
  const telemetry = data.telemetry;
  const rotation = data.rotation || 0;
  const sensing = useMemo(() => data.sensing || {}, [data.sensing]);

  const flow = telemetry?.outlets?.[0]?.flow_rate || 0;
  const flowLmin = (Math.abs(flow) * 60000).toFixed(1);
  
  const status = telemetry?.status || 'closed'; // 'closed', 'cracked', 'overcapacity'
  const setPressureBar = data.set_pressure_bar || 20.0;

  let statusText = 'CLOSED';
  let statusColor = 'var(--color-text-secondary)'; // Muted Slate
  let badgeBg = 'var(--color-surface-hover)';

  if (status === 'cracked') {
    statusText = 'CRACKED';
    statusColor = 'var(--color-warning)'; // Amber / Orange
    badgeBg = 'rgba(245, 158, 11, 0.12)';
  } else if (status === 'overcapacity') {
    statusText = 'OVERCAPACITY';
    statusColor = 'var(--color-danger)'; // Red
    badgeBg = 'rgba(239, 68, 68, 0.12)';
  }

  return (
    <BaseNode
      id={id}
      data={data}
      selected={selected}
      width={70}
      height={70}
      footer={
        <>
          <div style={{ fontSize: '9px', color: 'var(--color-text-primary)', fontWeight: 'bold' }}>{data.label || 'PSV'}</div>
          <div
            style={{
              fontSize: '8.5px',
              fontWeight: 700,
              color: statusColor,
              backgroundColor: badgeBg,
              padding: '1px 5px',
              borderRadius: '4px',
              marginTop: '2px',
              display: 'inline-block',
              letterSpacing: '0.3px',
              border: `1px solid ${statusColor}33`
            }}
          >
            {statusText}
          </div>
          <div style={{ fontSize: '9px', color: 'var(--color-text-secondary)', marginTop: '1px' }}>
            Set: {setPressureBar} bar(a) | {flowLmin} L/min
          </div>
        </>
      }
    >
      <svg width="70" height="70" viewBox="0 0 70 70">
        {/* Main Valve Body - Angle Relief Valve Geometry */}
        {/* Inlet Stem (Left) */}
        <line x1="10" y1="35" x2="25" y2="35" stroke="var(--color-brand-dark)" strokeWidth="2.5" strokeLinecap="round" />
        {/* Outlet Stem (Right) */}
        <line x1="45" y1="35" x2="60" y2="35" stroke="var(--color-brand-dark)" strokeWidth="2.5" strokeLinecap="round" />

        {/* Opposite Triangles (Valve Seat) */}
        <polygon points="25,23 25,47 35,35" fill={status !== 'closed' ? 'var(--color-primary)' : '#FFFFFF'} stroke="var(--color-brand-dark)" strokeWidth="2" />
        <polygon points="45,23 45,47 35,35" fill={status !== 'closed' ? 'var(--color-primary)' : '#FFFFFF'} stroke="var(--color-brand-dark)" strokeWidth="2" />

        {/* Top Bonnet / Spring Box */}
        <line x1="35" y1="35" x2="35" y2="12" stroke="var(--color-brand-dark)" strokeWidth="2" />
        <rect x="29" y="8" width="12" height="10" fill="var(--color-surface-hover)" stroke="var(--color-brand-dark)" strokeWidth="1.8" rx="2" />
        {/* Spring Coil Lines */}
        <line x1="32" y1="11" x2="38" y2="11" stroke="var(--color-brand-dark)" strokeWidth="1.5" />
        <line x1="32" y1="13.5" x2="38" y2="13.5" stroke="var(--color-brand-dark)" strokeWidth="1.5" />
        <line x1="32" y1="16" x2="38" y2="16" stroke="var(--color-brand-dark)" strokeWidth="1.5" />
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
          top: '35px', left: '60px',
          marginTop: '-4px', marginLeft: '-4px',
          right: 'auto', bottom: 'auto', transform: 'none',
          background: 'var(--color-outlet)', width: '8px', height: '8px'
        }}
      />
      {sensing['outlet-0'] && <SensingPin portId="outlet-0" offset={{ x: 20, y: 5 }} />}
    </BaseNode>
  );
}
