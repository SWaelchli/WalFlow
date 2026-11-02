import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { getCommand, runCommand } from '../commands';
import { makePageState } from '../test/commandCtx';

const makeCtx = (over = {}) => ({
  isReadOnly: false,
  isSimulating: false,
  selection: { nodes: [{ id: 'n1' }], edges: [] },
  hasClipboard: () => true,
  actions: {
    copy: vi.fn(), paste: vi.fn(), duplicate: vi.fn(), deleteSelected: vi.fn(), selectAll: vi.fn(),
    rotate: vi.fn(), deselectAll: vi.fn(), undo: vi.fn(), redo: vi.fn(), save: vi.fn(), run: vi.fn(),
  },
  ...over,
});

function Host({ ctx }) {
  useKeyboardShortcuts(ctx);
  return <div id="results">12.5 bar</div>;
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  window.getSelection()?.removeAllRanges();
});

describe('keyboard shortcuts', () => {
  it('run each bound command', () => {
    const ctx = makeCtx();
    render(<Host ctx={ctx} />);
    const a = ctx.actions;
    const table = [
      [{ key: 's', ctrlKey: true }, a.save],
      [{ key: 'z', ctrlKey: true }, a.undo],
      [{ key: 'y', ctrlKey: true }, a.redo],
      [{ key: 'z', ctrlKey: true, shiftKey: true }, a.redo],
      [{ key: 'c', ctrlKey: true }, a.copy],
      [{ key: 'v', ctrlKey: true }, a.paste],
      [{ key: 'd', ctrlKey: true }, a.duplicate],
      [{ key: 'a', ctrlKey: true }, a.selectAll],
      [{ key: 'r' }, a.rotate],
      [{ key: 'Delete' }, a.deleteSelected],
      [{ key: 'Backspace' }, a.deleteSelected],
      [{ key: 'Escape' }, a.deselectAll],
      [{ key: 'Enter', ctrlKey: true }, a.run],
    ];
    table.forEach(([event, fn]) => {
      fn.mockClear();
      fireEvent.keyDown(window, event);
      expect(fn, JSON.stringify(event)).toHaveBeenCalledTimes(1);
    });
  });

  it('do nothing while a modal is open', () => {
    const ctx = makeCtx();
    render(<Host ctx={ctx} />);
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    document.body.appendChild(overlay);
    fireEvent.keyDown(window, { key: 'Delete' });
    fireEvent.keyDown(window, { key: 'r' });
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });
    const a = ctx.actions;
    expect(a.deleteSelected).not.toHaveBeenCalled();
    expect(a.rotate).not.toHaveBeenCalled();
    expect(a.paste).not.toHaveBeenCalled();
    expect(a.undo).not.toHaveBeenCalled();
    expect(a.run).not.toHaveBeenCalled();
  });

  it('do nothing while typing in an input, and Enter leaves the input', () => {
    const ctx = makeCtx();
    render(<><Host ctx={ctx} /><input aria-label="value" /></>);
    const input = document.querySelector('input');
    input.focus();
    fireEvent.keyDown(window, { key: 'Delete' });
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(ctx.actions.deleteSelected).not.toHaveBeenCalled();
    expect(ctx.actions.undo).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(document.activeElement).not.toBe(input);
  });

  it('leave Ctrl+C to the browser while text is selected', () => {
    const ctx = makeCtx();
    const { container } = render(<Host ctx={ctx} />);
    const range = document.createRange();
    range.selectNodeContents(container.querySelector('#results'));
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    const event = new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, cancelable: true, bubbles: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(ctx.actions.copy).not.toHaveBeenCalled();
  });

  it('do not run a disabled command, except on a read-only drawing where the handler shows the notice', () => {
    const blocked = makeCtx({ selection: { nodes: [], edges: [] }, isSimulating: true });
    const { unmount } = render(<Host ctx={blocked} />);
    fireEvent.keyDown(window, { key: 'Delete' });
    fireEvent.keyDown(window, { key: 'c', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });
    expect(blocked.actions.deleteSelected).not.toHaveBeenCalled();
    expect(blocked.actions.copy).not.toHaveBeenCalled();
    expect(blocked.actions.run).not.toHaveBeenCalled();
    unmount();

    const readOnly = makeCtx({ isReadOnly: true });
    render(<Host ctx={readOnly} />);
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(readOnly.actions.undo).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+S saves also while typing in a field, committing the field first; other keys stay ignored', async () => {
    const ctx = makeCtx();
    render(<><Host ctx={ctx} /><input aria-label="value" /></>);
    const input = document.querySelector('input');
    input.focus();
    const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, cancelable: true, bubbles: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).not.toBe(input);
    await waitFor(() => expect(ctx.actions.save).toHaveBeenCalledTimes(1));
  });
});

describe('keyboard shortcuts behind an open menu on the drawing', () => {
  it('Delete and Ctrl+Z do nothing, and Ctrl+S still never opens the browser Save dialog', () => {
    const ctx = makeCtx();
    render(<Host ctx={ctx} />);
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    document.body.appendChild(menu);
    press({ key: 'Delete' });
    press({ key: 'z', ctrlKey: true });
    expect(press({ key: 's', ctrlKey: true }).defaultPrevented).toBe(true);
    Object.values(ctx.actions).forEach((fn) => expect(fn).not.toHaveBeenCalled());
  });
});

describe('view.inspector command', () => {
  it('is disabled with a reason and does not run when nothing is selected', () => {
    const ctx = makeCtx({ hasInspectorTarget: false, actions: { toggleInspector: vi.fn() } });
    expect(getCommand('view.inspector').isEnabled(ctx)).toBe('Select a component or pipe');
    expect(runCommand('view.inspector', ctx)).toBe(false);
    expect(ctx.actions.toggleInspector).not.toHaveBeenCalled();
  });

  it('is checked only while the inspector shows, and toggles when run', () => {
    const open = makeCtx({ hasInspectorTarget: true, inspectorCollapsed: false, actions: { toggleInspector: vi.fn() } });
    const collapsed = makeCtx({ hasInspectorTarget: true, inspectorCollapsed: true });
    expect(getCommand('view.inspector').checked(open)).toBe(true);
    expect(getCommand('view.inspector').checked(collapsed)).toBe(false);
    expect(runCommand('view.inspector', open)).toBe(true);
    expect(open.actions.toggleInspector).toHaveBeenCalledTimes(1);
  });
});

const pageCtx = (stateOver = {}) => makeCtx({ page: 'catalogue', pageState: makePageState(stateOver) });
const press = (init) => {
  const event = new KeyboardEvent('keydown', { ...init, cancelable: true, bubbles: true });
  window.dispatchEvent(event);
  return event;
};
const noPageActionRan = (ctx) => Object.values(ctx.pageState.actions).forEach((fn) => expect(fn).not.toHaveBeenCalled());
const noDrawingActionRan = (ctx) => Object.values(ctx.actions).forEach((fn) => expect(fn).not.toHaveBeenCalled());

describe('keyboard shortcuts on the Catalogue page', () => {
  it('never run a drawing command, and leave Ctrl+C/V/A/Z and Backspace to the browser', () => {
    const ctx = pageCtx();
    render(<Host ctx={ctx} />);
    [
      { key: 'a', ctrlKey: true }, { key: 'c', ctrlKey: true }, { key: 'v', ctrlKey: true }, { key: 'z', ctrlKey: true },
      { key: 'Backspace' }, { key: 'r' }, { key: 'Enter', ctrlKey: true },
    ].forEach((init) => expect(press(init).defaultPrevented, JSON.stringify(init)).toBe(false));
    noDrawingActionRan(ctx);
    noPageActionRan(ctx);
  });

  it.each([
    ['n', { key: 'n' }, 'newEntry'],
    ['e', { key: 'e' }, 'edit'],
    ['Ctrl+D', { key: 'd', ctrlKey: true }, 'clone'],
    ['Delete', { key: 'Delete' }, 'remove'],
    ['ArrowDown', { key: 'ArrowDown' }, 'step'],
    ['/', { key: '/' }, 'focusSearch'],
    ['Alt+2', { key: '2', code: 'Digit2', altKey: true }, 'selectTab'],
  ])('%s runs its page action once and not a drawing action', (_n, init, action) => {
    const ctx = pageCtx();
    render(<Host ctx={ctx} />);
    press(init);
    expect(ctx.pageState.actions[action]).toHaveBeenCalledTimes(1);
    noDrawingActionRan(ctx);
  });

  it('Escape discards only while editing', () => {
    const idle = pageCtx();
    const { unmount } = render(<Host ctx={idle} />);
    expect(press({ key: 'Escape' }).defaultPrevented).toBe(false);
    expect(idle.pageState.actions.discard).not.toHaveBeenCalled();
    unmount();
    const editing = pageCtx({ isEditing: true });
    render(<Host ctx={editing} />);
    press({ key: 'Escape' });
    expect(editing.pageState.actions.discard).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['nothing to save', {}],
    ['editing', { isEditing: true }],
  ])('Ctrl+S never reaches the browser: %s', (_n, stateOver) => {
    render(<Host ctx={pageCtx(stateOver)} />);
    expect(press({ key: 's', ctrlKey: true }).defaultPrevented).toBe(true);
  });

  it('Ctrl+S saves while editing and runs nothing when there is nothing to save', () => {
    const idle = pageCtx();
    const { unmount } = render(<Host ctx={idle} />);
    press({ key: 's', ctrlKey: true });
    expect(idle.pageState.actions.save).not.toHaveBeenCalled();
    unmount();
    const editing = pageCtx({ isEditing: true });
    render(<Host ctx={editing} />);
    press({ key: 's', ctrlKey: true });
    expect(editing.pageState.actions.save).toHaveBeenCalledTimes(1);
    noDrawingActionRan(editing);
  });

  it('inside a text field only Save fires: it commits the field first, and every other key is ignored', async () => {
    const ctx = pageCtx({ isEditing: true });
    render(<><Host ctx={ctx} /><input aria-label="name" /></>);
    const input = document.querySelector('input');
    input.focus();
    ['n', 'e', 'Delete', 'Escape', 'ArrowDown', '/'].forEach((key) => expect(press({ key }).defaultPrevented, key).toBe(false));
    press({ key: 'd', ctrlKey: true });
    expect(ctx.pageState.actions.save).not.toHaveBeenCalled();
    const event = press({ key: 's', ctrlKey: true });
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).not.toBe(input);
    await waitFor(() => expect(ctx.pageState.actions.save).toHaveBeenCalledTimes(1));
    ['newEntry', 'edit', 'remove', 'discard', 'step', 'focusSearch', 'clone'].forEach((name) => {
      expect(ctx.pageState.actions[name], name).not.toHaveBeenCalled();
    });
    noDrawingActionRan(ctx);
  });

  it('Ctrl+S in a text field with nothing to save keeps the field focused and runs nothing', async () => {
    const ctx = pageCtx({ isEditing: false });
    render(<><Host ctx={ctx} /><input aria-label="search" /></>);
    const input = document.querySelector('input');
    input.focus();
    expect(press({ key: 's', ctrlKey: true }).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(ctx.pageState.actions.save).not.toHaveBeenCalled();
  });

  it.each([
    ['a menu', () => { const m = document.createElement('div'); m.setAttribute('role', 'menu'); return m; }],
    ['a modal', () => { const m = document.createElement('div'); m.className = 'modal-overlay'; return m; }],
  ])('keys do nothing while %s is open, but Ctrl+S still never opens the browser Save dialog', (_n, make) => {
    const ctx = pageCtx({ isEditing: true });
    render(<Host ctx={ctx} />);
    document.body.appendChild(make());
    [{ key: 'n' }, { key: 'Escape' }, { key: 'ArrowDown' }, { key: 'd', ctrlKey: true }].forEach((init) => press(init));
    expect(press({ key: 's', ctrlKey: true }).defaultPrevented).toBe(true);
    Object.values(ctx.pageState.actions).forEach((fn) => expect(fn).not.toHaveBeenCalled());
  });

  it('a disabled key stays with the browser, except a Ctrl combination, which never reaches it', () => {
    const ctx = pageCtx({ hasSelection: false, selectedIndex: 2 });
    render(<Host ctx={ctx} />);
    expect(press({ key: 'e' }).defaultPrevented).toBe(false);
    expect(press({ key: 'ArrowDown' }).defaultPrevented).toBe(false);
    expect(press({ key: 'd', ctrlKey: true }).defaultPrevented).toBe(true);
    expect(ctx.pageState.actions.edit).not.toHaveBeenCalled();
    expect(ctx.pageState.actions.clone).not.toHaveBeenCalled();
  });

  it('a read-only user pressing N, E, Delete, Ctrl+D or Esc gets nothing, and Ctrl+S still never opens the browser Save dialog', () => {
    const ctx = pageCtx({ canManage: false, isEditing: true });
    render(<Host ctx={ctx} />);
    [{ key: 'n' }, { key: 'e' }, { key: 'Delete' }, { key: 'd', ctrlKey: true }, { key: 'Escape' }].forEach((init) => press(init));
    expect(press({ key: 's', ctrlKey: true }).defaultPrevented).toBe(true);
    Object.values(ctx.pageState.actions).forEach((fn) => expect(fn).not.toHaveBeenCalled());
    // A key that stays visible for everyone still works
    press({ key: '/' });
    expect(ctx.pageState.actions.focusSearch).toHaveBeenCalledTimes(1);
  });

  it('a key already handled by someone else (a menu, a number field) is not run again', () => {
    const ctx = pageCtx();
    render(<Host ctx={ctx} />);
    const first = (e) => e.preventDefault();
    window.addEventListener('keydown', first, true);
    press({ key: 'ArrowDown' });
    window.removeEventListener('keydown', first, true);
    expect(ctx.pageState.actions.step).not.toHaveBeenCalled();
  });
});

describe('keyboard shortcuts on the drawing (unchanged)', () => {
  it('still prevents the default of a drawing shortcut that is disabled for another reason', () => {
    render(<Host ctx={makeCtx({ selection: { nodes: [], edges: [] } })} />);
    expect(press({ key: 'Delete' }).defaultPrevented).toBe(true);
  });
});
