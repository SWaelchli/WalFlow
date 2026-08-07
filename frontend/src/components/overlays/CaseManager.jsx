import React from 'react';

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
      desc: 'Steady-state max pressure with active relief',
      color: '#10B981',
      bgActive: '#ECFDF5',
      borderActive: '#10B981',
      textActive: '#065F46'
    },
    {
      id: 'peak',
      label: 'Peak system pressure (bar(a))',
      desc: 'Max pressure at relief device activation',
      color: '#D97706',
      bgActive: '#FFFBEB',
      borderActive: '#FA8507',
      textActive: '#92400E'
    },
    {
      id: 'unmitigated_global',
      label: 'Unmitigated peak pressure (bar(a))',
      desc: 'Baseline peak pressure with all relief closed',
      color: '#DC2626',
      bgActive: '#FEF2F2',
      borderActive: '#DC2626',
      textActive: '#991B1B'
    }
  ];

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
      gap: '12px',
      transition: 'top 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
      ...style
    }}>
      {/* Top-Right Close Button */}
      {onClose && (
        <button 
          onClick={onClose} 
          title="Close Case Manager"
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
        >
          ✕
        </button>
      )}

      {/* Panel Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: '#395253' }}>
          Scenario & Case Manager
        </span>
      </div>

      {/* Operating Case Selection */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '10px', fontWeight: 700, color: '#587071', letterSpacing: '0.04em' }}>
          Operating Case
        </label>
        <select
          value={activeCaseId}
          onChange={(e) => onSelectCase && onSelectCase(e.target.value)}
          style={{
            padding: '6px 10px',
            borderRadius: '8px',
            border: '1px solid #D8E2E1',
            backgroundColor: '#F4F7F6',
            color: '#1C2B2C',
            fontFamily: 'inherit',
            fontSize: '11px',
            fontWeight: '700',
            cursor: 'pointer',
            outline: 'none',
            transition: 'border-color 0.2s',
            width: '100%'
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
        <label style={{ fontSize: '10px', fontWeight: 700, color: '#587071', letterSpacing: '0.04em' }}>
          Relief Case View
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {reliefModes.map((mode) => {
            const isActive = telemetryMode === mode.id;
            return (
              <button
                key={mode.id}
                onClick={() => onToggleTelemetryMode && onToggleTelemetryMode(mode.id)}
                title={mode.desc}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 10px',
                  borderRadius: '8px',
                  border: '1px solid',
                  borderColor: isActive ? mode.borderActive : '#D8E2E1',
                  backgroundColor: isActive ? mode.bgActive : '#ffffff',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontFamily: 'inherit',
                  transition: 'all 0.15s ease',
                  boxShadow: isActive ? `0 2px 8px rgba(0, 0, 0, 0.04)` : 'none'
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = '#F4F7F6';
                    e.currentTarget.style.borderColor = '#B8C9C8';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = '#ffffff';
                    e.currentTarget.style.borderColor = '#D8E2E1';
                  }
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
                  color: isActive ? mode.textActive : '#1C2B2C' 
                }}>
                  {mode.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
