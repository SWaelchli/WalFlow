// Geometry of the junction symbol. 3 ports form a T (port-0 left and port-1 right are the straight run, port-2 the
// branch at the bottom), 4 a cross (port-3 at the top), 5 to 8 sit evenly around a central hub, clockwise from the left.

export const MIN_JUNCTION_PORTS = 3;
export const MAX_JUNCTION_PORTS = 8;

/** Number of ports of a junction node's data for drawing, clamped to 3..8 (3 when missing). Validation rejects what the solver rejects. */
export const junctionPortCount = (data) => {
  const n = Math.trunc(Number(data?.num_ports));
  return Number.isFinite(n) ? Math.min(MAX_JUNCTION_PORTS, Math.max(MIN_JUNCTION_PORTS, n)) : MIN_JUNCTION_PORTS;
};

/** Handle ids `port-0` .. `port-(n-1)`. */
export const junctionPortIds = (n) => Array.from({ length: n }, (_, k) => `port-${k}`);

const FIXED = {
  3: [[-1, 0], [1, 0], [0, 1]],
  4: [[-1, 0], [1, 0], [0, 1], [0, -1]],
};

const SIDE_ANGLE = { right: 0, bottom: 90, left: 180, top: 270 };
const wrap180 = (a) => ((((a + 180) % 360) + 360) % 360) - 180;
const norm360 = (a) => ((a % 360) + 360) % 360;

/**
 * Sensing needle direction (degrees, screen angle, 0 = right, 90 = down) of one port. The needle leaves the port
 * outward, turned from the radial direction by half the gap to the nearest port (at most 45 deg), away from the
 * direction the pipe leaves (the handle side). Axis-aligned ports turn up (top and bottom ports turn right).
 */
function pinAngles(ports) {
  const radial = ports.map((p) => norm360((Math.atan2(p.uy, p.ux) * 180) / Math.PI));
  return ports.map((p, k) => {
    const gap = Math.min(...radial.map((a, j) => (j === k ? 360 : Math.abs(wrap180(a - radial[k])))));
    const half = Math.min(45, gap / 2);
    const delta = wrap180(radial[k] - SIDE_ANGLE[p.side]);
    if (Math.abs(delta) > 1e-6) return norm360(radial[k] + Math.sign(delta) * half);
    const cand = [radial[k] + half, radial[k] - half].map((a) => [Math.cos((a * Math.PI) / 180), Math.sin((a * Math.PI) / 180), a]);
    cand.sort((a, b) => (Math.abs(a[1] - b[1]) > 1e-9 ? a[1] - b[1] : b[0] - a[0]));
    return norm360(cand[0][2]);
  });
}

/**
 * Symbol size and port positions in symbol pixels.
 * Each port also has its radial unit vector (ux, uy) and the direction of its sensing needle (pinAngle).
 * @returns {{size: number, ports: {id: string, x: number, y: number, ux: number, uy: number, pinAngle: number, side: 'left'|'right'|'top'|'bottom'}[]}}
 */
export function junctionLayout(n) {
  const size = n <= 4 ? 40 : 56;
  const c = size / 2;
  const unit = FIXED[n] || Array.from({ length: n }, (_, k) => {
    const a = Math.PI - (k * 2 * Math.PI) / n; // clockwise on screen, starting at the left
    return [Math.cos(a), -Math.sin(a)];
  });
  const ports = unit.map(([ux, uy], k) => {
    const side = Math.abs(ux) >= Math.abs(uy) + 1e-9 ? (ux < 0 ? 'left' : 'right') : (uy < 0 ? 'top' : 'bottom');
    return { id: `port-${k}`, x: c + ux * c, y: c + uy * c, ux, uy, side, pinAngle: 0 };
  });
  const angles = pinAngles(ports);
  ports.forEach((p, k) => { p.pinAngle = angles[k]; });
  return { size, ports };
}

// Sensing needle: starts PIN_TIP px outside the port, the signal handle (head) sits PIN_LENGTH px further out
export const PIN_TIP = 3;
export const PIN_LENGTH = 18;

const LABEL_W = 90; // widest label expected, used only to keep the label clear of pins and pipes
const LABEL_H = 26;
const LABEL_GAP = 6;
const PIPE_STUB = 40;
const DEG = Math.PI / 180;

const rotate = ([x, y], deg) => {
  const r = deg * DEG;
  return [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
};

/** Circles (x, y, r) relative to the symbol centre, in the rotated frame, that a label has to stay clear of. */
export function junctionObstacles(n, rotation = 0, pinIds) {
  const { size, ports } = junctionLayout(n);
  const c = size / 2;
  const out = [{ x: 0, y: 0, r: 7 }];
  const line = (x0, y0, x1, y1, r) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 3));
    for (let i = 0; i <= steps; i++) out.push({ x: x0 + ((x1 - x0) * i) / steps, y: y0 + ((y1 - y0) * i) / steps, r });
  };
  ports.forEach((p) => {
    const [px, py] = rotate([p.x - c, p.y - c], rotation);
    line(0, 0, px, py, 3);
    out.push({ x: px, y: py, r: 5 });
    const a = norm360(SIDE_ANGLE[p.side] + rotation) * DEG;
    line(px, py, px + Math.cos(a) * PIPE_STUB, py + Math.sin(a) * PIPE_STUB, 4);
    if (pinIds && !pinIds.includes(p.id)) return;
    const pa = (p.pinAngle + rotation) * DEG;
    const [dx, dy] = [Math.cos(pa), Math.sin(pa)];
    line(px + dx * PIN_TIP, py + dy * PIN_TIP, px + dx * (PIN_TIP + PIN_LENGTH), py + dy * (PIN_TIP + PIN_LENGTH), 2);
    out.push({ x: px + dx * (PIN_TIP + PIN_LENGTH), y: py + dy * (PIN_TIP + PIN_LENGTH), r: 5.5 });
  });
  return out;
}

const hitsBox = (circles, x0, y0, x1, y1) => circles.reduce((cnt, o) => {
  const dx = Math.max(x0 - o.x, 0, o.x - x1);
  const dy = Math.max(y0 - o.y, 0, o.y - y1);
  return cnt + (dx * dx + dy * dy < (o.r + 2) ** 2 ? 1 : 0);
}, 0);

/**
 * Where the junction label goes, as an anchor relative to the symbol centre (rotated frame) plus the CSS translate
 * fractions that place the text box on it. Only ports listed in `pinIds` (all when omitted) count as having a sensing needle. The text stays upright; the spot is clear of every pipe exit and sensing needle.
 * 3 ports: on the side opposite the branch. 4 to 8 ports: in the bottom-right gap outside the port circle, else another gap.
 * @returns {{x: number, y: number, tx: number, ty: number, align: 'left'|'center'|'right', box: number[]}}
 */
export function junctionLabelPlacement(n, rotation = 0, pinIds) {
  const { size } = junctionLayout(n);
  const c = size / 2;
  const rot = norm360(rotation);
  const circles = junctionObstacles(n, rot, pinIds);
  const diag = c * Math.SQRT1_2 + 4;
  const make = (kind, d) => {
    const e = c + LABEL_GAP + d;
    const g = diag + d;
    switch (kind) {
      case 'up': return { x: 0, y: -e, tx: -0.5, ty: -1, align: 'center' };
      case 'down': return { x: 0, y: e, tx: -0.5, ty: 0, align: 'center' };
      case 'right': return { x: e, y: 0, tx: 0, ty: -0.5, align: 'left' };
      case 'left': return { x: -e, y: 0, tx: -1, ty: -0.5, align: 'right' };
      case 'br': return { x: g, y: g, tx: 0, ty: 0, align: 'left' };
      case 'bl': return { x: -g, y: g, tx: -1, ty: 0, align: 'right' };
      case 'tr': return { x: g, y: -g, tx: 0, ty: -1, align: 'left' };
      default: return { x: -g, y: -g, tx: -1, ty: -1, align: 'right' };
    }
  };
  const opposite = ['up', 'right', 'down', 'left'][Math.round(rot / 90) % 4]; // the branch is at the bottom
  const order = n === 3
    ? [opposite, 'br', 'bl', 'tr', 'tl', 'down', 'up', 'right', 'left']
    : ['br', 'bl', 'tr', 'tl', 'down', 'up', 'right', 'left'];
  let best = null;
  order.forEach((kind) => {
    [0, 6, 12, 20, 30].forEach((d) => {
      const a = make(kind, d);
      const x0 = a.x + a.tx * LABEL_W;
      const y0 = a.y + a.ty * LABEL_H;
      const box = [x0, y0, x0 + LABEL_W, y0 + LABEL_H];
      const hits = hitsBox(circles, ...box);
      if (!best || hits < best.hits) best = { ...a, box, hits };
    });
  });
  return best;
}
