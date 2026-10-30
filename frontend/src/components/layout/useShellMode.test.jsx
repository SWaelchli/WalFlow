import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useShellMode from './useShellMode';

const originalWidth = window.innerWidth;
afterEach(() => { window.innerWidth = originalWidth; });

const modesAt = (width, inspectorShown) => {
  window.innerWidth = width;
  return renderHook(() => useShellMode(inspectorShown)).result.current;
};

describe('shell mode by window width', () => {
  it.each([
    ['below 1008 both overlay', 1007, false, true, true],
    ['at 1008 both dock without an inspector', 1008, false, false, false],
    ['at 1008 the side pane still overlays beside a docked inspector', 1008, true, true, false],
    ['at 1135 the side pane overlays beside a docked inspector', 1135, true, true, false],
    ['at 1136 everything docks', 1136, true, false, false],
  ])('%s', (_n, width, inspectorShown, paneOverlay, inspectorOverlay) => {
    const modes = modesAt(width, inspectorShown);
    expect(modes.paneOverlay).toBe(paneOverlay);
    expect(modes.inspectorOverlay).toBe(inspectorOverlay);
  });

  it('follows the window when it is resized', () => {
    window.innerWidth = 1200;
    const { result } = renderHook(() => useShellMode(true));
    expect(result.current.paneOverlay).toBe(false);
    act(() => { window.innerWidth = 1000; window.dispatchEvent(new Event('resize')); });
    expect(result.current.paneOverlay).toBe(true);
    expect(result.current.inspectorOverlay).toBe(true);
  });
});
