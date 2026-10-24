import { useCallback, useEffect, useRef, useState } from 'react';

const MIN_HEIGHT = 160;
const COLLAPSED_HEIGHT = 44; // tab header only

/** Default height: 40 % of the window, between 300 and 480 px. */
export const defaultPanelHeight = (viewportHeight) => Math.min(480, Math.max(300, Math.round(viewportHeight * 0.4)));

export const clampPanelHeight = (value, viewportHeight) => Math.min(Math.round(viewportHeight * 0.8), Math.max(MIN_HEIGHT, Math.round(value)));

const read = (key) => {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null');
    return v && typeof v === 'object' ? v : {};
  } catch { return {}; }
};
const write = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage not accessible */ }
};

/** Height and collapsed state of a bottom panel, remembered per browser. Drag the handle or use the arrow keys. */
export default function usePanelHeight(storageKey) {
  const [state, setState] = useState(() => {
    const stored = read(storageKey);
    return { height: Number.isFinite(stored.height) ? stored.height : null, collapsed: stored.collapsed === true };
  });
  const dragRef = useRef(null);

  const viewport = () => (typeof window !== 'undefined' ? window.innerHeight : 800);
  const height = state.collapsed ? COLLAPSED_HEIGHT : clampPanelHeight(state.height ?? defaultPanelHeight(viewport()), viewport());

  const commit = useCallback((next) => {
    setState(next);
    write(storageKey, next);
  }, [storageKey]);

  const setCollapsed = useCallback((collapsed) => commit({ ...state, collapsed }), [commit, state]);

  const startDrag = useCallback((e) => {
    if (state.collapsed) return;
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startHeight: height };
    const onMove = (ev) => {
      const d = dragRef.current;
      if (!d) return;
      setState(prev => ({ ...prev, height: clampPanelHeight(d.startHeight + (d.startY - ev.clientY), viewport()) }));
    };
    const onUp = (ev) => {
      const d = dragRef.current;
      dragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (d) commit({ collapsed: false, height: clampPanelHeight(d.startHeight + (d.startY - ev.clientY), viewport()) });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [state.collapsed, height, commit]);

  const onKeyDown = useCallback((e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const step = e.shiftKey ? 80 : 24;
    commit({ collapsed: false, height: clampPanelHeight(height + (e.key === 'ArrowUp' ? step : -step), viewport()) });
  }, [height, commit]);

  // keep the panel inside the window when the window shrinks
  useEffect(() => {
    const onResize = () => setState(prev => ({ ...prev }));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return { height, collapsed: state.collapsed, setCollapsed, startDrag, onKeyDown };
}
