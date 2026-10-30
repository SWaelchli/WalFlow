import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { getCommand, runCommand } from '../commands';

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
