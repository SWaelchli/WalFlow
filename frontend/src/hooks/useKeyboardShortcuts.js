import { useEffect, useRef } from 'react';
import { findCommandForKey, READ_ONLY_REASON } from '../commands';

/** An open modal owns the keyboard; the canvas shortcuts must not act behind it. */
export const isModalOpen = () => typeof document !== 'undefined' && document.querySelector('.modal-overlay, [role="dialog"], [aria-modal="true"]') !== null;

/** Text selected on the page (results, tables) is copied natively, not as canvas components. */
export const hasTextSelection = () => {
  const sel = typeof window !== 'undefined' && window.getSelection ? window.getSelection() : null;
  return !!sel && !sel.isCollapsed && sel.toString().trim() !== '';
};

/**
 * Keyboard shortcuts, taken from the command list. `ctx` is the command context App.jsx builds each render.
 * A command runs when it is enabled; on a read-only drawing it still runs, so its handler shows the read-only notice.
 */
export function useKeyboardShortcuts(ctx) {
  const ctxRef = useRef(ctx);
  useEffect(() => { ctxRef.current = ctx; });

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        const activeEl = document.activeElement;
        if (
          activeEl &&
          activeEl.tagName === 'INPUT' &&
          !['checkbox', 'radio', 'button', 'submit', 'image', 'reset', 'file', 'range', 'color'].includes(activeEl.type)
        ) {
          activeEl.blur();
          return;
        }
      }

      const activeEl = document.activeElement;
      const isInputActive =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.tagName === 'SELECT' ||
          activeEl.isContentEditable);

      if (isInputActive || isModalOpen()) {
        return;
      }

      const command = findCommandForKey(e);
      if (!command) return;

      // Text selected on the page is copied natively, not as canvas components
      if (command.id === 'edit.copy' && hasTextSelection()) return;

      e.preventDefault();
      const current = ctxRef.current;
      if (!current) return;
      const enabled = command.isEnabled(current);
      if (enabled === true || enabled === READ_ONLY_REASON) command.run(current);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
