import { useEffect, useRef } from 'react';
import { findCommandForKey, READ_ONLY_REASON } from '../commands';

/** An open modal owns the keyboard; the canvas shortcuts must not act behind it. */
export const isModalOpen = () => typeof document !== 'undefined' && document.querySelector('.modal-overlay, [role="dialog"], [aria-modal="true"]') !== null;

/** An open menu (menu bar or account) owns the keyboard: it moves with the arrow keys and closes on Esc itself. */
export const isMenuOpen = () => typeof document !== 'undefined' && document.querySelector('[role="menu"]') !== null;

/** Text selected on the page (results, tables) is copied natively, not as canvas components. */
export const hasTextSelection = () => {
  const sel = typeof window !== 'undefined' && window.getSelection ? window.getSelection() : null;
  return !!sel && !sel.isCollapsed && sel.toString().trim() !== '';
};

/** Ctrl or Cmd+S: the browser would open its own Save dialog. */
const isBrowserSave = (e) => (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 's';

/**
 * Keyboard shortcuts, taken from the command list of the open page (`ctx.page`). `ctx` is the command context
 * App.jsx builds each render.
 * A command runs when it is enabled; on a read-only drawing it still runs, so its handler shows the read-only notice.
 * Keys are ignored in text fields, while a menu or a modal is open, and (on a page) when something else already
 * handled the key; a command with `firesInInputs` (Save) is the exception for text fields. Ctrl+S never reaches
 * the browser.
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
          // In a dialog Enter belongs to the dialog (implicit form submit, primary action): do not blur first
          if (activeEl.closest('.modal-overlay, [role="dialog"], [aria-modal="true"]')) return;
          activeEl.blur();
          return;
        }
      }

      // Someone else (a menu, a number field) already used this key
      const handledElsewhere = e.defaultPrevented;
      if (isBrowserSave(e)) e.preventDefault();

      const current = ctxRef.current;
      if (!current) return;
      const page = current.page ?? 'drawing';

      const activeEl = document.activeElement;
      const isInputActive =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.tagName === 'SELECT' ||
          activeEl.isContentEditable);

      if (isModalOpen()) return;
      // A dialog that closed on this very Esc has already claimed the key (it may be gone from the DOM by now)
      if (handledElsewhere && e.key === 'Escape') return;

      const command = findCommandForKey(e, page);
      if (!command) return;
      // Hidden for this user (role, tab): its key does nothing either
      if (command.isVisible && !command.isVisible(current)) return;
      if (isInputActive && !command.firesInInputs) return;
      if (isMenuOpen() || (page !== 'drawing' && handledElsewhere)) return;

      // Text selected on the page is copied natively, not as canvas components
      if (command.id === 'edit.copy' && hasTextSelection()) return;

      const canRun = (ctxNow) => {
        const enabled = command.isEnabled(ctxNow);
        return enabled === true || enabled === READ_ONLY_REASON;
      };

      if (isInputActive) {
        e.preventDefault();
        // Nothing to run (Ctrl+S with nothing to save): the field keeps the focus
        if (!canRun(current)) return;
        // The field commits its text on blur; run once that has rendered, against the latest state
        activeEl.blur();
        setTimeout(() => {
          const latest = ctxRef.current;
          if (latest && canRun(latest)) command.run(latest);
        }, 0);
        return;
      }

      // A page leaves the browser its keys (arrow scrolling, text editing) unless it handles them
      if (page === 'drawing' || command.isEnabled(current) === true || e.ctrlKey || e.metaKey) e.preventDefault();
      if (canRun(current)) command.run(current);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
