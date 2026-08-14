import React from 'react';
import { useUnits } from '../../context/UnitContext';

export default function GenericDetails({ node, edge, allNodes = [], allEdges = [] }) {
  const { labels, isImperial, formatPressurePa, formatFlowM3s, formatTemperatureK, formatVelocity } = useUnits();
  const isEdge = !!edge;
  const item = node || edge;
  if (!item) return null;

  const data = item.data || {};
  const telemetry = data.telemetry;

  if (!telemetry) {
    return (
      <div style={{ color: '#587071', fontSize: '11.5px', fontStyle: 'italic', padding: '10px 0' }}>
        No simulation data available. Click "Calculate Network" to generate results.
      </div>
    );
  }

  // Common variables
  const inlets = telemetry.inlets || [];
  const outlets = telemetry.outlets || [];

  // Determine flow direction and rates
  const flowM3s = outlets[0]?.flow_rate ?? inlets[0]?.flow_rate ?? 0;
  const isReverse = flowM3s < 0;

  // Dynamic upstream/downstream based on flow direction
  let pUp = 0;
  let pDown = 0;
  let temp = 293.15;

  if (isReverse) {
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

  if (isEdge) {
    const srcNode = allNodes.find(n => n.id === edge.source);
    const tgtNode = allNodes.find(n => n.id === edge.target);
    const srcLabel = srcNode?.data?.label || srcNode?.type?.replace('_', ' ').toUpperCase() || 'SOURCE';
    const tgtLabel = tgtNode?.data?.label || tgtNode?.type?.replace('_', ' ').toUpperCase() || 'TARGET';
    upLabel = isReverse ? tgtLabel : srcLabel;
    downLabel = isReverse ? srcLabel : tgtLabel;
  } else {
    const upstreamEdges = allEdges.filter(e => e.target === node.id && e.data?.type !== 'SIGNAL');
    const downstreamEdges = allEdges.filter(e => e.source === node.id && e.data?.type !== 'SIGNAL');
    const selfLabel = data.label || node.type?.replace('_', ' ').toUpperCase() || 'COMPONENT';

    let resolvedUpstreamLabel = selfLabel;
    if (upstreamEdges.length === 1) {
      const upNode = allNodes.find(n => n.id === upstreamEdges[0].source);
      resolvedUpstreamLabel = upNode?.data?.label || upNode?.type?.replace('_', ' ').toUpperCase() || selfLabel;
    }

    let resolvedDownstreamLabel = selfLabel;
    if (downstreamEdges.length === 1) {
      const downNode = allNodes.find(n => n.id === downstreamEdges[0].target);
      resolvedDownstreamLabel = downNode?.data?.label || downNode?.type?.replace('_', ' ').toUpperCase() || selfLabel;
    }

    upLabel = isReverse ? resolvedDownstreamLabel : resolvedUpstreamLabel;
    downLabel = isReverse ? resolvedUpstreamLabel : resolvedDownstreamLabel;
  }

  const flowPathCard = (
    <div style={{
      background: 'var(--color-surface-hover)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-sm)',
      padding: '8px 12px',
      fontSize: '11.5px',
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
      <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: '500' }}>
        ➔
      </div>
      <div style={{ flex: 1, textAlign: 'right', fontWeight: '600' }}>
        {downLabel}
      </div>
    </div>
  );

  // Pipe details
  let pipeRows = null;
  if (isEdge) {
    const diameter = data.diameter || 0.1;
    const length = data.length || 25.0;
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
            {isImperial ? `${dpPerFtPsi.toFixed(4)} psi/ft` : `${dpPerMeterMbar.toFixed(2)} mbar(d)/m`}
          </td>
        </tr>
      </>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      
      <div style={{ fontSize: '11px', fontWeight: '800', color: 'var(--color-brand-dark)', textTransform: 'uppercase', letterSpacing: '0.05em', borderLeft: '3px solid var(--color-primary)', paddingLeft: '8px', marginBottom: '8px' }}>
        Operational Telemetry
      </div>

      {/* Flow Path Card */}
      {flowPathCard}

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
            <td className="details-value" style={{ textAlign: 'right' }}>{formatPressurePa(dpPa)} {labels.pressureDiff}</td>
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
