import { useMemo } from 'react';
import BaseNode from './BaseNode';
import BoundaryPorts from './BoundaryPorts';
import { useUnits } from '../context/UnitContext';
import { boundaryLayout, boundaryPortCount, boundaryFooterOffset } from '../utils/boundaryLayout';
import { firstPiped, netPortFlow } from '../utils/nodeReadouts';
import { flowBoundaryGlyphPath } from '../utils/flowBoundaryGlyph';

/**
 * Flow Boundary Node — constant flow (circle with four radial arrows), 1 to 8 neutral ports.
 * The arrows point out for a supply and in for a draw. The footer pressure is that of the first piped port.
 */
export default function FlowBoundaryNode({ id, data, selected }) {
  const { formatFlow, formatFlowM3s, formatPressurePa, labels } = useUnits();
  const rotation = data.rotation || 0;
  const sensing = useMemo(() => data.sensing || {}, [data.sensing]);
  const numPorts = boundaryPortCount(data);
  const layout = useMemo(() => boundaryLayout('circle', numPorts), [numPorts]);

  const footerOffset = boundaryFooterOffset(layout, rotation, sensing);

  // A set flow per port supplies the sum of its port flows
  const flowLmin = data.flow_split === 'per_port' && Array.isArray(data.port_flows_lmin)
    ? data.port_flows_lmin.reduce((sum, q) => sum + (Number(q) || 0), 0)
    : data.set_flow_lmin ?? 50.0;
  const isDraw = data.flow_direction === 'draw';
  const telemetry = data.telemetry;

  // Live telemetry (post-simulation): net flow through all ports is positive into the boundary
  const net = netPortFlow(telemetry);
  const liveFlowFormatted = net != null ? formatFlowM3s(Math.abs(net)) : formatFlow(Math.abs(Number(flowLmin)));
  const port = firstPiped(telemetry);

  const limitMessage = !isDraw && telemetry?.pressure_cap_reached ? 'Discharge pressure limit reached'
    : isDraw && telemetry?.suction_limit_reached ? 'Suction limit reached' : null;

  return (
    <BaseNode
      id={id}
      data={data}
      selected={selected}
      width={60}
      height={60}
      warningMessage={limitMessage}
      footerOffset={footerOffset}
      footer={
        <>
          <div style={{ fontSize: '9px', color: 'var(--color-text-primary)', fontWeight: 'bold' }}>
            {data.label || 'FLOW BOUNDARY'}
          </div>
          <div style={{ fontSize: '10px', fontWeight: 'bold' }}>
            {isDraw ? 'Draw' : 'Supply'} {liveFlowFormatted} {labels.flow}
          </div>
          {port?.pressure != null && (
            <div style={{ fontSize: '9px', color: 'var(--color-text-secondary)' }}>
              {formatPressurePa(port.pressure)} {labels.pressureAbs}
            </div>
          )}
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

        {/* Four radial arrows: pointing out for a supply, in for a draw */}
        <path
          d={flowBoundaryGlyphPath(isDraw)}
          fill="none"
          stroke="#395253"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      <BoundaryPorts id={id} layout={layout} numPorts={numPorts} rotation={rotation} sensing={sensing} />
    </BaseNode>
  );
}
