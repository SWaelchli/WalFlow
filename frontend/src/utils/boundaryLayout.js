import { pinAngles, PIN_TIP, PIN_LENGTH } from './junctionLayout';

// Geometry of the multi-port boundaries (tank, pressure boundary, flow boundary): 1 to 8 neutral ports, ids
// `port-0` .. `port-(n-1)`. Port 0 sits where the single outlet used to be (right side), so a 1-port boundary
// looks as before.

export const MIN_BOUNDARY_PORTS = 1;
export const MAX_BOUNDARY_PORTS = 8;

/** Types that have `num_ports` 1..8 (default 1). */
export const BOUNDARY_PORT_TYPES = new Set(['tank', 'pressure_boundary', 'flow_boundary']);

/** Number of ports of a boundary node's data for drawing, clamped to 1..8 (1 when missing). */
export const boundaryPortCount = (data) => {
  const n = Math.trunc(Number(data?.num_ports));
  return Number.isFinite(n) ? Math.min(MAX_BOUNDARY_PORTS, Math.max(MIN_BOUNDARY_PORTS, n)) : MIN_BOUNDARY_PORTS;
};

// Tank wall slots (x, y in the 60 x 100 symbol): right-hand outlet first, then the old inlet position on the left
const TANK_SLOTS = [
  [50, 80, 'right'], [10, 50, 'left'], [10, 80, 'left'], [50, 50, 'right'],
  [30, 95, 'bottom'], [30, 5, 'top'], [50, 25, 'right'], [10, 25, 'left'],
];

/**
 * Symbol size and port positions in symbol pixels.
 * 'circle' (pressure and flow boundary): ports evenly around the ring, clockwise from the right.
 * 'tank': fixed slots on the wall of the vessel.
 * @param {'tank'|'circle'} kind
 * @returns {{width: number, height: number, ports: {id: string, x: number, y: number, ux: number, uy: number, pinAngle: number, side: 'left'|'right'|'top'|'bottom'}[]}}
 */
export function boundaryLayout(kind, n) {
  const width = 60;
  const height = kind === 'tank' ? 100 : 60;
  const [cx, cy] = [width / 2, height / 2];
  const ports = Array.from({ length: n }, (_, k) => {
    if (kind === 'tank') {
      const [x, y, side] = TANK_SLOTS[k];
      const len = Math.hypot(x - cx, y - cy);
      return { id: `port-${k}`, x, y, ux: (x - cx) / len, uy: (y - cy) / len, side, pinAngle: 0 };
    }
    const a = (k * 2 * Math.PI) / n;
    const [ux, uy] = [Math.cos(a), Math.sin(a)];
    const side = Math.abs(ux) >= Math.abs(uy) + 1e-9 ? (ux < 0 ? 'left' : 'right') : (uy < 0 ? 'top' : 'bottom');
    return { id: `port-${k}`, x: cx + ux * 20, y: cy + uy * 20, ux, uy, side, pinAngle: 0 };
  });
  const angles = pinAngles(ports);
  ports.forEach((p, k) => { p.pinAngle = angles[k]; });
  return { width, height, ports };
}

const FOOTER_CLEARANCE = 3;
const HANDLE_R = 5;
const PIN_HEAD_R = 6;

/**
 * Extra px the footer text has to move down so no port handle or sensing pin (in the rotated frame, pins only on
 * ports in `sensing`) overlaps it. 0 when everything stays inside the symbol box.
 */
export function boundaryFooterOffset(layout, rotation = 0, sensing = {}) {
  const [cx, cy] = [layout.width / 2, layout.height / 2];
  const r = (rotation * Math.PI) / 180;
  const [cos, sin] = [Math.cos(r), Math.sin(r)];
  const down = (x, y) => cy + (x - cx) * sin + (y - cy) * cos;
  let maxY = layout.height;
  layout.ports.forEach((p) => {
    maxY = Math.max(maxY, down(p.x, p.y) + HANDLE_R);
    if (!sensing[p.id]) return;
    const a = (p.pinAngle * Math.PI) / 180;
    const d = PIN_TIP + PIN_LENGTH;
    maxY = Math.max(maxY, down(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d) + PIN_HEAD_R);
  });
  return Math.ceil(Math.max(0, maxY - layout.height + FOOTER_CLEARANCE - 5));
}
