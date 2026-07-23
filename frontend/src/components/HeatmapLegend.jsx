import React from 'react';

export default function HeatmapLegend({ 
  heatmapMode, 
  onModeChange, 
  autoScale = true, 
  onToggleAutoScale,
  activeRange = { min: 0, max: 6 },
  customRange = { min: 0, max: 6 },
  onUpdateCustomRange,
  onResetCustomRange
}) {
  if (!heatmapMode || heatmapMode === 'default') return null;

  const modeConfigs = {
    pressure: {
      title: 'Pressure Heatmap',
      unit: 'bar',
      gradient: 'linear-gradient(to right, hsl(210, 90%, 46%), hsl(140, 85%, 48%), hsl(45, 90%, 50%), hsl(0, 90%, 46%))'
    },
    temperature: {
      title: 'Temperature Heatmap',
      unit: '°C',
      gradient: 'linear-gradient(to right, hsl(210, 90%, 45%), hsl(120, 80%, 45%), hsl(40, 95%, 50%), hsl(0, 90%, 45%))'
    },
    velocity: {
      title: 'Flow Velocity',
      unit: 'L/min',
      gradient: 'linear-gradient(to right, hsl(220, 80%, 50%), hsl(270, 80%, 50%), hsl(330, 80%, 50%))'
    }
  };

  const config = modeConfigs[heatmapMode];
  if (!config) return null;

  const minDisplay = (activeRange?.min ?? 0).toFixed(1);
  const maxDisplay = (activeRange?.max ?? 10).toFixed(1);

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
      minWidth: '310px',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px'
    }}>
      {/* Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: '#395253', whiteSpace: 'nowrap' }}>
          {config.title}
        </span>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <button
            onClick={onToggleAutoScale}
            style={{
              fontSize: '10.5px',
              fontWeight: 700,
              padding: '3px 9px',
              borderRadius: '12px',
              border: 'none',
              cursor: 'pointer',
              background: autoScale ? '#FA8507' : '#EBF0EF',
              color: autoScale ? '#ffffff' : '#587071',
              boxShadow: autoScale ? '0 2px 6px rgba(250, 133, 7, 0.3)' : 'none',
              transition: 'all 0.2s ease',
              whiteSpace: 'nowrap'
            }}
            title={autoScale ? 'Auto-Scaling is ON (click to switch to manual bounds)' : 'Auto-Scaling is OFF (click to auto-detect system limits)'}
          >
            ⚡ Auto: {autoScale ? 'ON' : 'OFF'}
          </button>
          
          <button
            onClick={() => onModeChange('default')}
            style={{
              background: 'none',
              border: 'none',
              color: '#587071',
              cursor: 'pointer',
              fontSize: '12px',
              padding: '2px 4px',
              borderRadius: '4px'
            }}
            title="Close Heatmap"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Gradient Bar */}
      <div style={{
        height: '10px',
        width: '100%',
        borderRadius: '5px',
        background: config.gradient,
        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.1)'
      }} />

      {/* Range Labels / Manual Inputs */}
      {autoScale ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#587071', fontWeight: 600 }}>
          <span>Min: {minDisplay} {config.unit}</span>
          <span style={{ color: '#FA8507', fontWeight: 700 }}>[Auto-Scaled]</span>
          <span>Max: {maxDisplay} {config.unit}</span>
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#587071' }}>MIN</span>
            <input
              type="number"
              step="0.5"
              value={customRange?.min ?? 0}
              onChange={(e) => onUpdateCustomRange && onUpdateCustomRange(parseFloat(e.target.value) || 0, customRange?.max ?? 10)}
              style={{
                width: '65px',
                padding: '3px 6px',
                fontSize: '11px',
                fontWeight: '700',
                borderRadius: '6px',
                border: '1px solid #D8E2E1',
                textAlign: 'center',
                outline: 'none'
              }}
            />
            <span style={{ fontSize: '10px', color: '#849A9B' }}>{config.unit}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#587071' }}>MAX</span>
            <input
              type="number"
              step="0.5"
              value={customRange?.max ?? 10}
              onChange={(e) => onUpdateCustomRange && onUpdateCustomRange(customRange?.min ?? 0, parseFloat(e.target.value) || 10)}
              style={{
                width: '65px',
                padding: '3px 6px',
                fontSize: '11px',
                fontWeight: '700',
                borderRadius: '6px',
                border: '1px solid #D8E2E1',
                textAlign: 'center',
                outline: 'none'
              }}
            />
            <span style={{ fontSize: '10px', color: '#849A9B' }}>{config.unit}</span>
          </div>

          <button
            onClick={onResetCustomRange}
            style={{
              fontSize: '10px',
              fontWeight: 600,
              color: '#587071',
              background: '#F4F7F6',
              border: '1px solid #D8E2E1',
              borderRadius: '6px',
              padding: '3px 8px',
              cursor: 'pointer'
            }}
            title="Reset default range"
          >
            ↺ Reset
          </button>
        </div>
      )}
    </div>
  );
}
