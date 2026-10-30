import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import usePanelHeight, { defaultPanelHeight, clampPanelHeight } from './usePanelHeight';

beforeEach(() => { localStorage.clear(); });

describe('data panel size', () => {
  it('defaults to 40 % of the window between 300 and 480 px', () => {
    expect(defaultPanelHeight(600)).toBe(300);
    expect(defaultPanelHeight(900)).toBe(360);
    expect(defaultPanelHeight(2000)).toBe(480);
  });

  it('keeps the panel above the minimum and inside the grid row that leaves the canvas 320 px', () => {
    expect(clampPanelHeight(50, 800)).toBe(160);
    // 800 - 112 (menu bar, command bar, status bar) - 320 (canvas minimum) = 368, below 80 % of 800
    expect(clampPanelHeight(900, 800)).toBe(368);
    // tall window: 80 % of the window is the tighter limit
    expect(clampPanelHeight(5000, 2000)).toBe(1568);
  });

  it('shrinks with the window on resize', () => {
    const original = window.innerHeight;
    try {
      window.innerHeight = 1200;
      localStorage.setItem('test_panel', JSON.stringify({ height: 700, collapsed: false }));
      const { result } = renderHook(() => usePanelHeight('test_panel'));
      expect(result.current.height).toBe(700);
      act(() => { window.innerHeight = 800; window.dispatchEvent(new Event('resize')); });
      expect(result.current.height).toBe(368);
    } finally { window.innerHeight = original; }
  });

  it.each([
    ['starts collapsed below 1008 px with nothing stored', 1007, null, true],
    ['starts expanded from 1008 px', 1008, null, false],
    ['keeps a stored expanded choice in a narrow window', 800, { collapsed: false }, false],
  ])('%s', (_, width, stored, collapsed) => {
    const original = window.innerWidth;
    try {
      window.innerWidth = width;
      if (stored) localStorage.setItem('test_panel', JSON.stringify(stored));
      const { result } = renderHook(() => usePanelHeight('test_panel'));
      expect(result.current.collapsed).toBe(collapsed);
    } finally { window.innerWidth = original; }
  });

  it('collapses to the header and remembers it', () => {
    const { result, unmount } = renderHook(() => usePanelHeight('test_panel'));
    expect(result.current.collapsed).toBe(false);
    act(() => result.current.setCollapsed(true));
    expect(result.current.collapsed).toBe(true);
    expect(result.current.height).toBeLessThan(60);
    unmount();
    const again = renderHook(() => usePanelHeight('test_panel'));
    expect(again.result.current.collapsed).toBe(true);
  });

  it('resizes with the arrow keys and stores the height', () => {
    const { result } = renderHook(() => usePanelHeight('test_panel'));
    const before = result.current.height;
    act(() => result.current.onKeyDown({ key: 'ArrowUp', shiftKey: false, preventDefault() {} }));
    expect(result.current.height).toBe(before + 24);
    expect(JSON.parse(localStorage.getItem('test_panel')).height).toBe(before + 24);
  });
});
