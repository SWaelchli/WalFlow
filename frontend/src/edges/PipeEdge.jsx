import React from 'react';
import { getSmoothStepPath } from 'reactflow';

/**
 * Custom Color Interpolation Utilities for Heatmaps
 */
/* eslint-disable-next-line react-refresh/only-export-components */
export function getHeatmapColor(edgeData, heatmapMode = 'default', activeRange) {
  if (!heatmapMode || heatmapMode === 'default') {
    return edgeData?.selected ? 'var(--color-primary)' : 'var(--color-brand-dark)';
  }

  const telemetry = edgeData?.telemetry || {};
  // Compute average pressure/temp/flow across inlet and outlet ports if available
  const p_in = telemetry.inlets?.[0]?.pressure != null ? telemetry.inlets[0].pressure / 100000.0 : 0;
  const p_out = telemetry.outlets?.[0]?.pressure != null ? telemetry.outlets[0].pressure / 100000.0 : 0;
  const avgP = (p_in + p_out) / 2.0;

  const t_in = telemetry.inlets?.[0]?.temperature != null ? telemetry.inlets[0].temperature - 273.15 : 20;
  const t_out = telemetry.outlets?.[0]?.temperature != null ? telemetry.outlets[0].temperature - 273.15 : 20;
  const avgT = (t_in + t_out) / 2.0;

  const q_in_m3s = telemetry.inlets?.[0]?.flow_rate != null ? Math.abs(telemetry.inlets[0].flow_rate) : 0;
  const q_out_m3s = telemetry.outlets?.[0]?.flow_rate != null ? Math.abs(telemetry.outlets[0].flow_rate) : 0;
  const avgQ_m3s = (q_in_m3s + q_out_m3s) / 2.0;
  const avgQ_lmin = avgQ_m3s * 60000.0;

  const diaValue = edgeData?.diameter || 0.1;
  const area = (Math.PI * Math.pow(diaValue, 2)) / 4.0;
  const avgV = area > 0 ? avgQ_m3s / area : 0;

  const defaultMax = heatmapMode === 'pressure' ? 6.0 : heatmapMode === 'temperature' ? 60.0 : heatmapMode === 'volumeflow' ? 200.0 : 10.0;
  const defaultMin = heatmapMode === 'temperature' ? 20.0 : 0.0;

  const minVal = activeRange?.min ?? defaultMin;
  const maxVal = activeRange?.max ?? defaultMax;
  const span = maxVal - minVal;

  const val =
    heatmapMode === 'pressure'
      ? avgP
      : heatmapMode === 'temperature'
      ? avgT
      : heatmapMode === 'volumeflow'
      ? avgQ_lmin
      : avgV;

  const norm = Math.min(1.0, Math.max(0.0, span > 0 ? (val - minVal) / span : 0));
  const hue = (1.0 - norm) * 210; // 210 (Blue) -> 0 (Red)
  return `hsl(${hue}, 90%, 46%)`;
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
  const strokeColor = getHeatmapColor({ ...data, selected }, heatmapMode, data.activeRange);

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
          stroke="var(--color-primary)"
          strokeWidth={9}
          strokeOpacity={0.25}
          strokeLinecap="round"
        />
      )}

      {/* Main Pipe Line (Always Solid) */}
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
          strokeWidth: selected ? 4 : 3.5,
          strokeDasharray: 'none'
        }}
      />

      {/* Animated Flow Particles Overlay */}
      {hasFlow && (
        <path
          d={edgePath}
          fill="none"
          stroke="#ffffff"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeDasharray="3 13"
          strokeOpacity={0.85}
          style={{
            animation: `flowDash ${animDuration}s linear infinite ${isReverse ? 'reverse' : 'normal'}`,
            pointerEvents: 'none'
          }}
        />
      )}
    </>
  );
}
