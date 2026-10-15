// Ties each <label> that has no `for` and no nested control to the control that follows it.
// The app lays out fields as "<label/> then <input|select|textarea/>" (the control directly after
// the label, or inside the next sibling), so the pairing is derived from the DOM instead of
// threading an id through ~85 label sites. Existing `for`/`id` pairs and aria-labels are respected.
const CONTROL = 'input:not([type="hidden"]), select, textarea';
let counter = 0;

function findControl(label) {
  let el = label.nextElementSibling;
  // Only look at the immediate sibling run: stop at the next label so two fields never share one control
  while (el && el.tagName !== 'LABEL') {
    if (el.matches(CONTROL)) return el;
    const inner = el.querySelector(CONTROL);
    if (inner) return inner;
    if (el.querySelector('label')) return null;
    el = el.nextElementSibling;
  }
  return null;
}

export function associateLabels(root = document) {
  const labels = root.querySelectorAll('label:not([for])');
  labels.forEach((label) => {
    if (label.querySelector(CONTROL)) return;
    const control = findControl(label);
    if (!control || control.hasAttribute('aria-label') || control.hasAttribute('aria-labelledby')) return;
    // A control that is already the target of another label keeps that one
    if (control.id && root.querySelector(`label[for="${CSS.escape(control.id)}"]`)) return;
    if (!control.id) control.id = `auto-field-${++counter}`;
    label.setAttribute('for', control.id);
  });
}

/** Watches a root element and keeps labels associated as panels open and fields change. */
export function observeLabelAssociation(root = document.body) {
  let queued = false;
  const run = () => { queued = false; associateLabels(root); };
  const schedule = () => {
    if (queued) return;
    queued = true;
    (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn) => setTimeout(fn, 16))(run);
  };
  const observer = new MutationObserver(schedule);
  observer.observe(root, { childList: true, subtree: true });
  schedule();
  return () => observer.disconnect();
}
