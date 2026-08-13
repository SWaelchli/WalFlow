import { Handle, Position } from 'reactflow';
import { useMemo } from 'react';
import { getRotatedPosition } from '../components/canvas/NodeRotationHandle';
import { SensingPin } from '../components/canvas/SensingPin';
import BaseNode from './BaseNode';

/**
 * FluidSource Node — Universal Fluid Boundary Condition (ISA instrument-bubble style).
 *
 * Displays a circle with a stylised water-wave SVG and a mode badge:
 *   • Pressure mode → 'P' badge in brand-dark teal (#395253)
 *   • Flow mode    → 'Q' badge in WalFlow orange (#FA8507)
 *
 * Footer shows the active setpoint and the injected temperature.
 */
export default function FluidSourceNode({ id, data, selected }) {
  const rotation = data.rotation || 0;
  const sensing = useMemo(() => data.sensing || {}, [data.sensing]);

  const sourceType    = data.source_type || 'pressure';
  const isPressure    = sourceType === 'pressure';

  // Setpoint display (from data properties, not live telemetry)
  const pressureBara  = data.source_pressure_bara ?? 6.0;
  const flowLmin      = data.source_flow_lmin ?? 50.0;

  // Temperature: stored in K, display in °C
  const tempK  = data.temperature ?? 293.15;
  const tempC  = (tempK - 273.15).toFixed(1);

  // Live telemetry (post-simulation) — prefer outlet telemetry, fall back to setpoint
  const telemetryOutlet = data.telemetry?.outlets?.[0];
  const livePressureBara = telemetryOutlet?.pressure != null
    ? (telemetryOutlet.pressure / 100_000).toFixed(2)
    : pressureBara.toFixed(2);
  const liveFlowLmin = telemetryOutlet?.flow_rate != null
    ? (Math.abs(telemetryOutlet.flow_rate) * 60_000).toFixed(1)
    : flowLmin.toFixed(1);
  const liveTempC = telemetryOutlet?.temperature != null
    ? (telemetryOutlet.temperature - 273.15).toFixed(1)
    : tempC;

  // Badge colour
  const badgeColor = isPressure ? '#395253' : '#FA8507';
  const badgeLetter = isPressure ? 'P' : 'Q';

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
            {data.label || 'FLUID SOURCE'}
          </div>
          <div style={{ fontSize: '10px', fontWeight: 'bold' }}>
            {isPressure ? `${livePressureBara} bara` : `${liveFlowLmin} L/min`}
          </div>
          <div style={{ fontSize: '9px', color: 'var(--color-text-secondary)' }}>
            {liveTempC} °C
          </div>
        </>
      }
    >
      {/* ISA Instrument-Bubble SVG */}
      <svg width="70" height="70" viewBox="0 0 70 70">
        {/* Outer circle — instrument bubble body */}
        <circle
          cx="35" cy="35" r="28"
          fill="var(--color-surface)"
          stroke="var(--color-brand-dark)"
          strokeWidth="2.5"
        />

        {/* Water wave paths — stylised fluid symbol */}
        <path
          d="M 16 35 Q 21 28 26 35 Q 31 42 36 35 Q 41 28 46 35 Q 51 42 54 35"
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <path
          d="M 18 40 Q 23 33 28 40 Q 33 47 38 40 Q 43 33 48 40 Q 51 44 52 40"
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="1.4"
          strokeLinecap="round"
          opacity="0.5"
        />

      </svg>

      {/* Inlet handle — Left */}
      <Handle
        type="target"
        position={getRotatedPosition(Position.Left, rotation)}
        id="inlet-0"
        className="handle-inlet"
        style={{
          top: '50%', left: '5px',
          marginTop: '-4px', marginLeft: '-4px',
          right: 'auto', bottom: 'auto', transform: 'none',
          background: 'var(--color-inlet)', width: '8px', height: '8px'
        }}
      />
      {sensing['inlet-0'] && <SensingPin portId="inlet-0" offset={{ x: -20, y: 0 }} />}

      {/* Outlet handle — Right */}
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
