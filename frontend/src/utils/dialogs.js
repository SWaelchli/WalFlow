// Non-blocking replacements for window.alert / confirm / prompt.
// A small module-level store, so event handlers, hooks and providers can all call it without a context.
// <DialogHost /> (mounted once in main.jsx) renders the toasts and modals.

let nextId = 1;
const listeners = new Set();
let state = { toasts: [], modal: null };
const queue = []; // modal requests waiting behind the one on screen

const emit = () => listeners.forEach((l) => l(state));
const setState = (patch) => { state = { ...state, ...patch }; emit(); };

export const subscribeDialogs = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const getDialogState = () => state;

const TOAST_MS = { info: 5000, success: 4000, warning: 8000, error: 9000 };
const MAX_TOASTS = 4;

export const dismissToast = (id) => setState({ toasts: state.toasts.filter((t) => t.id !== id) });

/** Short message that does not interrupt the user. type: info | success | warning | error.
 *  options.action = { label, onClick } adds a button; clicking it runs onClick and dismisses the toast.
 *  options.key replaces the message when deciding whether the same toast is already shown. */
export function notify(message, type = 'info', options = {}) {
  const text = String(message ?? '');
  if (!text) return null;
  const key = options?.key || text;
  const existing = state.toasts.find((t) => t.key === key && t.type === type);
  if (existing) return existing.id; // the same message twice in a row is shown once
  const id = nextId++;
  setState({ toasts: [...state.toasts, { id, message: text, type, key, action: options?.action || null }].slice(-MAX_TOASTS) });
  const ms = TOAST_MS[type] ?? TOAST_MS.info;
  setTimeout(() => dismissToast(id), ms);
  return id;
}

const showNext = () => {
  if (state.modal || queue.length === 0) return;
  setState({ modal: queue.shift() });
};

const openModal = (spec) => new Promise((resolve) => {
  queue.push({ ...spec, id: nextId++, resolve });
  showNext();
});

/** Called by the host when the user answers the modal on screen. */
export function resolveModal(value) {
  const current = state.modal;
  if (!current) return;
  setState({ modal: null });
  current.resolve(current.kind === 'confirm' ? Boolean(value) : value);
  showNext();
}

/**
 * Yes/no question. Resolves true on confirm, false on cancel, Esc or backdrop click.
 * @param {{title?: string, message: string, confirmLabel?: string, cancelLabel?: string, danger?: boolean}} opts
 */
export function confirmDialog(opts) {
  const o = typeof opts === 'string' ? { message: opts } : opts;
  return openModal({
    kind: 'confirm',
    title: o.title || 'Please confirm',
    message: o.message,
    confirmLabel: o.confirmLabel || 'Confirm',
    cancelLabel: o.cancelLabel || 'Cancel',
    danger: Boolean(o.danger),
  });
}

/** "You have unsaved changes" question shared by the editors. `action` completes "Discard them and ...". */
export const confirmDiscard = (action = 'continue') => confirmDialog({
  title: 'Discard unsaved changes?',
  message: `You have unsaved changes. Discard them and ${action}?`,
  confirmLabel: 'Discard',
  danger: true,
});

/**
 * Asks for a name. Resolves with the trimmed text, or null on cancel.
 * @param {{title?: string, label?: string, initial?: string, confirmLabel?: string, placeholder?: string}} opts
 */
export function askName(opts = {}) {
  return openModal({
    kind: 'name',
    title: opts.title || 'Name',
    label: opts.label || 'Name',
    initial: opts.initial || '',
    placeholder: opts.placeholder || '',
    confirmLabel: opts.confirmLabel || 'OK',
    cancelLabel: 'Cancel',
  });
}

/** Test helper: forget everything shown so far. */
export function resetDialogs() {
  queue.length = 0;
  state = { toasts: [], modal: null };
  emit();
}
