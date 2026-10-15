// F3-14: round axis ticks (0, 20, 40 ... instead of raw floats such as 13.349999).

/** Round step (1, 2, 2.5, 5 x 10^n) that covers `max` in about `count` intervals. */
export const niceStep = (max, count = 5) => {
  if (!(max > 0) || !(count > 0)) return 1;
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const f = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return f * mag;
};

/** Ticks from 0 up to the first round value at or above `max`. */
export const niceTicks = (max, count = 5) => {
  const step = niceStep(max, count);
  const top = Math.ceil((max - 1e-9) / step) * step;
  const out = [];
  for (let v = 0; v <= top + step * 1e-9; v += step) out.push(Number(v.toPrecision(12)));
  return out;
};

/** Compact label for a tick: no trailing zeros, no float noise. */
export const formatTick = (v) => {
  if (!Number.isFinite(v)) return '';
  const a = Math.abs(v);
  if (a >= 100 || Number.isInteger(v)) return String(Math.round(v));
  return String(Number(v.toPrecision(3)));
};
