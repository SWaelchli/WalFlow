import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCanvasLoading } from './useCanvasLoading';

const EMPTY_PROPS = { nodes: [], edges: [] };

describe('useCanvasLoading', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('immediately sets isCanvasLoading to true and sets label upon showCanvasLoading (synchronous activation, no debounce)', () => {
    const { result } = renderHook(() => useCanvasLoading(EMPTY_PROPS));

    expect(result.current.isCanvasLoading).toBe(false);

    act(() => {
      result.current.showCanvasLoading('Loading drawing…');
    });

    expect(result.current.isCanvasLoading).toBe(true);
    expect(result.current.canvasLoadingLabel).toBe('Loading drawing…');
  });

  it('holds isCanvasLoading true for MIN_VISIBLE_MS (350ms) before hiding when canvas commits early', () => {
    let props = { nodes: [], edges: [] };
    const { result, rerender } = renderHook((p) => useCanvasLoading(p), { initialProps: props });

    act(() => {
      result.current.showCanvasLoading();
    });
    expect(result.current.isCanvasLoading).toBe(true);

    // Canvas commits at 50ms (< 350ms)
    act(() => {
      vi.advanceTimersByTime(50);
    });
    props = { nodes: [{ id: 'tank_1' }], edges: [] };
    rerender(props);

    // At 349ms from start (299ms after commit), overlay must still be held visible
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(result.current.isCanvasLoading).toBe(true);

    // At 350ms from start (1ms later), overlay hides
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.isCanvasLoading).toBe(false);
  });

  it('dismisses immediately when canvas commits after MIN_VISIBLE_MS (350ms) has already elapsed', () => {
    let props = { nodes: [], edges: [] };
    const { result, rerender } = renderHook((p) => useCanvasLoading(p), { initialProps: props });

    act(() => {
      result.current.showCanvasLoading();
    });
    expect(result.current.isCanvasLoading).toBe(true);

    // Advance 400ms (> 350ms) before canvas commits
    act(() => {
      vi.advanceTimersByTime(400);
    });

    props = { nodes: [{ id: 'tank_1' }], edges: [] };
    rerender(props);

    // Dismiss timer delay is Math.max(0, 350 - 400) = 0ms
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(result.current.isCanvasLoading).toBe(false);
  });

  it('hideCanvasLoading immediately hides the overlay and cancels pending timers', () => {
    const { result } = renderHook(() => useCanvasLoading(EMPTY_PROPS));

    act(() => {
      result.current.showCanvasLoading();
    });
    expect(result.current.isCanvasLoading).toBe(true);

    act(() => {
      result.current.hideCanvasLoading();
    });
    expect(result.current.isCanvasLoading).toBe(false);

    // Advancing timers should not bring it back or trigger lingering timeouts
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.isCanvasLoading).toBe(false);
  });

  it('scheduleLoad(fn, 0) yields two animation frames (double rAF) before executing setTimeout(fn, 0)', () => {
    const { result } = renderHook(() => useCanvasLoading(EMPTY_PROPS));
    const fn = vi.fn();

    act(() => {
      result.current.scheduleLoad(fn, 0);
    });

    expect(fn).not.toHaveBeenCalled();

    // After 1st animation frame (~16-20ms), inner rAF is scheduled but fn not yet executed
    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(fn).not.toHaveBeenCalled();

    // After 2nd animation frame (~16-20ms) + setTimeout(0), fn executes
    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('scheduleLoad cancels a previously scheduled load when called again', () => {
    const { result } = renderHook(() => useCanvasLoading(EMPTY_PROPS));
    const fn1 = vi.fn();
    const fn2 = vi.fn();

    act(() => {
      result.current.scheduleLoad(fn1, 50);
      result.current.scheduleLoad(fn2, 50);
    });

    // Double rAF (~34-40ms) yields before the 50ms timer begins
    act(() => {
      vi.advanceTimersByTime(40);
    });
    expect(fn1).not.toHaveBeenCalled();
    expect(fn2).not.toHaveBeenCalled();

    // After remaining 50ms delay, fn2 executes while fn1 remains cancelled
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(fn1).not.toHaveBeenCalled();
    expect(fn2).toHaveBeenCalledTimes(1);
  });

  describe('scheduled load while the overlay waits for the canvas', () => {
    const NODE = [{ id: 'tank_1' }];

    it.each([
      ['the initial-solve flag goes true and back to false', (rerender) => {
        rerender({ nodes: [], edges: [], awaitingInitialSolve: false });
      }],
      ['the current canvas changes', (rerender) => {
        rerender({ nodes: NODE, edges: [], awaitingInitialSolve: false });
      }],
    ])('still runs when %s before it fires', (_name, change) => {
      const { result, rerender } = renderHook((p) => useCanvasLoading(p), { initialProps: { nodes: [], edges: [], awaitingInitialSolve: false } });
      const fn = vi.fn();

      act(() => { result.current.showCanvasLoading(); });
      rerender({ nodes: [], edges: [], awaitingInitialSolve: true });
      act(() => { result.current.scheduleLoad(fn, 0); });
      change(rerender);

      act(() => { vi.advanceTimersByTime(100); });
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('is dismissed when the canvas changes after the load ran', () => {
      const { result, rerender } = renderHook((p) => useCanvasLoading(p), { initialProps: { nodes: [], edges: [], awaitingInitialSolve: false } });
      const fn = vi.fn();

      act(() => { result.current.showCanvasLoading(); });
      act(() => { result.current.scheduleLoad(fn, 0); });
      act(() => { vi.advanceTimersByTime(100); });
      expect(fn).toHaveBeenCalledTimes(1);
      expect(result.current.isCanvasLoading).toBe(true);

      rerender({ nodes: NODE, edges: [], awaitingInitialSolve: false });
      act(() => { vi.advanceTimersByTime(400); });
      expect(result.current.isCanvasLoading).toBe(false);
    });

    it('isLoadScheduled is true from scheduling until the load starts, and false after a cancel', () => {
      const { result } = renderHook(() => useCanvasLoading(EMPTY_PROPS));
      expect(result.current.isLoadScheduled()).toBe(false);

      act(() => { result.current.scheduleLoad(vi.fn(), 0); });
      expect(result.current.isLoadScheduled()).toBe(true);
      act(() => { vi.advanceTimersByTime(20); });
      expect(result.current.isLoadScheduled()).toBe(true);   // between the two frames
      act(() => { vi.advanceTimersByTime(20); });
      expect(result.current.isLoadScheduled()).toBe(false);

      act(() => { result.current.scheduleLoad(vi.fn(), 0); });
      act(() => { result.current.hideCanvasLoading(); });
      expect(result.current.isLoadScheduled()).toBe(false);
    });
  });

  describe('awaitingInitialSolve coordination', () => {
    it('remains visible and updates canvasLoadingLabel to solving message on canvas commit when awaitingInitialSolve is true', () => {
      let props = { nodes: [], edges: [], awaitingInitialSolve: true };
      const { result, rerender } = renderHook((p) => useCanvasLoading(p), { initialProps: props });

      act(() => {
        result.current.showCanvasLoading('Opening drawing…');
      });

      expect(result.current.canvasLoadingLabel).toBe('Opening drawing…');
      expect(result.current.isCanvasLoading).toBe(true);

      // Canvas commits at 50ms while solve is still pending
      act(() => {
        vi.advanceTimersByTime(50);
      });
      props = { nodes: [{ id: 'tank_1' }], edges: [], awaitingInitialSolve: true };
      rerender(props);

      // rAF updates the label
      act(() => {
        vi.advanceTimersByTime(16);
      });
      expect(result.current.canvasLoadingLabel).toBe('Solving initial flow network…');
      // Remains visible while awaitingInitialSolve is true, even past 350ms
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(result.current.isCanvasLoading).toBe(true);
    });

    it('executes 350ms dismissal cycle once awaitingInitialSolve transitions to false (early solve)', () => {
      let props = { nodes: [], edges: [], awaitingInitialSolve: true };
      const { result, rerender } = renderHook((p) => useCanvasLoading(p), { initialProps: props });

      act(() => {
        result.current.showCanvasLoading();
      });

      // Canvas commits at 50ms
      act(() => {
        vi.advanceTimersByTime(50);
      });
      props = { nodes: [{ id: 'tank_1' }], edges: [], awaitingInitialSolve: true };
      rerender(props);

      // Initial solve completes early at 100ms total
      act(() => {
        vi.advanceTimersByTime(50);
      });
      props = { nodes: [{ id: 'tank_1' }], edges: [], awaitingInitialSolve: false };
      rerender(props);

      // Overlay must be retained for MIN_VISIBLE_MS = 350ms from start (249ms more = 349ms total)
      act(() => {
        vi.advanceTimersByTime(249);
      });
      expect(result.current.isCanvasLoading).toBe(true);

      // 1ms more reaches 350ms total -> dismissed
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(result.current.isCanvasLoading).toBe(false);
    });

    it('dismisses immediately once awaitingInitialSolve transitions to false if MIN_VISIBLE_MS has already elapsed', () => {
      let props = { nodes: [], edges: [], awaitingInitialSolve: true };
      const { result, rerender } = renderHook((p) => useCanvasLoading(p), { initialProps: props });

      act(() => {
        result.current.showCanvasLoading();
      });

      // Canvas commits at 100ms
      act(() => {
        vi.advanceTimersByTime(100);
      });
      props = { nodes: [{ id: 'tank_1' }], edges: [], awaitingInitialSolve: true };
      rerender(props);

      // Solve takes 1000ms total (> 350ms MIN_VISIBLE_MS)
      act(() => {
        vi.advanceTimersByTime(900);
      });
      expect(result.current.isCanvasLoading).toBe(true);

      // Solve completes
      props = { nodes: [{ id: 'tank_1' }], edges: [], awaitingInitialSolve: false };
      rerender(props);

      act(() => {
        vi.advanceTimersByTime(0);
      });
      expect(result.current.isCanvasLoading).toBe(false);
    });

    it('dismisses via the 5000ms safety timeout even if awaitingInitialSolve never resolves', () => {
      let props = { nodes: [], edges: [], awaitingInitialSolve: true };
      const { result, rerender } = renderHook((p) => useCanvasLoading(p), { initialProps: props });

      act(() => {
        result.current.showCanvasLoading();
      });

      // Canvas commits
      props = { nodes: [{ id: 'tank_1' }], edges: [], awaitingInitialSolve: true };
      rerender(props);

      expect(result.current.isCanvasLoading).toBe(true);

      // Advance to 4999ms from start
      act(() => {
        vi.advanceTimersByTime(4999);
      });
      expect(result.current.isCanvasLoading).toBe(true);

      // 5000ms safety timeout triggers dismiss
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(result.current.isCanvasLoading).toBe(false);
    });
  });
});
