import { describe, it, expect } from 'vitest';
import {
  junctionLayout, junctionPortCount, junctionPortIds, junctionObstacles, junctionLabelPlacement,
  MIN_JUNCTION_PORTS, MAX_JUNCTION_PORTS, PIN_TIP, PIN_LENGTH,
} from './junctionLayout';

const SIDE_ANGLE = { right: 0, bottom: 90, left: 180, top: 270 };
const SIZES = [3, 4, 5, 6, 7, 8];
const ROTATIONS = [0, 90, 180, 270];
const rad = (d) => (d * Math.PI) / 180;
const angleDiff = (a, b) => Math.abs((((a - b + 180) % 360) + 360) % 360 - 180);
const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
const segmentsCross = ([a, b], [c, d]) => cross(a, b, c) * cross(a, b, d) <= 0 && cross(c, d, a) * cross(c, d, b) <= 0;
// spokes (centre to port) and sensing needles (port tip to head), symbol-centred, unrotated
const spokesAndPins = (n) => {
  const { size, ports } = junctionLayout(n);
  const c = size / 2;
  return ports.map((p) => {
    const [x, y] = [p.x - c, p.y - c];
    const [dx, dy] = [Math.cos(rad(p.pinAngle)), Math.sin(rad(p.pinAngle))];
    return { spoke: [[0, 0], [x, y]], pin: [[x + dx * PIN_TIP, y + dy * PIN_TIP], [x + dx * (PIN_TIP + PIN_LENGTH), y + dy * (PIN_TIP + PIN_LENGTH)]] };
  });
};

describe('junctionLayout', () => {
  it('limits the port count to 3..8 and defaults to 3', () => {
    expect([undefined, null, 'x', 2, 3, 4.6, 5.4, 8, 9].map((n) => junctionPortCount({ num_ports: n }))).toEqual([3, 3, 3, 3, 3, 4, 5, 8, 8]);
    expect(junctionPortCount(undefined)).toBe(MIN_JUNCTION_PORTS);
    expect(MAX_JUNCTION_PORTS).toBe(8);
  });

  it.each([3, 4, 5, 6, 7, 8])('places %i ports with ids port-0.. at distinct positions inside the symbol', (n) => {
    const { size, ports } = junctionLayout(n);
    expect(ports.map((p) => p.id)).toEqual(junctionPortIds(n));
    expect(new Set(ports.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`)).size).toBe(n);
    ports.forEach((p) => {
      expect(p.x).toBeGreaterThanOrEqual(-1e-9);
      expect(p.x).toBeLessThanOrEqual(size + 1e-9);
      expect(p.y).toBeGreaterThanOrEqual(-1e-9);
      expect(p.y).toBeLessThanOrEqual(size + 1e-9);
    });
  });

  it('draws 3 ports as a T and 4 as a cross', () => {
    expect(junctionLayout(3).ports.map((p) => p.side)).toEqual(['left', 'right', 'bottom']);
    expect(junctionLayout(4).ports.map((p) => p.side)).toEqual(['left', 'right', 'bottom', 'top']);
  });

  it('turns the T needles up-left, up-right and down-right', () => {
    expect(junctionLayout(3).ports.map((p) => Math.round(p.pinAngle))).toEqual([225, 315, 45]);
  });

  it.each(SIZES)('%i ports: no needle crosses a spoke or another needle and none points along its pipe exit', (n) => {
    const items = spokesAndPins(n);
    const { ports } = junctionLayout(n);
    items.forEach((a, i) => {
      items.forEach((b, j) => {
        expect(segmentsCross(a.pin, b.spoke), `pin ${i} crosses spoke ${j}`).toBe(false);
        if (i < j) expect(segmentsCross(a.pin, b.pin), `pin ${i} crosses pin ${j}`).toBe(false);
      });
      expect(angleDiff(ports[i].pinAngle, SIDE_ANGLE[ports[i].side]), `pin ${i} along its handle side`).toBeGreaterThan(1);
    });
  });

  describe.each(SIZES)('label of %i ports', (n) => {
    it.each(ROTATIONS)('clears every port, stub and needle at rotation %i', (rot) => {
      const [x0, y0, x1, y1] = junctionLabelPlacement(n, rot).box;
      junctionObstacles(n, rot).forEach((o) => {
        const d = Math.hypot(Math.max(x0 - o.x, 0, o.x - x1), Math.max(y0 - o.y, 0, o.y - y1));
        expect(d, `obstacle at ${o.x.toFixed(1)},${o.y.toFixed(1)}`).toBeGreaterThanOrEqual(o.r);
      });
    });
  });

  it.each([5, 6, 7, 8])('%i ports: without needles the label sits closer to the centre than with all of them', (n) => {
    const dist = (l) => Math.hypot(l.x, l.y);
    expect(dist(junctionLabelPlacement(n, 0, []))).toBeLessThan(dist(junctionLabelPlacement(n, 0)));
  });
});
