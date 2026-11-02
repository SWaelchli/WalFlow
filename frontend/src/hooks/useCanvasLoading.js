import { useState, useCallback, useEffect, useRef } from 'react';

const MIN_VISIBLE_MS = 350;
const SAFETY_TIMEOUT_MS = 5000;

/** Overlay shown while a drawing loads; hides once the loaded canvas has committed and initial solve finishes. */
export function useCanvasLoading({ nodes, edges, awaitingInitialSolve = false }) {
  // Canvas loading overlay state
  const [isCanvasLoading, setIsCanvasLoading] = useState(false);
  const [canvasLoadingLabel, setCanvasLoadingLabel] = useState('Opening drawing…');
  const pendingLoadRef = useRef(false);
  const canvasCommittedRef = useRef(false);
  const loadStartedAtRef = useRef(0);
  const visibleStartedAtRef = useRef(0);
  const becameVisibleRef = useRef(false);
  const hideTimerRef = useRef(null);
  const scheduleFrameRef = useRef(null);
  const loadTimeoutRef = useRef(null);
  const safetyTimeoutRef = useRef(null);

  const showCanvasLoading = useCallback((label = 'Opening drawing…') => {
    if (pendingLoadRef.current) {
      setCanvasLoadingLabel(label);
      return;
    }
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    if (scheduleFrameRef.current) {
      cancelAnimationFrame(scheduleFrameRef.current);
      scheduleFrameRef.current = null;
    }
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
    if (safetyTimeoutRef.current) {
      clearTimeout(safetyTimeoutRef.current);
    }

    setIsCanvasLoading(true);
    becameVisibleRef.current = true;
    visibleStartedAtRef.current = Date.now();
    pendingLoadRef.current = true;
    canvasCommittedRef.current = false;
    loadStartedAtRef.current = Date.now();
    setCanvasLoadingLabel(label);

    safetyTimeoutRef.current = setTimeout(() => {
      pendingLoadRef.current = false;
      canvasCommittedRef.current = false;
      becameVisibleRef.current = false;
      setIsCanvasLoading(false);
    }, SAFETY_TIMEOUT_MS);
  }, []);

  const hideCanvasLoading = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    if (scheduleFrameRef.current) {
      cancelAnimationFrame(scheduleFrameRef.current);
      scheduleFrameRef.current = null;
    }
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
    if (safetyTimeoutRef.current) {
      clearTimeout(safetyTimeoutRef.current);
    }
    pendingLoadRef.current = false;
    canvasCommittedRef.current = false;
    becameVisibleRef.current = false;
    setIsCanvasLoading(false);
  }, []);

  useEffect(() => () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    if (scheduleFrameRef.current) {
      cancelAnimationFrame(scheduleFrameRef.current);
    }
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
    }
    if (safetyTimeoutRef.current) {
      clearTimeout(safetyTimeoutRef.current);
    }
  }, []);

  const dismiss = useCallback(() => {
    pendingLoadRef.current = false;
    canvasCommittedRef.current = false;
    if (scheduleFrameRef.current) {
      cancelAnimationFrame(scheduleFrameRef.current);
      scheduleFrameRef.current = null;
    }
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (safetyTimeoutRef.current) {
      clearTimeout(safetyTimeoutRef.current);
      safetyTimeoutRef.current = null;
    }
    if (!becameVisibleRef.current) {
      return;
    }
    const elapsed = Date.now() - visibleStartedAtRef.current;
    const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);
    hideTimerRef.current = setTimeout(() => {
      becameVisibleRef.current = false;
      setIsCanvasLoading(false);
    }, remaining);
  }, []);

  // When [nodes, edges] changes and a load was pending, mark canvas committed.
  // If awaitingInitialSolve is true at this point, update canvasLoadingLabel to 'Solving initial flow network…'.
  useEffect(() => {
    if (!pendingLoadRef.current) return;
    canvasCommittedRef.current = true;
    if (awaitingInitialSolve) {
      requestAnimationFrame(() => {
        setCanvasLoadingLabel('Solving initial flow network…');
      });
    }
  }, [nodes, edges, awaitingInitialSolve]);

  // Only dismiss the loading overlay once BOTH the canvas has committed and awaitingInitialSolve is false.
  useEffect(() => {
    if (!pendingLoadRef.current) return;
    if (canvasCommittedRef.current && !awaitingInitialSolve) {
      dismiss();
    }
  }, [nodes, edges, awaitingInitialSolve, dismiss]);

  // Runs `fn` asynchronously; a newer load replaces a pending one
  const scheduleLoad = useCallback((fn, delayMs = 0) => {
    if (scheduleFrameRef.current) {
      cancelAnimationFrame(scheduleFrameRef.current);
      scheduleFrameRef.current = null;
    }
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
    scheduleFrameRef.current = requestAnimationFrame(() => {
      scheduleFrameRef.current = requestAnimationFrame(() => {
        scheduleFrameRef.current = null;
        loadTimeoutRef.current = setTimeout(fn, delayMs);
      });
    });
  }, []);

  return { isCanvasLoading, canvasLoadingLabel, showCanvasLoading, hideCanvasLoading, scheduleLoad };
}

export default useCanvasLoading;
