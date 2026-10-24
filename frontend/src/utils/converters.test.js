import { describe, it, expect } from 'vitest';
import { inToM, mToIn, psiToPa, gpmToLmin, fToK, cToK, paToBar, m3sToLmin, kwToBtuh, btuhToKw } from './converters';

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

describe('missing values and heat duty', () => {
  it('shows a dash instead of 0 for missing values', () => {
    expect(paToBar(undefined)).toBe('—');
    expect(paToBar(null)).toBe('—');
    expect(m3sToLmin(NaN)).toBe('—');
    expect(paToBar(200000)).toBe('2.00');
  });

  it('converts heat duty between kW and BTU/h', () => {
    expect(Number(kwToBtuh(1, 0))).toBe(3412);
    expect(btuhToKw(kwToBtuh(300, 6))).toBeCloseTo(300, 4);
  });
});
