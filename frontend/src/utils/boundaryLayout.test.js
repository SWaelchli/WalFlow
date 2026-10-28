import { describe, it, expect } from 'vitest';
import { boundaryLayout, boundaryFooterOffset } from './boundaryLayout';

describe('boundaryFooterOffset', () => {
  it.each([
    ['1 port, no sensing', 'circle', 1, 0, {}, (o) => expect(o).toBe(0)],
    ['3 circle ports, no sensing stay inside the box', 'circle', 3, 0, {}, (o) => expect(o).toBe(0)],
    ['bottom port with a sensing pin pushes the footer down', 'circle', 4, 0, { 'port-1': true }, (o) => expect(o).toBeGreaterThan(0)],
    ['sensing on a right-hand port only does not', 'circle', 4, 0, { 'port-0': true }, (o) => expect(o).toBe(0)],
    ['rotating 90 degrees moves the right port to the bottom', 'circle', 4, 90, { 'port-0': true }, (o) => expect(o).toBeGreaterThan(0)],
    ['tank bottom port handle alone fits in the box', 'tank', 5, 0, {}, (o) => expect(o).toBe(0)],
    ['tank bottom port with a sensing pin sticks out', 'tank', 5, 0, { 'port-4': true }, (o) => expect(o).toBeGreaterThan(0)],
  ])('%s', (_name, kind, n, rotation, sensing, check) => {
    check(boundaryFooterOffset(boundaryLayout(kind, n), rotation, sensing));
  });

  it('sensing pins never reduce the offset', () => {
    const layout = boundaryLayout('circle', 6);
    const all = Object.fromEntries(layout.ports.map(p => [p.id, true]));
    expect(boundaryFooterOffset(layout, 0, all)).toBeGreaterThanOrEqual(boundaryFooterOffset(layout, 0, {}));
  });
});
