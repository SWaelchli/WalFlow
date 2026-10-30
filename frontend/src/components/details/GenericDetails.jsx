import { ArrowRightIcon } from '../symbols/IconLibrary';
import React from 'react';
import { useUnits } from '../../context/UnitContext';
import { isNeutralPort, NEUTRAL_TYPES } from '../../utils/networkValidation';
import { portTitle } from '../../utils/portLabels';
import { neutralPorts } from '../../utils/nodeReadouts';
import NeutralFlowCaption from './NeutralFlowCaption';

export default function GenericDetails({ node, edge, allNodes = [], allEdges = [] }) {
  const { labels, isImperial, formatPressurePa, formatDiffPressurePa, formatFlowM3s, formatTemperatureK, formatVelocity } = useUnits();
  const isEdge = !!edge;
  const item = node || edge;
  if (!item) return null;

  const data = item.data || {};
  const telemetry = data.telemetry;

  if (!telemetry) {
    return (
      <div style={{ color: '#587071', fontSize: 'var(--fs-sm)', fontStyle: 'italic', padding: '10px 0' }}>
        No simulation data available. Click "Calculate Network" to generate results.
      </div>
    );
  }

  // Common variables
  const inlets = telemetry.inlets || [];
  const outlets = telemetry.outlets || [];

  // A two-port component has neutral ports: its upstream side is the port the flow enters through
  const neutral = !isEdge && NEUTRAL_TYPES.has(node.type) ? neutralPorts(telemetry) : null;

  // Determine flow direction and rates
  const flowM3s = neutral ? neutral.flow : (outlets[0]?.flow_rate ?? inlets[0]?.flow_rate ?? 0);
  const isReverse = !neutral && flowM3s < 0;

  // Dynamic upstream/downstream based on flow direction
  let pUp = 0;
  let pDown = 0;
  let temp = 293.15;

  if (neutral) {
    pUp = neutral.up.pressure ?? 101325;
    pDown = neutral.down.pressure ?? 101325;
    temp = neutral.up.temperature ?? neutral.down.temperature ?? 293.15;
  } else if (isReverse) {
    pUp = outlets[0]?.pressure ?? 101325;
    pDown = inlets[0]?.pressure ?? 101325;
    temp = outlets[0]?.temperature ?? inlets[0]?.temperature ?? 293.15;
  } else {
    pUp = inlets[0]?.pressure ?? 101325;
    pDown = outlets[0]?.pressure ?? 101325;
    temp = inlets[0]?.temperature ?? outlets[0]?.temperature ?? 293.15;
  }

  const dpPa = Math.max(0, pUp - pDown);

  // Visual Flow Path for Node or Pipe (exactly 2 items, clean black text, no dynamic colors)
  let upLabel = "SOURCE";
  let downLabel = "TARGET";

  const nameOf = (n, fallback) => n?.data?.label || n?.type?.replace('_', ' ').toUpperCase() || fallback;
  // Name of a pipe end; "Port k" is added where the port has no role
  const endName = (n, handle, fallback) => (n && isNeutralPort(n, handle) ? `${nameOf(n, fallback)} (${portTitle(n, handle)})` : nameOf(n, fallback));
  let flowCaption = null;

  if (isEdge) {
    const srcNode = allNodes.find(n => n.id === edge.source);
    const tgtNode = allNodes.find(n => n.id === edge.target);
    const srcLabel = nameOf(srcNode, 'SOURCE');
    const tgtLabel = nameOf(tgtNode, 'TARGET');
    upLabel = isReverse ? tgtLabel : srcLabel;
    downLabel = isReverse ? srcLabel : tgtLabel;
    // Positive flow runs from the drawn source end to the target end; the caption names the ends in flow direction
    const ends = [endName(srcNode, edge.sourceHandle || 'outlet-0', 'SOURCE'), endName(tgtNode, edge.targetHandle || 'inlet-0', 'TARGET')];
    if (isReverse) ends.reverse();
    flowCaption = `Flow ${formatFlowM3s(Math.abs(flowM3s))} ${labels.flow}, ${ends[0]} → ${ends[1]}`;
  } else {
    const selfLabel = data.label || node.type?.replace('_', ' ').toUpperCase() || 'COMPONENT';
    // The neighbour across the pipe(s) on the upstream / downstream port, whichever way the pipe was drawn
    const neighbours = (matches) => allEdges
      .filter(e => e.data?.type !== 'SIGNAL')
      .flatMap((e) => {
        if (e.source === node.id && matches(e.sourceHandle || 'outlet-0')) return [e.target];
        if (e.target === node.id && matches(e.targetHandle || 'inlet-0')) return [e.source];
        return [];
      });
    const resolve = (matches) => {
      const ids = neighbours(matches);
      return ids.length === 1 ? nameOf(allNodes.find(n => n.id === ids[0]), selfLabel) : selfLabel;
    };
    const isTwoPort = NEUTRAL_TYPES.has(node.type);
    const upHandle = `port-${neutral?.upIdx ?? 0}`;
    const downHandle = `port-${neutral?.downIdx ?? 1}`;
    const resolvedUpstreamLabel = resolve(isTwoPort ? (h) => h === upHandle : (h) => h.startsWith('inlet-'));
    const resolvedDownstreamLabel = resolve(isTwoPort ? (h) => h === downHandle : (h) => h.startsWith('outlet-'));

    upLabel = isReverse ? resolvedDownstreamLabel : resolvedUpstreamLabel;
    downLabel = isReverse ? resolvedUpstreamLabel : resolvedDownstreamLabel;
  }

  const flowPathCard = (
    <div style={{
      background: 'var(--color-surface-hover)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-sm)',
      padding: '8px 12px',
      fontSize: 'var(--fs-sm)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '6px',
      color: 'var(--color-text-primary)',
      marginBottom: '10px'
    }}>
      <div style={{ flex: 1, textAlign: 'left', fontWeight: '600' }}>
        {upLabel}
      </div>
      <ArrowRightIcon size={14} color="var(--color-text-secondary)" />
      <div style={{ flex: 1, textAlign: 'right', fontWeight: '600' }}>
        {downLabel}
      </div>
    </div>
  );

  const flowCaptionRow = flowCaption && (
    <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--color-text-secondary)', marginBottom: '10px' }}>
      {flowCaption}
    </div>
  );

  // Pipe details
  let pipeRows = null;
  if (isEdge) {
    const diameter = data.diameter_m || 0.1;
    const length = data.length_m ?? 25.0;
    const area = Math.PI * Math.pow(diameter, 2) / 4.0;
    const velocity = area > 0 ? Math.abs(flowM3s) / area : 0;

    // Reynolds Number
    const density = inlets[0]?.density || 1000;
    const viscosity = inlets[0]?.viscosity || 0.001; // Pa.s
    const re = viscosity > 0 ? (density * velocity * diameter) / viscosity : 0;

    // Flow regime
    let regime = 'Laminar';
    if (re > 4000) regime = 'Turbulent';
    else if (re >= 2000) regime = 'Transition';
    const dpBar = dpPa / 100000;
    const dpPerMeterMbar = length > 0 ? (dpBar * 1000) / length : 0;
    const dpPerFtPsi = length > 0 ? (dpBar * 14.5037738) / (length * 3.280839895) : 0;

    pipeRows = (
      <>
        <tr>
          <td className="details-label">Fluid Velocity</td>
          <td className="details-value" style={{ textAlign: 'right' }}>{formatVelocity(velocity)} {labels.velocity}</td>
        </tr>
        <tr>
          <td className="details-label">Reynolds Number</td>
          <td className="details-value" style={{ textAlign: 'right' }}>
            {re.toFixed(0)} ({regime})
          </td>
        </tr>
        <tr>
          <td className="details-label">Pressure Gradient</td>
          <td className="details-value" style={{ textAlign: 'right' }}>
            {isImperial ? `${dpPerFtPsi.toFixed(4)} psi/ft` : `${dpPerMeterMbar.toFixed(2)} mbar/m`}
          </td>
        </tr>
      </>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      
      <div style={{ fontSize: 'var(--fs-xs)', fontWeight: '800', color: 'var(--color-brand-dark)', textTransform: 'uppercase', letterSpacing: '0.05em', borderLeft: '3px solid var(--color-primary)', paddingLeft: '8px', marginBottom: '8px' }}>
        Operational Telemetry
      </div>

      {/* Flow Path Card */}
      {flowPathCard}
      {flowCaptionRow}
      {neutral && <div style={{ marginBottom: '10px' }}><NeutralFlowCaption telemetry={telemetry} /></div>}

      {/* Structured Key-Value Table */}
      <table className="details-table">
        <tbody>
          <tr>
            <td className="details-label">Upstream Pressure</td>
            <td className="details-value" style={{ textAlign: 'right' }}>{formatPressurePa(pUp)} {labels.pressureAbs}</td>
          </tr>
          <tr>
            <td className="details-label">Downstream Pressure</td>
            <td className="details-value" style={{ textAlign: 'right' }}>{formatPressurePa(pDown)} {labels.pressureAbs}</td>
          </tr>
          <tr>
            <td className="details-label">Pressure Drop (ΔP)</td>
            <td className="details-value" style={{ textAlign: 'right' }}>{formatDiffPressurePa(dpPa, 3)} {labels.pressureDiff}</td>
          </tr>
          <tr>
            <td className="details-label">Flow Rate</td>
            <td className="details-value" style={{ textAlign: 'right' }}>{formatFlowM3s(Math.abs(flowM3s))} {labels.flow}</td>
          </tr>
          <tr>
            <td className="details-label">Temperature</td>
            <td className="details-value" style={{ textAlign: 'right' }}>{formatTemperatureK(temp)} {labels.temperature}</td>
          </tr>
          {pipeRows}
        </tbody>
      </table>

    </div>
  );
}
