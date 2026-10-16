import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { subscribeDialogs, getDialogState, dismissToast, resolveModal } from '../../utils/dialogs';
import { InfoIcon, CheckIcon, WarningIcon, CrossIcon } from '../symbols/IconLibrary';

const TOAST_STYLE = {
  info: { bar: '#395253', icon: <InfoIcon size={12} weight="bold" />, label: 'Info' },
  success: { bar: '#047857', icon: <CheckIcon size={12} />, label: 'Done' },
  warning: { bar: '#B45309', icon: <WarningIcon size={12} weight="bold" />, label: 'Warning' },
  error: { bar: '#B91C1C', icon: <CrossIcon size={12} weight="bold" />, label: 'Error' },
};

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

function Toasts({ toasts }) {
  return (
    <div
      aria-live="polite"
      style={{
        position: 'fixed', top: '68px', right: '16px', zIndex: 100000, display: 'flex', flexDirection: 'column',
        gap: '8px', width: 'min(380px, calc(100vw - 32px))', pointerEvents: 'none',
      }}
    >
      {toasts.map((t) => {
        const s = TOAST_STYLE[t.type] || TOAST_STYLE.info;
        return (
          <div
            key={t.id}
            role={t.type === 'error' ? 'alert' : 'status'}
            style={{
              pointerEvents: 'auto', display: 'flex', alignItems: 'flex-start', gap: '10px', background: '#FFFFFF',
              color: '#1C2B2C', border: '1px solid #D8E2E1', borderLeft: `4px solid ${s.bar}`, borderRadius: '10px',
              padding: '10px 12px', fontSize: 'var(--fs-base)', lineHeight: 1.4, boxShadow: '0 8px 20px rgba(28, 43, 44, 0.16)',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                flex: '0 0 auto', width: '18px', height: '18px', borderRadius: '50%', background: s.bar, color: '#FFFFFF',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--fs-xs)', fontWeight: 800,
              }}
            >
              {s.icon}
            </span>
            <span style={{ flex: 1, whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>
              <span className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{s.label}: </span>
              {t.message}
            </span>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              aria-label="Dismiss message"
              style={{ background: 'transparent', border: 'none', color: '#587071', cursor: 'pointer', lineHeight: 1, padding: '2px 4px', display: 'inline-flex' }}
            >
              <CrossIcon size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function ModalDialog({ modal }) {
  const titleId = useId();
  const messageId = useId();
  const inputId = useId();
  const panelRef = useRef(null);
  const [text, setText] = useState(modal.initial || '');
  const isName = modal.kind === 'name';
  const canSubmit = !isName || text.trim().length > 0;

  // Focus goes into the dialog, stays inside it, and returns to the opener when it closes
  useEffect(() => {
    const opener = document.activeElement;
    const panel = panelRef.current;
    const first = panel?.querySelector(isName ? 'input' : '[data-autofocus]') || panel?.querySelector(FOCUSABLE);
    first?.focus();
    if (isName) first?.select?.();
    return () => { if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus(); };
  }, [isName]);

  const submit = () => {
    if (!canSubmit) return;
    resolveModal(isName ? text.trim() : true);
  };
  const cancel = () => resolveModal(isName ? null : false);

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); cancel(); return; }
    if (e.key === 'Enter' && isName && e.target.tagName === 'INPUT') { e.preventDefault(); submit(); return; }
    if (e.key !== 'Tab') return;
    const items = [...panelRef.current.querySelectorAll(FOCUSABLE)];
    if (items.length === 0) return;
    const firstEl = items[0];
    const lastEl = items[items.length - 1];
    if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
    else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
  };

  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) cancel(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(28, 43, 44, 0.5)', zIndex: 100001,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
      }}
    >
      <div
        ref={panelRef}
        role={isName ? 'dialog' : 'alertdialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={isName ? undefined : messageId}
        onKeyDown={onKeyDown}
        style={{
          background: '#FFFFFF', color: '#1C2B2C', borderRadius: '14px', border: '1px solid #D8E2E1',
          width: 'min(440px, 100%)', padding: '20px', boxShadow: '0 20px 45px rgba(28, 43, 44, 0.3)',
        }}
      >
        <h2 id={titleId} style={{ margin: '0 0 10px', fontSize: 'var(--fs-lg)', fontWeight: 700 }}>{modal.title}</h2>
        {isName ? (
          <div style={{ marginBottom: '16px' }}>
            <label htmlFor={inputId} style={{ display: 'block', fontSize: 'var(--fs-sm)', fontWeight: 600, color: '#587071', marginBottom: '6px' }}>
              {modal.label}
            </label>
            <input
              id={inputId}
              className="form-input"
              type="text"
              value={text}
              placeholder={modal.placeholder}
              maxLength={80}
              onChange={(e) => setText(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>
        ) : (
          <p id={messageId} style={{ margin: '0 0 18px', fontSize: 'var(--fs-base)', lineHeight: 1.5, color: '#1C2B2C', whiteSpace: 'pre-line' }}>
            {modal.message}
          </p>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button type="button" className="btn-secondary" onClick={cancel} data-autofocus={modal.danger ? '' : undefined}>
            {modal.cancelLabel}
          </button>
          <button
            type="button"
            className={modal.danger ? undefined : 'btn-primary'}
            onClick={submit}
            disabled={!canSubmit}
            data-autofocus={modal.danger ? undefined : ''}
            style={modal.danger ? {
              background: '#B91C1C', color: '#FFFFFF', border: 'none', borderRadius: '8px', padding: '0 16px',
              height: '34px', fontWeight: 700, fontSize: 'var(--fs-base)', cursor: 'pointer',
            } : undefined}
          >
            {modal.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Mount once near the root: renders toasts and the modal that notify / confirmDialog / askName ask for. */
export default function DialogHost() {
  const { toasts, modal } = useSyncExternalStore(subscribeDialogs, getDialogState);
  return (
    <>
      <Toasts toasts={toasts} />
      {modal && <ModalDialog key={modal.id} modal={modal} />}
    </>
  );
}
