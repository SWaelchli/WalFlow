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

  it('keeps the panel between the minimum and 80 % of the window', () => {
    expect(clampPanelHeight(50, 800)).toBe(160);
    expect(clampPanelHeight(900, 800)).toBe(640);
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
