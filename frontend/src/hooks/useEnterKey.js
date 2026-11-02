import { useEffect, useRef } from 'react';
import { isHostDialogOpen } from './useEscapeKey';

/**
 * Enter runs `onEnter` (the dialog's primary action) while `active` is true. For a dialog that is not a
 * `<form>`; a form dialog submits natively. Enter stays with a focused button, link, select or textarea
 * (it activates that control or makes a new line), and with a confirm dialog opened on top. The key is claimed
 * with `preventDefault()` so no page shortcut also acts on it. `onEnter` must do the same validation as a click.
 */
export default function useEnterKey(onEnter, active = true) {
  const handlerRef = useRef(onEnter);
  useEffect(() => { handlerRef.current = onEnter; });

  useEffect(() => {
    if (!active) return undefined;
    const onKeyDown = (e) => {
      if (e.key !== 'Enter' || e.defaultPrevented || e.repeat || e.isComposing) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (e.target instanceof Element && e.target.closest('button, a[href], select, textarea, [role="button"]')) return;
      if (isHostDialogOpen()) return;
      e.preventDefault();
      handlerRef.current?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active]);
}
