import { useState, useCallback, useEffect, useRef } from 'react';

const MIN_VISIBLE_MS = 400;
const SAFETY_TIMEOUT_MS = 5000;

/** Overlay shown while a drawing loads; hides once the loaded canvas has committed and painted. */
export function useCanvasLoading({ nodes, edges }) {
  // Canvas loading overlay state
  const [isCanvasLoading, setIsCanvasLoading] = useState(false);
  const [canvasLoadingLabel, setCanvasLoadingLabel] = useState('Opening drawing…');
  const pendingLoadRef = useRef(false);
  const loadStartedAtRef = useRef(0);
  const hideTimerRef = useRef(null);
  const paintFrameRef = useRef(null);
  const loadTimeoutRef = useRef(null);

  const showCanvasLoading = useCallback((label = 'Opening drawing…') => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    if (paintFrameRef.current) {
      cancelAnimationFrame(paintFrameRef.current);
    }
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
    }
    pendingLoadRef.current = true;
    loadStartedAtRef.current = Date.now();
    setCanvasLoadingLabel(label);
    setIsCanvasLoading(true);
    hideTimerRef.current = setTimeout(() => {
      pendingLoadRef.current = false;
      setIsCanvasLoading(false);
    }, SAFETY_TIMEOUT_MS);
  }, []);

  const hideCanvasLoading = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    if (paintFrameRef.current) {
      cancelAnimationFrame(paintFrameRef.current);
    }
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
    }
    pendingLoadRef.current = false;
    setIsCanvasLoading(false);
  }, []);

  useEffect(() => () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    if (paintFrameRef.current) {
      cancelAnimationFrame(paintFrameRef.current);
    }
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
    }
  }, []);

  // Hide the loader once the loaded canvas commits (completion-driven, not a fixed timer).
  // The requestAnimationFrame gate guarantees the loader is included in at least one painted
  // frame before the hide timer starts, so heavy synchronous loads still flash it.
  useEffect(() => {
    if (!pendingLoadRef.current) return;
    pendingLoadRef.current = false;
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    paintFrameRef.current = requestAnimationFrame(() => {
      const elapsed = Date.now() - loadStartedAtRef.current;
      const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);
      hideTimerRef.current = setTimeout(() => setIsCanvasLoading(false), remaining === 0 ? 50 : remaining);
    });
  }, [nodes, edges]);

  // Runs `fn` shortly after the overlay is up (so it is painted first); a newer load replaces a pending one
  const scheduleLoad = useCallback((fn, delayMs = 50) => {
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
    }
    loadTimeoutRef.current = setTimeout(fn, delayMs);
  }, []);

  return { isCanvasLoading, canvasLoadingLabel, showCanvasLoading, hideCanvasLoading, scheduleLoad };
}

export default useCanvasLoading;
