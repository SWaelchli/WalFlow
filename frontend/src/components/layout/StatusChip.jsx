import { useEffect, useId, useRef } from 'react';
import { CheckIcon, CrossIcon, InfoIcon, SpinnerIcon, WarningIcon } from '../symbols/IconLibrary';
import SolverStats from './SolverStats';

// Tones are CSS classes (.tone-*). Every tone also has an icon and a text label, never colour alone.
const TONE_CLASSES = ['neutral', 'ok', 'warn', 'bad', 'busy'];

const ToneIcon = ({ tone }) => {
  if (tone === 'ok') return <CheckIcon size={12} />;
  if (tone === 'bad') return <CrossIcon size={12} />;
  if (tone === 'warn') return <WarningIcon size={12} />;
  if (tone === 'busy') return <SpinnerIcon size={12} />;
  return <InfoIcon size={12} />;
};

const FindingRow = ({ finding, onSelect }) => {
  const isError = finding.severity === 'error';
  const target = finding.nodeIds?.[0] ? { id: finding.nodeIds[0], type: 'Node' }
    : finding.edgeIds?.[0] ? { id: finding.edgeIds[0], type: 'Connection' } : null; // 'Connection' is the selection type id, not display text
  return (
    <li className="status-finding">
      <span className="status-finding-icon">
        {isError ? <CrossIcon size={12} color="var(--color-danger-text)" /> : <WarningIcon size={12} color="var(--color-warning-text-strong)" />}
      </span>
      <span className="status-finding-text">
        <span className={isError ? 'status-finding-error' : 'status-finding-warning'}>{isError ? 'Error: ' : 'Warning: '}</span>
        {finding.message}
      </span>
      {target && onSelect && (
        <button type="button" className="btn-secondary status-finding-show" onClick={() => onSelect(target.id, target.type)}>
          Show
        </button>
      )}
    </li>
  );
};

/**
 * Status bar run result slot. Click opens a flyout with the result of the last run, the pre-run checks and the solver statistics.
 * The Warnings slot opens the same flyout; its trigger carries `data-status-flyout-trigger` so a click on it is not an outside click.
 * Findings come from utils/networkValidation, notes from utils/runStatus.
 */
export default function StatusChip({ status, lastRunAt = null, errors = [], warnings = [], notes = [], runError, runErrorDetail = null, stats = null, batchStats = null, open, onToggle, onClose, onSelect }) {
  const rootRef = useRef(null);
  const panelId = useId();
  const tone = TONE_CLASSES.includes(status.tone) ? status.tone : 'neutral';
  const findings = [...errors, ...warnings];
  const count = findings.length;

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { onClose(); rootRef.current?.querySelector('button')?.focus(); } };
    const onDown = (e) => { if (rootRef.current && !rootRef.current.contains(e.target) && !e.target.closest?.('[data-status-flyout-trigger]')) onClose(); };
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
    <div ref={rootRef} className="status-chip-root">
      <button
        type="button"
        className={`status-chip tone-${tone}`}
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title="Solver status, model checks and statistics"
      >
        <ToneIcon tone={tone} />
        <span role="status" aria-live="polite">{status.label}</span>
        {lastRunLabel && (
          <span title="Time of the last run" className="status-chip-time">· {lastRunLabel}</span>
        )}
      </button>

      {open && (
        <div id={panelId} role="dialog" aria-label="Solver status, model checks and statistics" className="status-flyout">
          <h2 className="status-flyout-title">{status.label}</h2>
          {lastRunLabel && <p className="status-flyout-meta">Last run at {lastRunLabel}</p>}

          {runError && <p className="status-flyout-error">{runError}</p>}
          {runError && runErrorDetail && <p className="status-flyout-detail">{runErrorDetail}</p>}
          {detailNotes.length > 0 && (
            <ul className="status-finding-list">
              {detailNotes.map((n, i) => (
                <FindingRow key={`n${i}`} finding={{ severity: n.severity, message: n.text, nodeIds: n.nodeId ? [n.nodeId] : [] }} onSelect={onSelect} />
              ))}
            </ul>
          )}

          <h3 className="status-flyout-heading">Model checks{summary ? `: ${summary}` : ''}</h3>
          {count === 0 ? (
            <p className="status-flyout-meta">No problems found before running.</p>
          ) : (
            <ul className="status-finding-list">
              {findings.map((f, i) => <FindingRow key={`${f.code}-${i}`} finding={f} onSelect={onSelect} />)}
            </ul>
          )}
          {errors.length > 0 && (
            <p className="status-flyout-meta">Errors must be fixed before the simulation can run. Warnings do not block it.</p>
          )}

          <h3 className="status-flyout-heading">Solver statistics</h3>
          <SolverStats stats={stats} batchStats={batchStats} onSelectComponent={onSelect} />
        </div>
      )}
    </div>
  );
}
