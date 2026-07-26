import React from 'react';

export default function HeatmapLegend({ 
  heatmapMode, 
  onModeChange, 
  autoScale = true, 
  onToggleAutoScale,
  globalAutoScale = true,
  onToggleGlobalAutoScale,
  activeRange = { min: 0, max: 6 },
  customRange = { min: 0, max: 6 },
  onUpdateCustomRange,
  onResetCustomRange
}) {
  if (!heatmapMode || heatmapMode === 'default') return null;

  const BLUE_TO_RED_GRADIENT = 'linear-gradient(to right, hsl(210, 90%, 46%), hsl(140, 85%, 48%), hsl(45, 90%, 50%), hsl(0, 90%, 46%))';

  const modeConfigs = {
    pressure: {
      title: 'Pressure Heatmap',
      unit: 'bar',
      gradient: BLUE_TO_RED_GRADIENT
    },
    temperature: {
      title: 'Temperature Heatmap',
      unit: '°C',
      gradient: BLUE_TO_RED_GRADIENT
    },
    volumeflow: {
      title: 'Volume Flow Heatmap',
      unit: 'l/min',
      gradient: BLUE_TO_RED_GRADIENT
    },
    velocity: {
      title: 'Velocity Heatmap',
      unit: 'm/s',
      gradient: BLUE_TO_RED_GRADIENT
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
      borderRadius: '14px',
      padding: '14px 18px',
      boxShadow: '0 10px 25px -5px rgba(57, 82, 83, 0.15), 0 4px 6px -2px rgba(57, 82, 83, 0.05)',
      zIndex: 1000,
      width: '330px',
      maxWidth: 'calc(100vw - 32px)',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px'
    }}>
      {/* Top-Right Close Button */}
      <button
        onClick={() => onModeChange('default')}
        style={{
          position: 'absolute',
          top: '10px',
          right: '12px',
          background: 'none',
          border: 'none',
          color: '#587071',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: 700,
          padding: '2px 6px',
          borderRadius: '4px',
          lineHeight: 1,
          zIndex: 10
        }}
        title="Turn Off Heatmap"
      >
        ✕
      </button>

      {/* Mode Switcher Pills */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        backgroundColor: '#F4F7F6',
        padding: '3px',
        borderRadius: '20px',
        border: '1px solid #EBF0EF',
        marginRight: '22px'
      }}>
        {[
          { id: 'pressure', label: 'Pressure' },
          { id: 'temperature', label: 'Temp' },
          { id: 'volumeflow', label: 'Flow' },
          { id: 'velocity', label: 'Velocity' }
        ].map((mode) => (
          <button
            key={mode.id}
            onClick={() => onModeChange(mode.id)}
            style={{
              flex: 1,
              border: 'none',
              borderRadius: '16px',
              padding: '4px 8px',
              fontSize: '11px',
              fontWeight: heatmapMode === mode.id ? 700 : 500,
              backgroundColor: heatmapMode === mode.id ? '#FA8507' : 'transparent',
              color: heatmapMode === mode.id ? '#ffffff' : '#587071',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap',
              textAlign: 'center'
            }}
          >
            {mode.label}
          </button>
        ))}
      </div>

      {/* Control Row: Title + Auto Toggle + Global Checkbox */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
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
            Auto: {autoScale ? 'ON' : 'OFF'}
          </button>
          
          <label 
            title={globalAutoScale ? "Global auto-scaling considers all operating cases" : "Case-specific auto-scaling considers the active case only"}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', userSelect: 'none', color: '#395253', fontSize: '11px', fontWeight: 600 }}
          >
            <input
              type="checkbox"
              checked={!!globalAutoScale}
              onChange={onToggleGlobalAutoScale}
              style={{ accentColor: '#FA8507', cursor: 'pointer', width: '13px', height: '13px' }}
            />
            Global
          </label>
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

      {/* Range Footer: Auto Labels vs Manual Inputs */}
      {autoScale ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#587071', fontWeight: 600 }}>
          <span>Min: {minDisplay} {config.unit}</span>
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
                width: '60px',
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
                width: '60px',
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
