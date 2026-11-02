import { useEffect, useRef } from 'react';

/** A confirm or name dialog (DialogHost) is not a `.modal-overlay`; while one is open it keeps Esc and Enter to itself. */
export const isHostDialogOpen = () =>
  [...document.querySelectorAll('[aria-modal="true"]')].some((node) => !node.closest('.modal-overlay'));

/**
 * Esc runs `onEscape` while `active` is true (pass `false` for a dialog whose action is running, or that has
 * another dialog on top). The key is claimed with `preventDefault()` synchronously, so the page shortcuts
 * (useKeyboardShortcuts, AppShell), which skip a key someone already handled, do not also act on the same press
 * once the dialog has closed. A confirm dialog opened on top, or a key already handled, is left alone.
 */
export default function useEscapeKey(onEscape, active = true) {
  const handlerRef = useRef(onEscape);
  useEffect(() => { handlerRef.current = onEscape; });

  useEffect(() => {
    if (!active) return undefined;
    const onKeyDown = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return;
      if (isHostDialogOpen()) return;
      e.preventDefault();
      handlerRef.current?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active]);
}
