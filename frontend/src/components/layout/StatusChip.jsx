import { useEffect, useId, useRef } from 'react';
import { CheckIcon, CrossIcon, InfoIcon, SpinnerIcon, WarningIcon } from '../symbols/IconLibrary';

// Text colour, background and border per tone. Every tone also has an icon and a text label, never colour alone.
const TONES = {
  neutral: { color: '#587071', bg: '#F4F7F6', border: '#D8E2E1' },
  ok: { color: '#166534', bg: '#F0FDF4', border: '#BBF7D0' },
  warn: { color: '#7A3E00', bg: '#FFF7ED', border: '#FDE3C3' },
  bad: { color: '#B91C1C', bg: '#FEF2F2', border: '#FEE2E2' },
  busy: { color: '#395253', bg: '#F4F7F6', border: '#D8E2E1' },
};

const ToneIcon = ({ tone }) => {
  const color = TONES[tone].color;
  if (tone === 'ok') return <CheckIcon size={12} color={color} />;
  if (tone === 'bad') return <CrossIcon size={12} color={color} />;
  if (tone === 'warn') return <WarningIcon size={12} color={color} />;
  if (tone === 'busy') return <SpinnerIcon size={12} color={color} />;
  return <InfoIcon size={12} color={color} />;
};

const FindingRow = ({ finding, onSelect }) => {
  const isError = finding.severity === 'error';
  const target = finding.nodeIds?.[0] ? { id: finding.nodeIds[0], type: 'Node' }
    : finding.edgeIds?.[0] ? { id: finding.edgeIds[0], type: 'Connection' } : null; // 'Connection' is the selection type id, not display text
  return (
    <li style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '8px 0', borderTop: '1px solid #EBF0EF' }}>
      <span style={{ flex: '0 0 auto', marginTop: '2px' }}>
        {isError ? <CrossIcon size={12} color="#B91C1C" /> : <WarningIcon size={12} color="#7A3E00" />}
      </span>
      <span style={{ flex: 1, fontSize: 'var(--fs-sm)', lineHeight: 1.45, color: '#1C2B2C' }}>
        <span style={{ fontWeight: 700, color: isError ? '#B91C1C' : '#7A3E00' }}>{isError ? 'Error: ' : 'Warning: '}</span>
        {finding.message}
      </span>
      {target && onSelect && (
        <button type="button" className="btn-secondary" style={{ height: '24px', padding: '0 8px', fontSize: 'var(--fs-xs)' }}
          onClick={() => onSelect(target.id, target.type)}>
          Show
        </button>
      )}
    </li>
  );
};

/**
 * Navbar status chip. Click opens a panel with the result of the last run and the pre-run checks.
 * Findings come from utils/networkValidation, notes from utils/runStatus.
 */
export default function StatusChip({ status, lastRunAt = null, errors = [], warnings = [], notes = [], runError, runErrorDetail = null, open, onToggle, onClose, onSelect }) {
  const rootRef = useRef(null);
  const panelId = useId();
  const tone = TONES[status.tone] || TONES.neutral;
  const findings = [...errors, ...warnings];
  const count = findings.length;

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { onClose(); rootRef.current?.querySelector('button')?.focus(); } };
    const onDown = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) onClose(); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, [open, onClose]);

  const detailNotes = notes.filter(Boolean);
  const lastRunLabel = lastRunAt && status.tone !== 'busy'
    ? lastRunAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;
  const summary = count ? `${errors.length ? `${errors.length} error${errors.length > 1 ? 's' : ''}` : ''}${errors.length && warnings.length ? ', ' : ''}${warnings.length ? `${warnings.length} warning${warnings.length > 1 ? 's' : ''}` : ''}` : '';

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title="Solver status and model checks"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px', height: '34px', padding: '0 12px', borderRadius: '8px',
          background: tone.bg, border: `1px solid ${tone.border}`, color: tone.color, fontSize: 'var(--fs-sm)', fontWeight: 700,
          cursor: 'pointer', whiteSpace: 'nowrap', boxSizing: 'border-box',
        }}
      >
        <ToneIcon tone={status.tone} />
        <span role="status" aria-live="polite">{status.label}</span>
        {lastRunLabel && (
          <span title="Time of the last run" style={{ fontWeight: 500, opacity: 0.8 }}>· {lastRunLabel}</span>
        )}
        {count > 0 && (
          <span style={{
            marginLeft: '2px', padding: '1px 7px', borderRadius: '10px', fontSize: 'var(--fs-xs)', fontWeight: 700,
            background: errors.length ? '#B91C1C' : '#7A3E00', color: '#FFFFFF',
          }}>
            {count}
          </span>
        )}
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Solver status and model checks"
          style={{
            position: 'absolute', top: '42px', left: 0, width: 'min(460px, calc(100vw - 32px))', maxHeight: '60vh', overflowY: 'auto',
            background: '#FFFFFF', border: '1px solid #D8E2E1', borderRadius: '12px', padding: '14px 16px',
            boxShadow: '0 12px 28px rgba(28, 43, 44, 0.2)', zIndex: 60,
          }}
        >
          <h2 style={{ margin: '0 0 4px', fontSize: 'var(--fs-base)', fontWeight: 700, color: '#1C2B2C' }}>{status.label}</h2>
          {lastRunLabel && <p style={{ margin: '0 0 6px', fontSize: 'var(--fs-xs)', color: '#587071' }}>Last run at {lastRunLabel}</p>}

          {runError && <p style={{ margin: '4px 0 8px', fontSize: 'var(--fs-sm)', color: '#B91C1C', lineHeight: 1.45 }}>{runError}</p>}
          {runError && runErrorDetail && (
            <p style={{ margin: '-4px 0 8px', fontSize: 'var(--fs-xs)', color: '#587071', fontFamily: 'monospace', lineHeight: 1.4, overflowWrap: 'anywhere' }}>{runErrorDetail}</p>
          )}
          {detailNotes.length > 0 && (
            <ul style={{ listStyle: 'none', margin: '4px 0 8px', padding: 0 }}>
              {detailNotes.map((n, i) => (
                <FindingRow key={`n${i}`} finding={{ severity: n.severity, message: n.text, nodeIds: n.nodeId ? [n.nodeId] : [] }} onSelect={onSelect} />
              ))}
            </ul>
          )}

          <h3 style={{ margin: '8px 0 0', fontSize: 'var(--fs-sm)', fontWeight: 700, color: '#587071', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Model checks{summary ? `: ${summary}` : ''}
          </h3>
          {count === 0 ? (
            <p style={{ margin: '6px 0 0', fontSize: 'var(--fs-sm)', color: '#587071' }}>No problems found before running.</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: '4px 0 0', padding: 0 }}>
              {findings.map((f, i) => <FindingRow key={`${f.code}-${i}`} finding={f} onSelect={onSelect} />)}
            </ul>
          )}
          {errors.length > 0 && (
            <p style={{ margin: '8px 0 0', fontSize: 'var(--fs-xs)', color: '#587071' }}>Errors must be fixed before the simulation can run. Warnings do not block it.</p>
          )}
        </div>
      )}
    </div>
  );
}
