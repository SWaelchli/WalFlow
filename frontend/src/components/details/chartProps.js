// Chart text and frame props from tokens, shared by the Results charts (MASTER.md "Results display")
export const CHART_TICK = { fontSize: 'var(--fs-xs)', fill: 'var(--color-text-secondary)' };
export const CHART_MARGIN = { top: 10, right: 20, left: 4, bottom: 10 };
/** Y axis width: room for tick labels such as -1334 plus the rotated axis title. */
export const CHART_Y_WIDTH = 60;
export const CHART_GRID = { strokeDasharray: '3 3', vertical: false, stroke: 'var(--color-border)' };

/** Axis title; `y` rotates it along the vertical axis. */
export const chartAxisLabel = (value, y = false) => (y
  ? { value, angle: -90, position: 'insideLeft', offset: 0, fontSize: 'var(--fs-xs)', fill: 'var(--color-text-secondary)', style: { textAnchor: 'middle' } }
  : { value, position: 'insideBottomRight', offset: -2, fontSize: 'var(--fs-xs)', fill: 'var(--color-text-secondary)' });
