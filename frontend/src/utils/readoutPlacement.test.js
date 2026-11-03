import { describe, it, expect } from 'vitest';
import { readoutSide, sideReadoutStyle, READOUT_GAP } from './readoutPlacement';

describe('readoutSide', () => {
  it.each([
    ['default arguments', undefined, undefined, 'below'],
    ['0 degrees', 0, [], 'below'],
    ['180 degrees', 180, [], 'below'],
    ['0 degrees ignores facing sides', 0, ['right', 'left'], 'below'],
    ['180 degrees ignores facing sides', 180, ['top'], 'below'],
    ['90 degrees, nothing faces a pipe', 90, [], 'right'],
    ['270 degrees, nothing faces a pipe', 270, [], 'right'],
    ['90 degrees, only top and bottom ports', 90, ['top', 'bottom'], 'right'],
    ['90 degrees, right is taken', 90, ['right'], 'left'],
    ['270 degrees, right and top are taken', 270, ['right', 'top'], 'left'],
    ['90 degrees, left is taken', 90, ['left'], 'right'],
    ['90 degrees, both sides are taken', 90, ['left', 'right'], 'below'],
    ['-90 degrees equals 270', -90, ['right'], 'left'],
    ['450 degrees equals 90', 450, [], 'right'],
    ['-270 degrees equals 90', -270, ['right', 'left'], 'below'],
    ['89.6 degrees rounds to 90', 89.6, [], 'right'],
    ['45 degrees is not a quarter turn', 45, [], 'below'],
  ])('%s', (_name, rotation, sides, expected) => {
    expect(readoutSide(rotation, sides)).toBe(expected);
  });
});

describe('sideReadoutStyle', () => {
  it('anchors the right readout past the symbol half-height plus the gap', () => {
    const s = sideReadoutStyle('right', 40);
    expect(s.left).toBe(`calc(50% + ${20 + READOUT_GAP}px)`);
    expect(s).not.toHaveProperty('right');
  });

  it('anchors the left readout from the opposite edge', () => {
    const s = sideReadoutStyle('left', 60);
    expect(s.right).toBe(`calc(50% + ${30 + READOUT_GAP}px)`);
    expect(s).not.toHaveProperty('left');
  });

  it.each(['right', 'left'])('centres the %s readout vertically', (side) => {
    const s = sideReadoutStyle(side, 40);
    expect(s).toMatchObject({ position: 'absolute', top: '50%', transform: 'translateY(-50%)' });
  });
});
