import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import CanvasContextMenu from './CanvasContextMenu';

const items = (h) => [
  { id: 'rotate', label: 'Rotate', shortcut: 'R', onSelect: h.rotate },
  { id: 'dup', label: 'Duplicate', shortcut: 'Ctrl+D', disabled: true, onSelect: h.dup },
  { separator: true },
  { id: 'del', label: 'Delete', danger: true, onSelect: h.del },
];

afterEach(cleanup);

describe('context menu', () => {
  it('shows the actions with their shortcuts and runs the chosen one, then closes', () => {
    const h = { rotate: vi.fn(), dup: vi.fn(), del: vi.fn() };
    const onClose = vi.fn();
    render(<CanvasContextMenu x={10} y={10} items={items(h)} onClose={onClose} />);
    expect(screen.getByRole('menu')).toBeTruthy();
    expect(screen.getByText('Ctrl+D')).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: /Rotate/ }));
    expect(h.rotate).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
  });

  it('does not run a disabled action', () => {
    const h = { rotate: vi.fn(), dup: vi.fn(), del: vi.fn() };
    render(<CanvasContextMenu x={10} y={10} items={items(h)} onClose={() => {}} />);
    const dup = screen.getByRole('menuitem', { name: /Duplicate/ });
    expect(dup.disabled).toBe(true);
    fireEvent.click(dup);
    expect(h.dup).not.toHaveBeenCalled();
  });

  it('closes with Escape and on a click elsewhere', () => {
    const onClose = vi.fn();
    render(<CanvasContextMenu x={10} y={10} items={items({})} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
