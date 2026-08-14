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
  const tempK = data.temperature ?? 293.15;

  // Live telemetry (post-simulation) — prefer outlet telemetry
  const telemetryOutlet = data.telemetry?.outlets?.[0];
  const liveFlowFormatted = telemetryOutlet?.flow_rate != null
    ? formatFlowM3s(Math.abs(telemetryOutlet.flow_rate))
    : formatFlow(flowLmin);
  const liveTempFormatted = telemetryOutlet?.temperature != null
    ? formatTemperatureK(telemetryOutlet.temperature)
    : formatTemperatureK(tempK);

  return (
    <BaseNode
      id={id}
      data={data}
      selected={selected}
      width={70}
      height={70}
      footer={
        <>
          <div style={{ fontSize: '9px', color: 'var(--color-text-primary)', fontWeight: 'bold' }}>
            {data.label || 'FLOW SOURCE'}
          </div>
          <div style={{ fontSize: '10px', fontWeight: 'bold' }}>
            {liveFlowFormatted} {labels.flow}
          </div>
          <div style={{ fontSize: '9px', color: 'var(--color-text-secondary)' }}>
            {liveTempFormatted} {labels.temperature}
          </div>
        </>
      }
    >
      <svg width="70" height="70" viewBox="0 0 70 70">
        {/* Outer circle */}
        <circle
          cx="35" cy="35" r="28"
          fill="var(--color-surface)"
          stroke="var(--color-brand-dark)"
          strokeWidth="2.5"
        />

        {/* Waves */}
        <path
          d="M 16 25 Q 21 18 26 25 Q 31 32 36 25 Q 41 18 46 25 Q 51 32 54 25"
          fill="none"
          stroke="#395253"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        
        <path
          d="M 16 45 Q 21 38 26 45 Q 31 52 36 45 Q 41 38 46 45 Q 51 52 54 45"
          fill="none"
          stroke="#395253"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        
        <path
          d="M 16 35 Q 21 28 26 35 Q 31 42 36 35 Q 41 28 46 35 Q 51 42 54 35"
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
          top: '50%', left: '65px',
          marginTop: '-4px', marginLeft: '-4px',
          right: 'auto', bottom: 'auto', transform: 'none',
          background: 'var(--color-outlet)', width: '8px', height: '8px'
        }}
      />
      {sensing['outlet-0'] && <SensingPin portId="outlet-0" offset={{ x: 20, y: 0 }} />}
    </BaseNode>
  );
}
