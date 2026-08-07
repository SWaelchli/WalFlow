import { Handle, Position } from 'reactflow';
import { useMemo } from 'react';
import { getRotatedPosition } from '../components/canvas/NodeRotationHandle';
import { SensingPin } from '../components/canvas/SensingPin';
import BaseNode from './BaseNode';

/**
 * Rupture Disc (Burst Diaphragm) Node
 * Represents an ISA standard rupture disc mechanical pressure relief diaphragm with live burst telemetry.
 */
export default function RuptureDiscNode({ id, data, selected }) {
  const telemetry = data.telemetry;
  const rotation = data.rotation || 0;
  const sensing = useMemo(() => data.sensing || {}, [data.sensing]);

  const flow = telemetry?.outlets?.[0]?.flow_rate || 0;
  const flowLmin = (Math.abs(flow) * 60000).toFixed(1);
  
  const status = telemetry?.status || 'intact'; // 'intact', 'burst', 'overcapacity'
  const burstPressureBar = data.burst_pressure_bar || 25.0;

  let statusText = 'INTACT';
  let statusColor = '#166534'; // Green
  let badgeBg = '#DCFCE7';

  if (status === 'burst') {
    statusText = 'BURST';
    statusColor = '#DC2626'; // Red
    badgeBg = '#FEE2E2';
  } else if (status === 'overcapacity') {
    statusText = 'OVERCAPACITY';
    statusColor = '#DC2626';
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
          <div style={{ fontSize: '9px', color: '#1C2B2C', fontWeight: 'bold' }}>{data.label || 'RD'}</div>
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
            Burst: {burstPressureBar} bar(a) | {flowLmin} L/min
          </div>
        </>
      }
    >
      <svg width="70" height="70" viewBox="0 0 70 70">
        {/* Inlet Stem (Left) */}
        <line x1="10" y1="35" x2="28" y2="35" stroke="#395253" strokeWidth="2.5" strokeLinecap="round" />
        {/* Outlet Stem (Right) */}
        <line x1="42" y1="35" x2="60" y2="35" stroke="#395253" strokeWidth="2.5" strokeLinecap="round" />

        {/* Flange Plates (Left & Right) */}
        <rect x="26" y="22" width="3" height="26" fill="#395253" rx="1" />
        <rect x="41" y="22" width="3" height="26" fill="#395253" rx="1" />

        {/* Rupture Diaphragm Dome */}
        {status === 'intact' ? (
          // Intact dome curve
          <path
            d="M 29,24 Q 35,35 29,46"
            fill="none"
            stroke="#FA8507"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
        ) : (
          // Burst diaphragm (ruptured jagged lines)
          <path
            d="M 29,24 Q 32,30 30,34 M 29,46 Q 32,40 30,36"
            fill="none"
            stroke="#DC2626"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
        )}
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
