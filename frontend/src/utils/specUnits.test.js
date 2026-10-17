import { describe, it, expect } from 'vitest';
import { specUnits } from './specUnits';

describe('specUnits', () => {
  it('metric passes values through and parses typed text', () => {
    const u = specUnits(false);
    expect([u.length, u.pressure, u.temperature]).toEqual(['mm', 'bar', '°C']);
    expect(u.lengthOut(60.3)).toBe(60.3);
    expect(u.temperatureIn('-29')).toBe(-29);
    expect(u.temperatureIn('-')).toBeNull();
    expect(u.temperatureIn('')).toBeNull();
  });

  it('imperial converts to in / psi / °F and back to mm / bar / °C', () => {
    const u = specUnits(true);
    expect([u.length, u.pressure, u.temperature]).toEqual(['in', 'psi', '°F']);
    expect(u.lengthOut(60.3)).toBe(2.374);
    expect(u.lengthIn('2.375')).toBeCloseTo(60.325, 6);
    expect(u.pressureOut(19.6)).toBe(284.3);
    expect(u.pressureIn('284.3')).toBeCloseTo(19.6, 2);
    expect(u.temperatureOut(-29)).toBe(-20.2);
    expect(u.temperatureIn('-20.2')).toBeCloseTo(-29, 6);
    expect(u.lengthOut(null)).toBe('');
  });
});
