import { describe, it, expect } from 'vitest';
import { inToM, mToIn, psiToPa, gpmToLmin, fToK, cToK } from './converters';

describe('unit converters', () => {
  it('round-trips DN50 STD inner diameter (52.48 mm = 2.067 in)', () => {
    expect(Number(mToIn(0.05248))).toBeCloseTo(2.066, 3);
    expect(inToM(2.067)).toBeCloseTo(0.0525, 4);
  });

  it('uses exact reference factors', () => {
    expect(psiToPa(1)).toBeCloseTo(6894.757, 3);
    expect(gpmToLmin(1)).toBeCloseTo(3.785411784, 9);
    expect(fToK(32)).toBeCloseTo(273.15, 9);
    expect(cToK(25.5)).toBeCloseTo(298.65, 9);
  });
});
