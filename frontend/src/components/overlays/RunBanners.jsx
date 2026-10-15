import { useState } from 'react';
import { CrossIcon, WarningIcon } from '../symbols/IconLibrary';

const BANNER_TONES = {
  error: { bg: '#FEF2F2', border: '#FEE2E2', color: '#B91C1C' },
  warning: { bg: '#FFF7ED', border: '#FDE3C3', color: '#7A3E00' },
};

/**
 * Banners over the canvas for the outcome of the last run (F3-04): solver errors and result warnings.
 * Dismissed banners stay hidden until a new result arrives. `children` (stale / rejected-change banner) share the stack.
 */
export default function RunBanners({ runError, runErrorId, summary, resultKey, onSelect, onOpenStatus, children }) {
  // What was dismissed: the error id and the result object. A new error or result is a new key, so it shows again.
  const [dismissed, setDismissed] = useState({ error: null, summary: null });

  const summaryHidden = dismissed.summary === resultKey;
  const items = [];

  if (runError && dismissed.error !== runErrorId) {
    items.push({ key: 'error', tone: 'error', text: runError, close: () => setDismissed(d => ({ ...d, error: runErrorId })) });
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
    <div style={{
      position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 20, display: 'flex',
      flexDirection: 'column', gap: '8px', alignItems: 'center', width: 'min(640px, calc(100% - 32px))', pointerEvents: 'none',
    }}>
      {items.map((it) => {
        const t = BANNER_TONES[it.tone];
        return (
          <div
            key={it.key}
            role={it.tone === 'error' ? 'alert' : 'status'}
            style={{
              pointerEvents: 'auto', display: 'flex', alignItems: 'flex-start', gap: '10px', width: '100%', boxSizing: 'border-box',
              padding: '8px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, lineHeight: 1.45,
              background: t.bg, border: `1px solid ${t.border}`, color: t.color, boxShadow: '0 2px 8px rgba(28, 43, 44, 0.12)',
            }}
          >
            <span style={{ flex: '0 0 auto', marginTop: '1px' }}>
              {it.tone === 'error' ? <CrossIcon size={13} color={t.color} /> : <WarningIcon size={13} color={t.color} />}
            </span>
            <span style={{ flex: 1, overflowWrap: 'anywhere' }}>{it.text}</span>
            {it.target && (
              <button type="button" className="btn-secondary" style={{ height: '24px', padding: '0 8px', fontSize: '11px', flex: '0 0 auto' }}
                onClick={() => onSelect?.(it.target, 'Node')}>Show</button>
            )}
            {it.showStatus && (
              <button type="button" className="btn-secondary" style={{ height: '24px', padding: '0 8px', fontSize: '11px', flex: '0 0 auto' }}
                onClick={onOpenStatus}>Details</button>
            )}
            <button type="button" onClick={it.close} aria-label="Dismiss message"
              style={{ background: 'transparent', border: 'none', color: t.color, cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: '0 2px', flex: '0 0 auto' }}>
              ×
            </button>
          </div>
        );
      })}
      {children}
    </div>
  );
}
