import React from 'react';
import { CrossIcon } from '../symbols/IconLibrary';

/**
 * CaseManager component provides a floating dashboard panel on the canvas
 * to control active Operating Scenario and Contingency Telemetry View (Relief Case).
 */
export default function CaseManager({
  cases = [],
  activeCaseId = 'case_base',
  onSelectCase,
  telemetryMode = 'mitigated',
  onToggleTelemetryMode,
  onClose,
  style = {}
}) {
  const reliefModes = [
    {
      id: 'mitigated',
      label: 'Relieved system pressure (bar(a))',
      desc: 'Steady state with the relief devices in their final state',
      color: '#10B981',
      bgActive: '#ECFDF5',
      borderActive: '#10B981',
      textActive: '#065F46'
    },
    {
      id: 'peak',
      label: 'Peak system pressure (bar(a))',
      desc: 'Steady state at the moment the governing relief device reaches its set pressure (pumps and sources ramped up)',
      color: '#D97706',
      bgActive: '#FFFBEB',
      borderActive: 'var(--color-primary)',
      textActive: '#92400E'
    },
    {
      id: 'unmitigated_global',
      label: 'Unmitigated peak pressure (bar(a))',
      desc: 'Steady state with all relief devices held closed',
      color: '#DC2626',
      bgActive: '#FEF2F2',
      borderActive: '#DC2626',
      textActive: '#991B1B'
    }
  ];

  // F1-08: explain the Peak view when it has no separate snapshot
  const activePeak = cases.find(c => c.id === activeCaseId)?.telemetry?.relief?.peak;
  let peakNote = null;
  if (telemetryMode === 'peak' && activePeak) {
    if (!activePeak.available) peakNote = `Peak not available: ${activePeak.reason} Showing the relieved state.`;
    else if (activePeak.source !== 'opening') peakNote = 'The peak equals the relieved state, so the relieved results are shown.';
  }

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
      transition: 'top 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
      ...style
    }}>
      <style>
        {`
          .case-manager-btn {
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
          .case-manager-btn:hover {
            background-color: var(--color-surface-hover);
            border-color: var(--color-border-hover);
          }
          .case-manager-btn:focus-visible {
            border-color: var(--color-primary);
            box-shadow: 0 0 0 2px var(--color-primary-glow);
          }
          .case-manager-close {
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
          .case-manager-close:hover {
            background-color: var(--color-surface-hover);
            color: var(--color-text-primary);
          }
          .case-manager-close:focus-visible {
            border-color: var(--color-primary);
            box-shadow: 0 0 0 2px var(--color-primary-glow);
          }
        `}
      </style>

      {/* Top-Right Close Button */}
      {onClose && (
        <button 
          onClick={onClose} 
          className="case-manager-close"
          title="Close Case Manager"
        >
          <CrossIcon size={14} />
        </button>
      )}

      {/* Panel Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-brand-dark)' }}>
          Scenario & Case Manager
        </span>
      </div>

      {/* Operating Case Selection */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-text-secondary)', letterSpacing: '0.04em' }}>
          Operating Case
        </label>
        <select
          value={activeCaseId}
          onChange={(e) => onSelectCase && onSelectCase(e.target.value)}
          className="form-select"
          style={{
            width: '100%',
            fontWeight: '700',
            fontSize: '11px'
          }}
        >
          {cases.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} {c.is_base ? '(Base Case)' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Relief contingency selection */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-text-secondary)', letterSpacing: '0.04em' }}>
          Relief Case View
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
                className="case-manager-btn"
                style={{
                  borderColor: isActive ? mode.borderActive : 'var(--color-border)',
                  backgroundColor: isActive ? mode.bgActive : 'var(--color-surface)',
                  boxShadow: isActive ? `0 2px 8px rgba(0, 0, 0, 0.04)` : 'none'
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
                  fontSize: '11px', 
                  fontWeight: '700', 
                  color: isActive ? mode.textActive : 'var(--color-text-primary)' 
                }}>
                  {mode.label}
                </span>
                {isActive && <span aria-hidden="true" style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: 700, color: mode.textActive }}>✓ On</span>}
              </button>
            );
          })}
        </div>
        {peakNote && (
          <p role="status" style={{ fontSize: '10px', color: 'var(--color-text-secondary)', margin: '2px 0 0' }}>
            {peakNote}
          </p>
        )}
      </div>
    </div>
  );
}
