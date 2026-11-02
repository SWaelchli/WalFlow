import React from 'react';
import { useUnits } from '../../context/UnitContext';
import { CrossIcon, CheckIcon } from '../symbols/IconLibrary';

/**
 * ReliefScenarioManager is a floating panel on the canvas to choose which relief scenario
 * (Contingency Telemetry View) the canvas, inspector and measurements show.
 */
export default function ReliefScenarioManager({
  cases = [],
  activeCaseId = 'case_base',
  telemetryMode = 'mitigated',
  onToggleTelemetryMode,
  onClose
}) {
  const { basisLabel } = useUnits();
  const reliefModes = [
    {
      id: 'mitigated',
      label: `Relieved system pressure (${basisLabel})`,
      desc: 'Steady state with the relief devices in their final state',
      color: 'var(--color-success)',
      bgActive: 'var(--color-success-tint)',
      borderActive: 'var(--color-success)',
      textActive: 'var(--color-success-text)'
    },
    {
      id: 'peak',
      label: `Peak system pressure (${basisLabel})`,
      desc: 'Steady state at the moment the governing relief device reaches its set pressure (pumps and sources ramped up)',
      color: 'var(--color-warning-text)',
      bgActive: 'var(--color-warning-bg)',
      borderActive: 'var(--color-primary)',
      textActive: 'var(--color-warning-text-strong)'
    },
    {
      id: 'unmitigated_global',
      label: `Unmitigated peak pressure (${basisLabel})`,
      desc: 'Steady state with all relief devices held closed',
      color: 'var(--color-danger)',
      bgActive: 'var(--color-danger-tint)',
      borderActive: 'var(--color-danger)',
      textActive: 'var(--color-danger-text)'
    }
  ];

  // Explain the Peak view when it has no separate snapshot
  const activePeak = cases.find(c => c.id === activeCaseId)?.telemetry?.relief?.peak;
  let peakNote = null;
  if (telemetryMode === 'peak' && activePeak) {
    if (!activePeak.available) peakNote = `Peak not available: ${activePeak.reason} Showing the relieved state.`;
    else if (activePeak.source !== 'opening') peakNote = 'The peak equals the relieved state, so the relieved results are shown.';
  }

  return (
    <div className="canvas-overlay-card">
      <style>
        {`
          .relief-scenario-btn {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 10px;
            border-radius: 8px;
            border: 1px solid var(--color-border);
            background-color: var(--color-surface);
            cursor: pointer;
            text-align: left;
            font-family: inherit;
            transition: all 0.15s ease;
          }
          .relief-scenario-btn:hover {
            background-color: var(--color-surface-hover);
            border-color: var(--color-border-hover);
          }
          .relief-scenario-btn:focus-visible {
            border-color: var(--color-primary);
            box-shadow: 0 0 0 2px var(--color-primary-glow);
          }
          .relief-scenario-close {
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
            justify-content: center;
            transition: all 0.15s ease;
          }
          .relief-scenario-close:hover {
            background-color: var(--color-surface-hover);
            color: var(--color-text-primary);
          }
          .relief-scenario-close:focus-visible {
            border-color: var(--color-primary);
            box-shadow: 0 0 0 2px var(--color-primary-glow);
          }
        `}
      </style>

      {/* Top-Right Close Button */}
      {onClose && (
        <button 
          onClick={onClose} 
          className="relief-scenario-close"
          title="Close relief scenario manager"
          aria-label="Close relief scenario manager"
        >
          <CrossIcon size={14} />
        </button>
      )}

      {/* Panel Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 'var(--fs-base)', fontWeight: 700, color: 'var(--color-brand-dark)' }}>
          Relief scenario manager
        </span>
      </div>

      {/* Relief scenario selection */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--color-text-secondary)', letterSpacing: '0.04em' }}>
          Relief scenario
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {reliefModes.map((mode) => {
            const isActive = telemetryMode === mode.id;
            return (
              <button
                key={mode.id}
                onClick={() => onToggleTelemetryMode && onToggleTelemetryMode(mode.id)}
                aria-pressed={isActive}
                title={mode.desc}
                className="relief-scenario-btn"
                style={{
                  borderColor: isActive ? mode.borderActive : 'var(--color-border)',
                  backgroundColor: isActive ? mode.bgActive : 'var(--color-surface)',
                  boxShadow: isActive ? 'var(--shadow-sm)' : 'none'
                }}
              >
                {/* Status Dot */}
                <div style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: mode.color,
                  flexShrink: 0
                }} />
                
                <span style={{ 
                  fontSize: 'var(--fs-xs)', 
                  fontWeight: '700', 
                  color: isActive ? mode.textActive : 'var(--color-text-primary)' 
                }}>
                  {mode.label}
                </span>
                {isActive && <span aria-hidden="true" style={{ marginLeft: 'auto', fontSize: 'var(--fs-xs)', fontWeight: 700, color: mode.textActive, display: 'inline-flex', alignItems: 'center', gap: '3px' }}><CheckIcon size={11} /> On</span>}
              </button>
            );
          })}
        </div>
        {peakNote && (
          <p role="status" style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', margin: '2px 0 0' }}>
            {peakNote}
          </p>
        )}
      </div>
    </div>
  );
}
