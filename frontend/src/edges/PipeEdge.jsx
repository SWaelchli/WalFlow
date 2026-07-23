import React from 'react';
import { getSmoothStepPath } from 'reactflow';

/**
 * Custom Color Interpolation Utilities for Heatmaps
 */
/* eslint-disable-next-line react-refresh/only-export-components */
export function getHeatmapColor(edgeData, heatmapMode = 'default') {
  if (!heatmapMode || heatmapMode === 'default') {
    return edgeData?.selected ? '#FA8507' : '#395253';
  }

  const telemetry = edgeData?.telemetry || {};
  // Compute average pressure/temp/flow across inlet and outlet ports if available
  const p_in = telemetry.inlets?.[0]?.pressure != null ? telemetry.inlets[0].pressure / 100000.0 : 0;
  const p_out = telemetry.outlets?.[0]?.pressure != null ? telemetry.outlets[0].pressure / 100000.0 : 0;
  const avgP = (p_in + p_out) / 2.0;

  const t_in = telemetry.inlets?.[0]?.temperature != null ? telemetry.inlets[0].temperature - 273.15 : 20;
  const t_out = telemetry.outlets?.[0]?.temperature != null ? telemetry.outlets[0].temperature - 273.15 : 20;
  const avgT = (t_in + t_out) / 2.0;

  const q_in = telemetry.inlets?.[0]?.flow_rate != null ? Math.abs(telemetry.inlets[0].flow_rate * 60000.0) : 0; // L/min
  const q_out = telemetry.outlets?.[0]?.flow_rate != null ? Math.abs(telemetry.outlets[0].flow_rate * 60000.0) : 0;
  const avgQ = (q_in + q_out) / 2.0;

  if (heatmapMode === 'pressure') {
    // Low pressure (0 bar): Deep Blue/Teal (Hue 210). High pressure (6+ bar): Vibrant Red/Orange (Hue 0).
    const minP = 0.0;  // 0 bar
    const maxP = 6.0;  // 6 bar scale for high sensitivity in hydraulic networks
    const norm = Math.min(1.0, Math.max(0.0, (avgP - minP) / (maxP - minP)));
    const hue = (1.0 - norm) * 210; // 210 (Blue/Teal) -> 0 (Orange/Red)
    return `hsl(${hue}, 90%, 46%)`;
  }

  if (heatmapMode === 'temperature') {
    // Cold (20 °C): Cool Blue (Hue 210). Hot (60 °C+): Crimson Red (Hue 0).
    const minT = 20.0; // 20 °C
    const maxT = 60.0; // 60 °C
    const norm = Math.min(1.0, Math.max(0.0, (avgT - minT) / (maxT - minT)));
    const hue = (1.0 - norm) * 210;
    return `hsl(${hue}, 90%, 45%)`;
  }

  if (heatmapMode === 'velocity') {
    // 0 flow: Slate Blue (Hue 220), high flow (200 L/min): Electric Pink/Magenta (Hue 330)
    const maxQ = 200.0; // L/min scale
    const norm = Math.min(1.0, Math.max(0.0, avgQ / maxQ));
    const hue = 220 + norm * 110; // 220 (Blue) -> 330 (Magenta)
    return `hsl(${hue}, 85%, 50%)`;
  }

  return '#475569';
}

export default function PipeEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  data = {},
  markerEnd,
  selected
}) {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 16
  });

  const heatmapMode = data.heatmapMode || 'default';
  const strokeColor = getHeatmapColor({ ...data, selected }, heatmapMode);

  // Extract flow velocity / rate for particle animation
  const telemetry = data.telemetry || {};
  const flowRateM3s = telemetry.inlets?.[0]?.flow_rate ?? 0.0;
  const flowLmin = flowRateM3s * 60000.0;
  const absFlow = Math.abs(flowLmin);
  const isReverse = flowRateM3s < 0;

  // Particle speed scaling
  const hasFlow = absFlow > 0.01;
  const animDuration = hasFlow ? Math.max(0.4, Math.min(4.0, 6.0 / Math.pow(absFlow, 0.4))) : 0;

  // Omit default ReactFlow stroke styling properties so heatmap color dominates
  const { stroke: _s, strokeWidth: _sw, strokeDasharray: _sd, ...cleanStyle } = style;

  return (
    <>
      {/* Outer glow stroke for selected state */}
      {selected && (
        <path
          d={edgePath}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={9}
          strokeOpacity={0.4}
          strokeLinecap="round"
        />
      )}

      {/* Main Pipe Line */}
      <path
        id={id}
        className="react-flow__edge-path"
        d={edgePath}
        fill="none"
        markerEnd={markerEnd}
        style={{
          transition: 'stroke 0.3s ease, stroke-width 0.2s ease',
          ...cleanStyle,
          stroke: strokeColor,
          strokeWidth: selected ? 4 : 3.5
        }}
      />

      {/* Animated Flow Particles Overlay */}
      {hasFlow && (
        <path
          d={edgePath}
          fill="none"
          stroke="#ffffff"
          strokeWidth={2.2}
          strokeDasharray="6 12"
          strokeOpacity={0.9}
          style={{
            animation: `flowDash ${animDuration}s linear infinite ${isReverse ? 'reverse' : 'normal'}`,
            pointerEvents: 'none'
          }}
        />
      )}
    </>
  );
}
