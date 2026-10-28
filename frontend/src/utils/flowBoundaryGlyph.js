// Four radial arrows centred on (30, 30) in a 60x60 frame, shared by the canvas node and the sidebar icon.
const R_IN = 3.5;
const R_OUT = 13;
const HEAD_LEN = 3.2;
const HEAD_HALF_WIDTH = 2.88;

const fmt = (n) => String(Math.round(n * 100) / 100 + 0);

/** Path of one arrow on the axis at angleDeg; the head is at the outer end for a supply, the inner end for a draw. */
function arrowPath(angleDeg, isDraw) {
  const a = (angleDeg * Math.PI) / 180;
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const pt = (r, w = 0) => `${fmt(30 + r * ux - w * uy)} ${fmt(30 + r * uy + w * ux)}`;
  const tipR = isDraw ? R_IN : R_OUT;
  const baseR = isDraw ? R_IN + HEAD_LEN : R_OUT - HEAD_LEN;
  const [from, to] = isDraw ? [R_OUT, R_IN] : [R_IN, R_OUT];
  return `M ${pt(from)} L ${pt(to)} M ${pt(baseR, HEAD_HALF_WIDTH)} L ${pt(tipR)} L ${pt(baseR, -HEAD_HALF_WIDTH)}`;
}

/** Single path string covering the four arrows (0, 90, 180, 270 degrees). */
export function flowBoundaryGlyphPath(isDraw = false) {
  return [0, 90, 180, 270].map((deg) => arrowPath(deg, isDraw)).join(' ');
}
