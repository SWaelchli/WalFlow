import React from 'react';
import { CrossIcon } from '../symbols/IconLibrary';

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
  onResetCustomRange,
  style = {}
}) {
  if (!heatmapMode || heatmapMode === 'default') return null;

  const BLUE_TO_RED_GRADIENT = 'linear-gradient(to right, hsl(210, 90%, 46%), hsl(140, 85%, 48%), hsl(45, 90%, 50%), hsl(0, 90%, 46%))';

  const modeConfigs = {
    pressure: {
      title: 'Pressure Heatmap',
      unit: 'bar(a)',
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
      border: '1px solid var(--color-border)',
      borderRadius: '14px',
      padding: '14px 18px',
      boxShadow: 'var(--shadow-lg)',
      zIndex: 1000,
      width: '330px',
      maxWidth: 'calc(100vw - 32px)',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      ...style
    }}>
      <style>
        {`
          .heatmap-legend-close {
            position: absolute;
            top: 10px;
            right: 12px;
            background: none;
            border: none;
            color: var(--color-text-secondary);
            cursor: pointer;
            padding: 2px;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justifyContent: center;
            transition: all 0.15s ease;
            outline: none;
          }
          .heatmap-legend-close:hover {
            background-color: var(--color-surface-hover);
            color: var(--color-text-primary);
          }
          .heatmap-legend-close:focus-visible {
            border-color: var(--color-primary);
            box-shadow: 0 0 0 2px var(--color-primary-glow);
          }
          .heatmap-mode-pill {
            flex: 1;
            border: none;
            border-radius: 16px;
            padding: 4px 8px;
            fontSize: '11px';
            cursor: pointer;
            transition: all 0.15s ease;
            whiteSpace: 'nowrap';
            textAlign: 'center';
            outline: none;
          }
          .heatmap-mode-pill:focus-visible {
            border-color: var(--color-primary);
            box-shadow: 0 0 0 2px var(--color-primary-glow);
          }
        `}
      </style>

      {/* Top-Right Close Button */}
      <button
        onClick={() => onModeChange('default')}
        className="heatmap-legend-close"
        title="Turn Off Heatmap"
      >
        <CrossIcon size={14} />
      </button>

      {/* Mode Switcher Pills */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        backgroundColor: 'var(--color-surface-hover)',
        padding: '3px',
        borderRadius: '20px',
        border: '1px solid var(--color-border)',
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
            className="heatmap-mode-pill"
            style={{
              fontWeight: heatmapMode === mode.id ? 700 : 500,
              backgroundColor: heatmapMode === mode.id ? 'var(--color-primary)' : 'transparent',
              color: heatmapMode === mode.id ? 'var(--color-text-inverse)' : 'var(--color-text-secondary)',
            }}
          >
            {mode.label}
          </button>
        ))}
      </div>

      {/* Control Row: Title + Auto Toggle + Global Checkbox */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-brand-dark)', whiteSpace: 'nowrap' }}>
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
              background: autoScale ? 'var(--color-primary)' : 'var(--color-border)',
              color: autoScale ? 'var(--color-text-inverse)' : 'var(--color-text-secondary)',
              boxShadow: autoScale ? '0 2px 6px var(--color-primary-glow)' : 'none',
              transition: 'all 0.2s ease',
              whiteSpace: 'nowrap',
              outline: 'none'
            }}
            title={autoScale ? 'Auto-Scaling is ON (click to switch to manual bounds)' : 'Auto-Scaling is OFF (click to auto-detect system limits)'}
          >
            Auto: {autoScale ? 'ON' : 'OFF'}
          </button>
          
          <label 
            title={globalAutoScale ? "Global auto-scaling considers all operating cases" : "Case-specific auto-scaling considers the active case only"}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', userSelect: 'none', color: 'var(--color-brand-dark)', fontSize: '11px', fontWeight: 600 }}
          >
            <input
              type="checkbox"
              checked={!!globalAutoScale}
              onChange={onToggleGlobalAutoScale}
              style={{ accentColor: 'var(--color-primary)', cursor: 'pointer', width: '13px', height: '13px' }}
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
          <span>Min: {minDisplay} {config.unit}</span>
          <span>Max: {maxDisplay} {config.unit}</span>
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-text-secondary)' }}>MIN</span>
            <input
              type="number"
              step="0.5"
              value={customRange?.min ?? 0}
              onChange={(e) => onUpdateCustomRange && onUpdateCustomRange(parseFloat(e.target.value) || 0, customRange?.max ?? 10)}
              className="form-input"
              style={{
                width: '60px',
                height: '24px',
                padding: '0 4px',
                fontSize: '11px',
                fontWeight: '700',
                borderRadius: '6px',
                borderColor: 'var(--color-border)',
                textAlign: 'center'
              }}
            />
            <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>{config.unit}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-text-secondary)' }}>MAX</span>
            <input
              type="number"
              step="0.5"
              value={customRange?.max ?? 10}
              onChange={(e) => onUpdateCustomRange && onUpdateCustomRange(customRange?.min ?? 0, parseFloat(e.target.value) || 10)}
              className="form-input"
              style={{
                width: '60px',
                height: '24px',
                padding: '0 4px',
                fontSize: '11px',
                fontWeight: '700',
                borderRadius: '6px',
                borderColor: 'var(--color-border)',
                textAlign: 'center'
              }}
            />
            <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>{config.unit}</span>
          </div>

          <button
            onClick={onResetCustomRange}
            className="btn-secondary"
            style={{
              height: '24px',
              fontSize: '10px',
              fontWeight: 600,
              padding: '0 8px',
              borderRadius: '6px'
            }}
            title="Reset default range"
          >
            Reset
          </button>
        </div>
      )}
    </div>
  );
}
