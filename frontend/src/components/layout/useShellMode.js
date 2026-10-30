import { useEffect, useState } from 'react';

// Shell geometry mirrored from MASTER.md "App Shell & Layout" (--shell-rail-w, --shell-pane-w, --shell-inspector-w, --shell-canvas-min-w)
const RAIL_W = 48;
const PANE_W = 288;
const INSPECTOR_W = 320;
const CANVAS_MIN_W = 480;

/** Below this window width (medium breakpoint) the side pane and the inspector open over the canvas. */
export const MEDIUM_BELOW_WIDTH = 1008;
/** Rail, side pane, inspector and the canvas minimum side by side. */
export const DOCK_ALL_WIDTH = RAIL_W + PANE_W + INSPECTOR_W + CANVAS_MIN_W;

/**
 * Which panes dock and which overlay the canvas for a window width.
 * Medium: both overlay. Large: the side pane overlays only while a docked inspector would squeeze the canvas
 * below its minimum. Wide: both dock.
 */
export function shellModes(width, inspectorShown) {
  const medium = width < MEDIUM_BELOW_WIDTH;
  return {
    medium,
    paneOverlay: medium || (inspectorShown && width < DOCK_ALL_WIDTH),
    inspectorOverlay: medium,
  };
}

const currentWidth = () => (typeof window !== 'undefined' ? window.innerWidth : DOCK_ALL_WIDTH);

/** Live shell modes; recomputed when the window is resized. */
export default function useShellMode(inspectorShown) {
  const [width, setWidth] = useState(currentWidth);
  useEffect(() => {
    const onResize = () => setWidth(currentWidth());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return shellModes(width, inspectorShown);
}
