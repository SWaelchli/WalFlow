import { describe, it, expect } from 'vitest';
import { unionRects, sameViewport } from './canvasFit';

const rect = (left, top, right, bottom) => ({ left, top, right, bottom });

describe('unionRects', () => {
  it.each([
    ['no rectangles', [], null],
    ['only empty rectangles', [rect(5, 5, 5, 5), rect(0, 0, 0, 0)], null],
    ['null entries are skipped', [null, undefined], null],
    ['a single rectangle', [rect(1, 2, 3, 4)], rect(1, 2, 3, 4)],
    ['an empty rectangle does not stretch the box', [rect(10, 10, 20, 20), rect(0, 0, 0, 0)], rect(10, 10, 20, 20)],
    ['a zero-width but tall rectangle counts', [rect(5, 0, 5, 10)], rect(5, 0, 5, 10)],
    ['a zero-height but wide rectangle counts', [rect(0, 5, 10, 5)], rect(0, 5, 10, 5)],
    ['disjoint rectangles span the gap', [rect(0, 0, 10, 10), rect(50, 60, 70, 80)], rect(0, 0, 70, 80)],
    ['a contained rectangle changes nothing', [rect(0, 0, 100, 100), rect(10, 10, 20, 20)], rect(0, 0, 100, 100)],
    ['negative coordinates', [rect(-30, -20, -10, -5), rect(5, 5, 15, 15)], rect(-30, -20, 15, 15)],
  ])('%s', (_name, rects, expected) => {
    expect(unionRects(rects)).toEqual(expected);
  });

  it('does not depend on the order of the rectangles', () => {
    const a = rect(0, 0, 10, 10);
    const b = rect(-5, 20, 8, 40);
    const c = rect(30, -9, 31, 2);
    expect(unionRects([a, b, c])).toEqual(unionRects([c, a, b]));
  });
});

describe('sameViewport', () => {
  const base = { x: 100, y: 50, zoom: 1 };

  it.each([
    ['identical', base, { ...base }, true],
    ['sub-pixel pan', base, { x: 100.9, y: 49.5, zoom: 1 }, true],
    ['pan of a pixel in x', base, { x: 101, y: 50, zoom: 1 }, false],
    ['pan of a pixel in y', base, { x: 100, y: 49, zoom: 1 }, false],
    ['tiny zoom drift', base, { x: 100, y: 50, zoom: 1.0005 }, true],
    ['visible zoom change', base, { x: 100, y: 50, zoom: 1.01 }, false],
    ['first is null', null, base, false],
    ['second is null', base, null, false],
    ['both null', null, null, false],
    ['undefined', undefined, base, false],
  ])('%s', (_name, a, b, expected) => {
    expect(sameViewport(a, b)).toBe(expected);
  });
});
