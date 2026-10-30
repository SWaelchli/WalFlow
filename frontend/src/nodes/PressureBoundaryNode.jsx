import { useMemo } from 'react';
import BaseNode from './BaseNode';
import NodeReadout from './NodeReadout';
import BoundaryPorts from './BoundaryPorts';
import { useUnits } from '../context/UnitContext';
import { boundaryLayout, boundaryPortCount, boundaryFooterOffset } from '../utils/boundaryLayout';
import { firstPiped } from '../utils/nodeReadouts';

/**
 * Pressure Boundary Node — constant pressure (bubble with inner solid circle), 1 to 8 neutral ports.
 */
export default function PressureBoundaryNode({ id, data, selected }) {
  const { formatPressure, formatPressurePa, formatTemperatureK, labels } = useUnits();
  const rotation = data.rotation || 0;
  const sensing = useMemo(() => data.sensing || {}, [data.sensing]);
  const numPorts = boundaryPortCount(data);
  const layout = useMemo(() => boundaryLayout('circle', numPorts), [numPorts]);

  const pressureBara = data.set_pressure_bara ?? 6.0;
  const tempK = data.temperature_k ?? 293.15;

  // Live telemetry (post-simulation): the first piped port
  const port = firstPiped(data.telemetry);
  const livePressureFormatted = port?.pressure != null
    ? formatPressurePa(port.pressure)
    : formatPressure(pressureBara);
  const liveTempFormatted = port?.temperature != null
    ? formatTemperatureK(port.temperature)
    : formatTemperatureK(tempK);

  return (
    <BaseNode
      id={id}
      data={data}
      selected={selected}
      width={60}
      height={60}
      footerOffset={boundaryFooterOffset(layout, rotation, sensing)}
      footer={
        <NodeReadout
          name={data.label || 'PRESSURE BOUNDARY'}
          rows={[
            { value: livePressureFormatted, unit: labels.pressureAbs },
            { value: liveTempFormatted, unit: labels.temperature },
          ]}
        />
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
          fill="var(--color-brand-dark)"
        />
      </svg>

      <BoundaryPorts id={id} layout={layout} numPorts={numPorts} rotation={rotation} sensing={sensing} />
    </BaseNode>
  );
}
