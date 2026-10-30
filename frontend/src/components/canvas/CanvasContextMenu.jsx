import React, { useEffect, useRef } from 'react';

/**
 * Right-click menu for components, pipes and the empty canvas.
 * items: [{ id, label, shortcut, disabled, title (reason shown as tooltip), danger, onSelect }]; a falsy entry is skipped, `{ separator: true }` draws a rule.
 */
export default function CanvasContextMenu({ x, y, items, onClose, label = 'Canvas actions', width = 200 }) {
  const ref = useRef(null);

  useEffect(() => {
    const first = ref.current?.querySelector('button:not(:disabled)');
    first?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const buttons = [...ref.current.querySelectorAll('button:not(:disabled)')];
      const at = buttons.indexOf(document.activeElement);
      const next = e.key === 'ArrowDown' ? (at + 1) % buttons.length : (at - 1 + buttons.length) % buttons.length;
      buttons[next]?.focus();
    };
    const onOutside = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onOutside, true);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onOutside, true);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  // keep the menu inside the window
  const height = items.filter(Boolean).length * 32 + 12;
  const left = Math.max(4, Math.min(x, window.innerWidth - width - 4));
  const top = Math.max(4, Math.min(y, window.innerHeight - height - 4));

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: 'fixed', left, top, width, zIndex: 9000, padding: '6px', background: 'var(--color-surface)',
        border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)',
      }}
    >
      {items.filter(Boolean).map((item, i) => (item.separator ? (
        <div key={`sep-${i}`} role="separator" style={{ height: '1px', background: 'var(--color-border)', margin: '4px 2px' }} />
      ) : (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          title={item.title}
          onClick={() => { onClose(); item.onSelect(); }}
          className="context-menu-item"
          style={item.danger ? { color: 'var(--color-danger-text)' } : undefined}
        >
          <span>{item.label}</span>
          {item.shortcut && <span className="context-menu-shortcut">{item.shortcut}</span>}
        </button>
      )))}
    </div>
  );
}
