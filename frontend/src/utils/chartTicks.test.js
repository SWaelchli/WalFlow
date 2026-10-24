import { describe, it, expect } from 'vitest';
import { niceStep, niceTicks, formatTick } from './chartTicks';

describe('chart ticks', () => {
  it('uses round steps', () => {
    expect(niceStep(100, 5)).toBe(20);
    expect(niceStep(13.35, 5)).toBe(5);
    expect(niceStep(12, 5)).toBe(2.5);
    expect(niceStep(0.9, 5)).toBe(0.2);
  });
  it('covers the maximum with ticks starting at zero', () => {
    const t = niceTicks(133.5, 5);
    expect(t[0]).toBe(0);
    expect(t[t.length - 1]).toBeGreaterThanOrEqual(133.5);
    expect(t.every(v => Number.isFinite(v))).toBe(true);
  });
  it('formats without float noise', () => {
    expect(formatTick(13.349999999999)).toBe('13.3');
    expect(formatTick(40)).toBe('40');
    expect(formatTick(0.30000000000000004)).toBe('0.3');
  });
  it('handles an empty range', () => {
    expect(niceTicks(0)).toEqual([0]);
  });
});
