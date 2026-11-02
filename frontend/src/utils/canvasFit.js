import { getViewportForBounds } from 'reactflow';

// Framing of the whole drawing. One bounds helper serves the fit on opening and the Fit view command, and the bounds
// include the readouts and everything else drawn outside the node boxes.

export const MIN_ZOOM = 0.2;
export const FIT_MAX_ZOOM = 1.2;
export const FIT_PADDING = 0.2;

/** Smallest rectangle {left, top, right, bottom} holding all rectangles; null for none. Empty rectangles are ignored. */
export function unionRects(rects) {
  let out = null;
  rects.forEach((r) => {
    if (!r || !(r.right - r.left > 0 || r.bottom - r.top > 0)) return;
    out = out
      ? { left: Math.min(out.left, r.left), top: Math.min(out.top, r.top), right: Math.max(out.right, r.right), bottom: Math.max(out.bottom, r.bottom) }
      : { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  });
  return out;
}

/** True when two viewports are the same within a pixel (the user has not moved the view since). */
export const sameViewport = (a, b) => !!a && !!b
  && Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1 && Math.abs(a.zoom - b.zoom) < 0.001;

/** Bounds {x, y, width, height} of the drawing in flow coordinates, measured from the rendered nodes; null when none are drawn. */
export function measureDiagramBounds(viewportEl, zoom) {
  const rects = [];
  viewportEl.querySelectorAll('.react-flow__node').forEach((el) => {
    rects.push(el.getBoundingClientRect());
    el.querySelectorAll('*').forEach((child) => rects.push(child.getBoundingClientRect()));
  });
  const box = unionRects(rects);
  if (!box) return null;
  const origin = viewportEl.getBoundingClientRect();
  return {
    x: (box.left - origin.left) / zoom,
    y: (box.top - origin.top) / zoom,
    width: (box.right - box.left) / zoom,
    height: (box.bottom - box.top) / zoom,
  };
}

/**
 * Frames the whole drawing, readouts included. Returns the viewport that was set, or null when nothing is drawn yet.
 * `duration` is the animation time in ms (0 jumps).
 */
export function fitDiagram(instance, { duration = 0 } = {}) {
  const viewportEl = document.querySelector('.react-flow__viewport');
  const paneEl = viewportEl?.closest('.react-flow');
  if (!instance || !viewportEl || !paneEl || !paneEl.clientWidth || !paneEl.clientHeight) return null;
  const bounds = measureDiagramBounds(viewportEl, instance.getZoom());
  if (!bounds) return null;
  const viewport = getViewportForBounds(bounds, paneEl.clientWidth, paneEl.clientHeight, MIN_ZOOM, FIT_MAX_ZOOM, FIT_PADDING);
  instance.setViewport(viewport, { duration });
  return viewport;
}

const SETTLE_FRAMES = 3;
const MAX_FRAMES = 300;
const sameBounds = (a, b) => !!a && !!b
  && ['x', 'y', 'width', 'height'].every((k) => Math.abs(a[k] - b[k]) < 0.5);

/**
 * Frames the drawing once exactly the nodes `nodeIds` are drawn and their bounds (readouts included) have stopped
 * changing for a few frames, so nothing is fitted while nodes are still being measured or the old drawing is still
 * on the canvas. `shouldFit` is asked just before fitting; `onFit(viewport)` runs after. Returns a cancel function.
 */
export function fitWhenDrawn(instance, nodeIds, { onFit, shouldFit = () => true, duration = 0 } = {}) {
  const ids = new Set(nodeIds);
  let frame = 0;
  let frames = 0;
  let stable = 0;
  let last = null;
  const step = () => {
    frames += 1;
    const viewportEl = document.querySelector('.react-flow__viewport');
    const drawn = viewportEl ? [...viewportEl.querySelectorAll('.react-flow__node')] : [];
    const ready = drawn.length === ids.size && drawn.every((el) => ids.has(el.dataset.id));
    const bounds = ready ? measureDiagramBounds(viewportEl, instance.getZoom()) : null;
    stable = bounds && sameBounds(bounds, last) ? stable + 1 : 0;
    last = bounds;
    if (stable >= SETTLE_FRAMES) {
      if (!shouldFit()) return;
      const viewport = fitDiagram(instance, { duration });
      if (viewport && onFit) onFit(viewport);
      return;
    }
    if (frames < MAX_FRAMES) frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
  return () => cancelAnimationFrame(frame);
}
