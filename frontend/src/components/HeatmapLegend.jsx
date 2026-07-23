import React from 'react';

export default function HeatmapLegend({ heatmapMode, onModeChange }) {
  if (!heatmapMode || heatmapMode === 'default') return null;

  const modeConfigs = {
    pressure: {
      title: 'Pressure Heatmap',
      unit: 'bar',
      lowLabel: '0.0 bar (Low)',
      highLabel: '6.0+ bar (High)',
      gradient: 'linear-gradient(to right, hsl(210, 90%, 46%), hsl(140, 85%, 48%), hsl(45, 90%, 50%), hsl(0, 90%, 46%))'
    },
    temperature: {
      title: 'Temperature Heatmap',
      unit: '°C',
      lowLabel: '20 °C (Cool)',
      highLabel: '60 °C (Hot)',
      gradient: 'linear-gradient(to right, hsl(210, 90%, 45%), hsl(120, 80%, 45%), hsl(40, 95%, 50%), hsl(0, 90%, 45%))'
    },
    velocity: {
      title: 'Flow Velocity',
      unit: 'L/min',
      lowLabel: '0 L/min',
      highLabel: '200+ L/min',
      gradient: 'linear-gradient(to right, hsl(220, 80%, 50%), hsl(270, 80%, 50%), hsl(330, 80%, 50%))'
    }
  };

  const config = modeConfigs[heatmapMode];
  if (!config) return null;

  return (
    <div style={{
      position: 'absolute',
      top: '16px',
      right: '16px',
      backgroundColor: 'rgba(255, 255, 255, 0.96)',
      backdropFilter: 'blur(10px)',
      border: '1px solid #D8E2E1',
      borderRadius: '12px',
      padding: '14px 18px',
      boxShadow: '0 10px 25px -5px rgba(57, 82, 83, 0.15), 0 4px 6px -2px rgba(57, 82, 83, 0.05)',
      zIndex: 1000,
      minWidth: '250px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: '#395253' }}>
          {config.title}
        </span>
        <button
          onClick={() => onModeChange('default')}
          style={{
            background: 'none',
            border: 'none',
            color: '#71717a',
            cursor: 'pointer',
            fontSize: '12px',
            padding: '2px 6px',
            borderRadius: '4px'
          }}
          title="Close Heatmap"
        >
          ✕
        </button>
      </div>

      {/* Gradient Bar */}
      <div style={{
        height: '10px',
        width: '100%',
        borderRadius: '5px',
        background: config.gradient,
        marginBottom: '6px'
      }} />

      {/* Labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#52525b', fontWeight: 500 }}>
        <span>{config.lowLabel}</span>
        <span>{config.highLabel}</span>
      </div>
    </div>
  );
}
