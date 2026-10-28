import { useMemo } from 'react';
import BaseNode from './BaseNode';
import BoundaryPorts from './BoundaryPorts';
import { boundaryLayout, boundaryPortCount, boundaryFooterOffset } from '../utils/boundaryLayout';
import { firstPiped } from '../utils/nodeReadouts';
import { useUnits } from '../context/UnitContext';

const TANK_OUTLINE = 'M 10 20 L 10 80 Q 10 95 30 95 Q 50 95 50 80 L 50 20 Q 50 5 30 5 Q 10 5 10 20 Z';

/**
 * Vertical Tank (ISA / PFD style), 1 to 8 neutral ports
 */
export default function TankNode({ id, data, selected }) {
  const { toDisplayValue, labels, formatTemperatureK } = useUnits();
  const rotation = data.rotation || 0;
  const sensing = useMemo(() => data.sensing || {}, [data.sensing]);
  const level = data.level_m ?? 1.0;
  const fillH = Math.min(60, (level / 5) * 60);
  const numPorts = boundaryPortCount(data);
  const layout = useMemo(() => boundaryLayout('tank', numPorts), [numPorts]);
  const tempK = (data.temperature_k !== undefined ? data.temperature_k : firstPiped(data.telemetry)?.temperature) || 293.15;

  return (
    <BaseNode
      id={id}
      data={data}
      selected={selected}
      width={60}
      height={100}
      footerOffset={boundaryFooterOffset(layout, rotation, sensing)}
      footer={
        <>
          <div style={{ fontSize: '9px', color: 'var(--color-text-primary)', fontWeight: 'bold' }}>{data.label || 'TANK'}</div>
          <div style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--color-brand-dark)' }}>{Number(toDisplayValue('level_m', level)).toFixed(2)} {labels.length}</div>
          <div style={{ fontSize: '9px', color: 'var(--color-text-secondary)' }}>{formatTemperatureK(tempK)} {labels.temperature}</div>
        </>
      }
    >
      <svg width="60" height="100" viewBox="0 0 60 100">
        <defs>
          <clipPath id={`tank-clip-${id}`}>
            <path d={TANK_OUTLINE} />
          </clipPath>
        </defs>
        <path d={TANK_OUTLINE} fill="var(--color-surface)" />
        <rect x="10" y={95 - fillH} width="40" height={fillH} fill="#3b82f6" fillOpacity="0.2" clipPath={`url(#tank-clip-${id})`} />
        <path d={TANK_OUTLINE} fill="none" stroke="var(--color-brand-dark)" strokeWidth="2.5" />
      </svg>

      <BoundaryPorts id={id} layout={layout} numPorts={numPorts} rotation={rotation} sensing={sensing} />
    </BaseNode>
  );
}
