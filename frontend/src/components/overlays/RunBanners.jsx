import { useState } from 'react';
import { CrossIcon, WarningIcon } from '../symbols/IconLibrary';

const ICON_COLOR = { error: 'var(--color-danger-text)', warning: 'var(--color-warning-text-strong)' };

/**
 * Info bars at the top edge of the canvas for the outcome of the last run: solver errors and result warnings.
 * Full canvas width, stacked inline (they push the canvas down, not over it).
 * Dismissed banners stay hidden until a new result arrives. `children` (stale / rejected-change banner) share the stack.
 */
export default function RunBanners({ runError, runErrorId, runErrorTarget = null, runErrorDetail = null, summary, resultKey, onSelect, onOpenStatus, children }) {
  // What was dismissed: the error id and the result object. A new error or result is a new key, so it shows again.
  const [dismissed, setDismissed] = useState({ error: null, summary: null });
  // Raw solver text of the error, shown on request (the error id keys it, so a new error starts collapsed)
  const [detailOpenId, setDetailOpenId] = useState(null);

  const summaryHidden = dismissed.summary === resultKey;
  const items = [];

  if (runError && dismissed.error !== runErrorId) {
    const detailOpen = detailOpenId === runErrorId;
    items.push({
      key: 'error', tone: 'error', text: runError, close: () => setDismissed(d => ({ ...d, error: runErrorId })),
      target: runErrorTarget?.id, targetType: runErrorTarget?.type,
      detail: runErrorDetail, detailOpen, toggleDetail: () => setDetailOpenId(detailOpen ? null : runErrorId),
    });
  }
  if (summary && !summaryHidden) {
    const first = summary.notes[0];
    const more = summary.notes.length - 1;
    const close = () => setDismissed(d => ({ ...d, summary: resultKey }));
    if (summary.level === 'failed' && !runError) {
      items.push({ key: 'failed', tone: 'error', text: summary.detail, target: first?.nodeId, close });
    } else if (summary.level === 'nothing') {
      items.push({ key: 'nothing', tone: 'warning', text: `${summary.headline}: ${summary.detail}`, close });
    } else if (summary.level === 'warning') {
      items.push({
        key: 'summary', tone: 'warning', text: `${summary.headline}: ${first.text}${more > 0 ? ` (+${more} more)` : ''}`,
        target: first.nodeId, showStatus: more > 0, close,
      });
    }
  }

  if (items.length === 0 && !children) return null;

  return (
    <div className="canvas-infobars">
      {items.map((it) => (
        <div key={it.key} role={it.tone === 'error' ? 'alert' : 'status'} className={`infobar infobar-${it.tone}`}>
          <span className="infobar-icon">
            {it.tone === 'error' ? <CrossIcon size={13} color={ICON_COLOR.error} /> : <WarningIcon size={13} color={ICON_COLOR.warning} />}
          </span>
          <span className="infobar-text">
            {it.text}
            {it.detail && it.detailOpen && <span className="infobar-detail">{it.detail}</span>}
          </span>
          {it.target && (
            <button type="button" className="btn-secondary infobar-action" onClick={() => onSelect?.(it.target, it.targetType || 'Node')}>Show</button>
          )}
          {it.detail && (
            <button type="button" className="btn-secondary infobar-action" aria-expanded={it.detailOpen} onClick={it.toggleDetail}>Details</button>
          )}
          {it.showStatus && (
            <button type="button" className="btn-secondary infobar-action" onClick={onOpenStatus}>Details</button>
          )}
          <button type="button" onClick={it.close} aria-label="Dismiss message" className="infobar-close">×</button>
        </div>
      ))}
      {children}
    </div>
  );
}
