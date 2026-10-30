import { useEffect } from 'react';

// Layers above the overlay pane that own Esc before it
const TOP_LAYERS = '[role="menu"], .status-flyout, .modal-overlay, [role="dialog"], [aria-modal="true"]';
// Clicks here never count as "outside" the overlay pane (the rail and command bar toggle it themselves)
const INSIDE_PANE = '.shell-pane, .shell-rail, .shell-commandbar, .modal-overlay, [role="dialog"], [aria-modal="true"]';

const GESTURE_EVENTS = ['mousedown', 'mouseup', 'click'];

/** Swallow the rest of the current gesture (mousedown, mouseup, click) so the canvas never sees it. */
function consumeGesture() {
  const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
  let timer = null;
  const disarm = () => {
    GESTURE_EVENTS.forEach((type) => document.removeEventListener(type, onEvent, true));
    document.removeEventListener('pointerdown', disarm, true);
    clearTimeout(timer);
  };
  function onEvent(e) {
    stop(e);
    if (e.type === 'click') disarm();
  }
  GESTURE_EVENTS.forEach((type) => document.addEventListener(type, onEvent, true));
  document.addEventListener('pointerdown', disarm, true); // a new gesture starts: nothing stays armed
  timer = setTimeout(disarm, 1000);
}

/**
 * Esc and an outside click close the side pane while it overlays the canvas. Esc closes the top layer only.
 * Like a Windows flyout, a click on the canvas that dismisses the pane is consumed (pointerdown and the
 * mouse events that follow), so it does not also select, deselect, pan or start a marquee. Clicks on other
 * regions (menu bar, results, inspector, status bar) close the pane and still do their own action.
 */
function useOverlayPaneDismiss(active, onClose) {
  useEffect(() => {
    if (!active) return undefined;
    const onKeyDown = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const focused = document.activeElement;
      if (focused && ['INPUT', 'TEXTAREA', 'SELECT'].includes(focused.tagName)) return;
      if (document.querySelector(TOP_LAYERS)) return;
      e.stopPropagation();
      onClose();
      document.querySelector('.shell-rail .rail-button')?.focus();
    };
    const onPointerDown = (e) => {
      if (!(e.target instanceof Element) || e.target.closest(INSIDE_PANE)) return;
      onClose();
      if (e.target.closest('.shell-canvas')) {
        e.preventDefault();
        e.stopPropagation();
        consumeGesture();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [active, onClose]);
}

/**
 * App shell grid: header, activity rail, side pane, canvas, results, inspector, status bar.
 * Geometry lives in index.css (.app-shell); this component only places the regions.
 * `paneOverlay` / `inspectorOverlay` set the data attributes that switch the pane and inspector from docked to
 * over the canvas (see useShellMode).
 */
export default function AppShell({
  header, rail, paneTitle, pane, paneOpen, paneOverlay = false, inspectorOverlay = false, onClosePane,
  canvas, results, inspector, status,
}) {
  useOverlayPaneDismiss(paneOverlay && paneOpen, onClosePane);
  return (
    <div
      className="app-shell"
      data-pane={paneOpen ? 'open' : 'closed'}
      data-pane-mode={paneOverlay ? 'overlay' : 'docked'}
      data-inspector-mode={inspectorOverlay ? 'overlay' : 'docked'}
    >
      <header className="shell-header">{header}</header>
      {rail}
      <aside className="shell-pane" aria-label="Side pane">
        <h2 className="shell-pane-header">{paneTitle}</h2>
        {pane}
      </aside>
      <main className="shell-canvas">{canvas}</main>
      <div className="shell-results-area">{results}</div>
      {inspector}
      <footer className="shell-statusbar">{status}</footer>
    </div>
  );
}
