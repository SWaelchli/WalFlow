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
  let statusColor = '#64748B'; // Muted Slate
  let badgeBg = '#F1F5F9';

  if (status === 'cracked') {
    statusText = 'CRACKED';
    statusColor = '#D97706'; // Amber / Orange
    badgeBg = '#FEF3C7';
  } else if (status === 'overcapacity') {
    statusText = 'OVERCAPACITY';
    statusColor = '#DC2626'; // Red
    badgeBg = '#FEE2E2';
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
          <div style={{ fontSize: '9px', color: '#1C2B2C', fontWeight: 'bold' }}>{data.label || 'PSV'}</div>
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
          <div style={{ fontSize: '9px', color: '#587071', marginTop: '1px' }}>
            Set: {setPressureBar} bar | {flowLmin} L/min
          </div>
        </>
      }
    >
      <svg width="70" height="70" viewBox="0 0 70 70">
        {/* Main Valve Body - Angle Relief Valve Geometry */}
        {/* Inlet Stem (Left) */}
        <line x1="10" y1="35" x2="25" y2="35" stroke="#395253" strokeWidth="2.5" strokeLinecap="round" />
        {/* Outlet Stem (Right) */}
        <line x1="45" y1="35" x2="60" y2="35" stroke="#395253" strokeWidth="2.5" strokeLinecap="round" />

        {/* Opposite Triangles (Valve Seat) */}
        <polygon points="25,23 25,47 35,35" fill={status !== 'closed' ? '#FA8507' : '#FFFFFF'} stroke="#395253" strokeWidth="2" />
        <polygon points="45,23 45,47 35,35" fill={status !== 'closed' ? '#FA8507' : '#FFFFFF'} stroke="#395253" strokeWidth="2" />

        {/* Top Bonnet / Spring Box */}
        <line x1="35" y1="35" x2="35" y2="12" stroke="#395253" strokeWidth="2" />
        <rect x="29" y="8" width="12" height="10" fill="#F4F7F6" stroke="#395253" strokeWidth="1.8" rx="2" />
        {/* Spring Coil Lines */}
        <line x1="32" y1="11" x2="38" y2="11" stroke="#395253" strokeWidth="1.5" />
        <line x1="32" y1="13.5" x2="38" y2="13.5" stroke="#395253" strokeWidth="1.5" />
        <line x1="32" y1="16" x2="38" y2="16" stroke="#395253" strokeWidth="1.5" />
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
          background: '#0284C7', width: '8px', height: '8px'
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
          background: '#E11D48', width: '8px', height: '8px'
        }}
      />
      {sensing['outlet-0'] && <SensingPin portId="outlet-0" offset={{ x: 20, y: 5 }} />}
    </BaseNode>
  );
}
