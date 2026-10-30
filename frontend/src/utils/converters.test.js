import { describe, it, expect } from 'vitest';
import { inToM, mToIn, psiToPa, gpmToLmin, fToK, cToK, paToBar, m3sToLmin, kwToBtuh, btuhToKw,
  pressureBasisLabel, flowUnitLabel, absPaToDisplayPressure, displayPressureToAbsPa, formatAbsPressureFromPa,
  formatDiffPressureFromPa, lminToDisplayFlow, displayFlowToLmin, formatFlowFromLmin } from './converters';

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

const M = 'metric';
const I = 'imperial';

describe('pressure basis (absolute / gauge) and flow unit', () => {
  it.each([
    ['metric absolute', 600000, M, 'absolute', 101325, 6],
    ['metric gauge', 601325, M, 'gauge', 101325, 5],
    ['metric gauge, site at altitude', 601325, M, 'gauge', 90000, 5.11325],
    ['imperial absolute', 601325, I, 'absolute', 101325, 601325 / 6894.757293],
    ['imperial gauge', 601325, I, 'gauge', 101325, 500000 / 6894.757293],
    ['gauge below atmosphere is negative', 51325, M, 'gauge', 101325, -0.5],
  ])('shows absolute pressure in the basis: %s', (_n, pa, unitSystem, basis, atmPa, expected) => {
    const opts = { unitSystem, basis, atmPa };
    expect(absPaToDisplayPressure(pa, opts)).toBeCloseTo(expected, 6);
    expect(displayPressureToAbsPa(absPaToDisplayPressure(pa, opts), opts)).toBeCloseTo(pa, 3);
  });

  it.each([null, undefined])('shows a missing absolute pressure (%s) as null and a dash', (v) => {
    expect(absPaToDisplayPressure(v, { basis: 'gauge' })).toBeNull();
    expect(formatAbsPressureFromPa(v, M, 'gauge')).toBe('—');
  });

  it('never offsets a pressure difference, while the absolute readout does', () => {
    expect(formatDiffPressureFromPa(500000, M)).toBe('5.00');
    expect(formatAbsPressureFromPa(500000, M, 'gauge', 101325)).toBe('3.99');
    expect(formatAbsPressureFromPa(500000, M, 'absolute', 101325)).toBe('5.00');
  });

  it.each([
    [M, 'absolute', 'bar a'], [M, 'gauge', 'bar g'], [I, 'absolute', 'psia'], [I, 'gauge', 'psig'],
  ])('labels the pressure basis %s %s as %s', (unitSystem, basis, label) => {
    expect(pressureBasisLabel(unitSystem, basis)).toBe(label);
  });

  it.each([
    [M, 'lmin', 'L/min'], [M, 'm3h', 'm³/h'], [I, 'lmin', 'gpm'], [I, 'm3h', 'gpm'],
  ])('labels the flow unit %s %s as %s', (unitSystem, flowUnit, label) => {
    expect(flowUnitLabel(unitSystem, flowUnit)).toBe(label);
  });

  it.each([
    ['1000 L/min is 60 m3/h', 1000, M, 'm3h', 60],
    ['L/min stays', 1000, M, 'lmin', 1000],
    ['imperial ignores the flow unit', 3.785411784, I, 'm3h', 1],
  ])('converts flow: %s', (_n, lmin, unitSystem, flowUnit, expected) => {
    expect(lminToDisplayFlow(lmin, unitSystem, flowUnit)).toBeCloseTo(expected, 6);
    expect(displayFlowToLmin(expected, unitSystem, flowUnit)).toBeCloseTo(lmin, 6);
  });

  it('formats a flow in m3/h with the units and imperial ignoring it', () => {
    expect(formatFlowFromLmin(1000, M, undefined, 'm3h')).toBe('60.0');
    expect(formatFlowFromLmin(10, M, 2, 'm3h')).toBe('0.60');
    expect(formatFlowFromLmin(10, I, 1, 'm3h')).toBe('2.6');
  });
});
