import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

const handlers = () => ({
  copySelected: vi.fn(), pasteCopied: vi.fn(), duplicateSelected: vi.fn(), deleteSelected: vi.fn(),
  selectAllNodes: vi.fn(), rotateSelectedNode: vi.fn(), deselectAll: vi.fn(), undo: vi.fn(), redo: vi.fn(), onSaveShortcut: vi.fn(),
});

function Host({ h }) {
  useKeyboardShortcuts(h);
  return <div id="results">12.5 bar</div>;
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  window.getSelection()?.removeAllRanges();
});

describe('F2-18 keyboard shortcuts', () => {
  it('act on the canvas when nothing else has the keyboard', () => {
    const h = handlers();
    render(<Host h={h} />);
    fireEvent.keyDown(window, { key: 'r' });
    fireEvent.keyDown(window, { key: 'c', ctrlKey: true });
    expect(h.rotateSelectedNode).toHaveBeenCalledTimes(1);
    expect(h.copySelected).toHaveBeenCalledTimes(1);
  });

  it('do nothing while a modal is open', () => {
    const h = handlers();
    render(<Host h={h} />);
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    document.body.appendChild(overlay);
    fireEvent.keyDown(window, { key: 'Delete' });
    fireEvent.keyDown(window, { key: 'r' });
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(h.deleteSelected).not.toHaveBeenCalled();
    expect(h.rotateSelectedNode).not.toHaveBeenCalled();
    expect(h.pasteCopied).not.toHaveBeenCalled();
    expect(h.undo).not.toHaveBeenCalled();
  });

  it('leave Ctrl+C to the browser while text is selected', () => {
    const h = handlers();
    const { container } = render(<Host h={h} />);
    const range = document.createRange();
    range.selectNodeContents(container.querySelector('#results'));
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    const event = new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, cancelable: true, bubbles: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(h.copySelected).not.toHaveBeenCalled();
  });
});
