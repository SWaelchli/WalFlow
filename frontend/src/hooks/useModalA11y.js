const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
let modalCounter = 0;

/**
 * Makes a `.modal-container` element an accessible dialog: role, aria-modal and aria-labelledby
 * (taken from its `.modal-title`), initial focus, a Tab focus trap, and focus return to the opener.
 * Usage: `<div className="modal-container" ref={modalA11yRef}>` (the modal must unmount when closed).
 */
export function attachModalA11y(panel) {
  const opener = document.activeElement;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  const title = panel.querySelector('.modal-title');
  if (title) {
    if (!title.id) title.id = `modal-title-${++modalCounter}`;
    panel.setAttribute('aria-labelledby', title.id);
  }
  if (!panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '-1');

  const onKeyDown = (e) => {
    if (e.key !== 'Tab') return;
    const items = [...panel.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (items.length === 0) { e.preventDefault(); panel.focus(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panel)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
  };
  panel.addEventListener('keydown', onKeyDown);

  // Focus the first field, otherwise the first control that is not the close button, otherwise the panel
  if (!panel.contains(document.activeElement)) {
    const target = panel.querySelector('input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])')
      || panel.querySelector('.modal-footer button:not([disabled])')
      || panel.querySelector(FOCUSABLE)
      || panel;
    target.focus({ preventScroll: true });
  }

  return () => {
    panel.removeEventListener('keydown', onKeyDown);
    if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus({ preventScroll: true });
  };
}

/** Ref callback for `.modal-container` (React 19 runs the returned cleanup on unmount). */
export const modalA11yRef = (node) => (node ? attachModalA11y(node) : undefined);
