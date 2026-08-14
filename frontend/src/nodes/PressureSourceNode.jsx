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
  const tempK = data.temperature ?? 293.15;

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
      width={70}
      height={70}
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
      <svg width="70" height="70" viewBox="0 0 70 70">
        {/* Outer circle */}
        <circle
          cx="35" cy="35" r="28"
          fill="var(--color-surface)"
          stroke="var(--color-brand-dark)"
          strokeWidth="2.5"
        />
        {/* Inner solid circle (Constant pressure indicator) */}
        <circle
          cx="35" cy="35" r="9"
          fill="#395253"
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
