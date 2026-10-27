import { Handle, Position } from 'reactflow';
import { useMemo } from 'react';
import { getRotatedPosition } from '../components/canvas/NodeRotationHandle';
import { SensingPin } from '../components/canvas/SensingPin';
import BaseNode from './BaseNode';
import { useUnits } from '../context/UnitContext';

/**
 * FlowSource Node — Constant Flow Boundary (bubble with waves, outlet port only).
 */
export default function FlowSourceNode({ id, data, selected }) {
  const { formatFlow, formatFlowM3s, formatTemperatureK, labels } = useUnits();
  const rotation = data.rotation || 0;
  const sensing = useMemo(() => data.sensing || {}, [data.sensing]);

  const flowLmin = data.source_flow_lmin ?? 50.0;
  const tempK = data.temperature_k ?? 293.15;
  // Negative set flow = withdrawal (demand): shown as a draw-off magnitude, not a signed injection
  const isWithdrawal = Number(flowLmin) < 0;

  // Live telemetry (post-simulation) — prefer outlet telemetry
  const telemetryOutlet = data.telemetry?.outlets?.[0];
  const liveFlowFormatted = telemetryOutlet?.flow_rate != null
    ? formatFlowM3s(Math.abs(telemetryOutlet.flow_rate))
    : formatFlow(Math.abs(Number(flowLmin)));
  const liveTempFormatted = telemetryOutlet?.temperature != null
    ? formatTemperatureK(telemetryOutlet.temperature)
    : formatTemperatureK(tempK);

  return (
    <BaseNode
      id={id}
      data={data}
      selected={selected}
      width={60}
      height={60}
      footer={
        <>
          <div style={{ fontSize: '9px', color: 'var(--color-text-primary)', fontWeight: 'bold' }}>
            {data.label || 'FLOW SOURCE'}
          </div>
          <div style={{ fontSize: '10px', fontWeight: 'bold' }} title={isWithdrawal ? 'Withdrawal (negative set flow)' : undefined}>
            {isWithdrawal && 'Draw-off '}{liveFlowFormatted} {labels.flow}
          </div>
          <div style={{ fontSize: '9px', color: 'var(--color-text-secondary)' }}>
            {liveTempFormatted} {labels.temperature}
          </div>
        </>
      }
    >
      <svg width="60" height="60" viewBox="0 0 60 60">
        {/* Outer circle */}
        <circle
          cx="30" cy="30" r="20"
          fill="var(--color-surface)"
          stroke="var(--color-brand-dark)"
          strokeWidth="2.5"
        />

        {/* Waves */}
        <path
          d="M 16.4 22.8 Q 20 17.8 23.6 22.8 Q 27.2 27.8 30.8 22.8 Q 34.3 17.8 37.8 22.8 Q 41.4 27.8 43.6 22.8"
          fill="none"
          stroke="#395253"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        
        <path
          d="M 16.4 37.2 Q 20 32.2 23.6 37.2 Q 27.2 42.2 30.8 37.2 Q 34.3 32.2 37.8 37.2 Q 41.4 42.2 43.6 37.2"
          fill="none"
          stroke="#395253"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        
        <path
          d="M 16.4 30 Q 20 25 23.6 30 Q 27.2 35 30.8 30 Q 34.3 25 37.8 30 Q 41.4 35 43.6 30"
          fill="none"
          stroke="#395253"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>

      {/* Outlet handle — Right only */}
      <Handle
        type="source"
        position={getRotatedPosition(Position.Right, rotation)}
        id="outlet-0"
        className="handle-outlet"
        style={{
          top: '50%', left: '50px',
          marginTop: '-5px', marginLeft: '-5px',
          right: 'auto', bottom: 'auto', transform: 'none',
          background: 'var(--color-outlet)', width: '8px', height: '8px'
        }}
      />
      {sensing['outlet-0'] && <SensingPin portId="outlet-0" offset={{ x: 15, y: 0 }} />}
    </BaseNode>
  );
}
