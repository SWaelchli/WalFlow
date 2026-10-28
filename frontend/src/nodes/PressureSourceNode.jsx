import { Handle, Position } from 'reactflow';
import { useMemo } from 'react';
import { getRotatedPosition } from '../components/canvas/NodeRotationHandle';
import { SensingPin } from '../components/canvas/SensingPin';
import BaseNode from './BaseNode';
import { useUnits } from '../context/UnitContext';

/**
 * PressureSource Node — Constant Pressure Boundary (bubble with inner solid circle).
 */
export default function PressureSourceNode({ id, data, selected }) {
  const { formatPressure, formatPressurePa, formatTemperatureK, labels } = useUnits();
  const rotation = data.rotation || 0;
  const sensing = useMemo(() => data.sensing || {}, [data.sensing]);

  const pressureBara = data.source_pressure_bara ?? 6.0;
  const tempK = data.temperature_k ?? 293.15;

  // Live telemetry (post-simulation) — prefer outlet telemetry
  const telemetryOutlet = data.telemetry?.outlets?.[0];
  const livePressureFormatted = telemetryOutlet?.pressure != null
    ? formatPressurePa(telemetryOutlet.pressure)
    : formatPressure(pressureBara);
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
            {data.label || 'PRESSURE SOURCE'}
          </div>
          <div style={{ fontSize: '10px', fontWeight: 'bold' }}>
            {livePressureFormatted} {labels.pressureAbs}
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
        {/* Inner solid circle (Constant pressure indicator) */}
        <circle
          cx="30" cy="30" r="7"
          fill="#395253"
        />
      </svg>

      {/* Inlet handle — Left */}
      <Handle
        type="target"
        position={getRotatedPosition(Position.Left, rotation)}
        id="inlet-0"
        className="handle-inlet"
        title="Inlet"
        style={{
          top: '50%', left: '10px',
          marginTop: '-5px', marginLeft: '-5px',
          right: 'auto', bottom: 'auto', transform: 'none',
          background: 'var(--color-inlet)', width: '8px', height: '8px'
        }}
      />
      {sensing['inlet-0'] && <SensingPin portId="inlet-0" offset={{ x: -15, y: 0 }} />}

      {/* Outlet handle — Right */}
      <Handle
        type="source"
        position={getRotatedPosition(Position.Right, rotation)}
        id="outlet-0"
        className="handle-outlet"
        title="Outlet"
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
