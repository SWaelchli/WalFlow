import React from 'react';
import { m3sToLmin } from '../../utils/converters';

export default function GenericDetails({ node, edge, allNodes = [], allEdges = [] }) {
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
  const flowLmin = parseFloat(m3sToLmin(flowM3s));
  const absFlowLmin = Math.abs(flowLmin);
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

  const pUpBar = pUp / 100000;
  const pDownBar = pDown / 100000;
  const dpBar = Math.max(0, pUpBar - pDownBar);
  const tempC = temp - 273.15;

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
      background: '#f4f7f6',
      border: '1px solid #d8e2e1',
      borderRadius: '6px',
      padding: '8px 12px',
      fontSize: '11px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '6px',
      color: '#1c2b2c',
      marginBottom: '10px'
    }}>
      <div style={{ flex: 1, textAlign: 'left', fontWeight: '500' }}>
        {upLabel}
      </div>
      <div style={{ fontSize: '12px', color: '#1c2b2c', fontWeight: '500' }}>
        ➔
      </div>
      <div style={{ flex: 1, textAlign: 'right', fontWeight: '500' }}>
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
    const dpPerMeterMbar = length > 0 ? (dpBar * 1000) / length : 0;

    pipeRows = (
      <>
        <tr style={{ borderBottom: '1px solid #EBF0EF' }}>
          <td style={{ padding: '6px 0', color: '#587071' }}>Fluid Velocity</td>
          <td style={{ padding: '6px 0', textAlign: 'right', color: '#1c2b2c', fontWeight: '500' }}>{velocity.toFixed(2)} m/s</td>
        </tr>
        <tr style={{ borderBottom: '1px solid #EBF0EF' }}>
          <td style={{ padding: '6px 0', color: '#587071' }}>Reynolds Number</td>
          <td style={{ padding: '6px 0', textAlign: 'right', color: '#1c2b2c', fontWeight: '500' }}>
            {re.toFixed(0)} ({regime})
          </td>
        </tr>
        <tr style={{ borderBottom: '1px solid #EBF0EF' }}>
          <td style={{ padding: '6px 0', color: '#587071' }}>Pressure Gradient</td>
          <td style={{ padding: '6px 0', textAlign: 'right', color: '#1c2b2c', fontWeight: '500' }}>{dpPerMeterMbar.toFixed(2)} mbar(d)/m</td>
        </tr>
      </>
    );
  }

  // Row styles: regular weight, consistent brand black #1c2b2c for values, secondary label #587071
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      
      {/* Flow Path Card */}
      {flowPathCard}

      {/* Structured Key-Value Table */}
      <table style={{ width: '100%', fontSize: '11.5px', borderCollapse: 'collapse' }}>
        <tbody>
          <tr style={{ borderBottom: '1px solid #EBF0EF' }}>
            <td style={{ padding: '6px 0', color: '#587071' }}>Upstream Pressure</td>
            <td style={{ padding: '6px 0', textAlign: 'right', color: '#1c2b2c', fontWeight: '500' }}>{pUpBar.toFixed(2)} bar(a)</td>
          </tr>
          <tr style={{ borderBottom: '1px solid #EBF0EF' }}>
            <td style={{ padding: '6px 0', color: '#587071' }}>Downstream Pressure</td>
            <td style={{ padding: '6px 0', textAlign: 'right', color: '#1c2b2c', fontWeight: '500' }}>{pDownBar.toFixed(2)} bar(a)</td>
          </tr>
          <tr style={{ borderBottom: '1px solid #EBF0EF' }}>
            <td style={{ padding: '6px 0', color: '#587071' }}>Pressure Drop (ΔP)</td>
            <td style={{ padding: '6px 0', textAlign: 'right', color: '#1c2b2c', fontWeight: '500' }}>{dpBar.toFixed(3)} bar(d)</td>
          </tr>
          <tr style={{ borderBottom: '1px solid #EBF0EF' }}>
            <td style={{ padding: '6px 0', color: '#587071' }}>Flow Rate</td>
            <td style={{ padding: '6px 0', textAlign: 'right', color: '#1c2b2c', fontWeight: '500' }}>{absFlowLmin.toFixed(1)} L/min</td>
          </tr>
          <tr style={{ borderBottom: isEdge ? '1px solid #EBF0EF' : 'none' }}>
            <td style={{ padding: '6px 0', color: '#587071' }}>Temperature</td>
            <td style={{ padding: '6px 0', textAlign: 'right', color: '#1c2b2c', fontWeight: '500' }}>{tempC.toFixed(1)} °C</td>
          </tr>
          {pipeRows}
        </tbody>
      </table>

    </div>
  );
}
