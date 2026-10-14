import { describe, it, expect } from 'vitest';
import { parseSolverSetting } from './solverSettings';

describe('F2-17: solver setting entries', () => {
  it('accepts values in range', () => {
    expect(parseSolverSetting('damping_factor', '0.25')).toEqual({ ok: true, value: 0.25 });
    expect(parseSolverSetting('tolerance', '1e-6')).toEqual({ ok: true, value: 1e-6 });
    expect(parseSolverSetting('control_iterations', '100')).toEqual({ ok: true, value: 100 });
  });

  it('rejects empty, non-numeric, out-of-range and non-integer entries', () => {
    expect(parseSolverSetting('damping_factor', '').ok).toBe(false);
    expect(parseSolverSetting('damping_factor', '0').ok).toBe(false);
    expect(parseSolverSetting('damping_factor', '5').ok).toBe(false);
    expect(parseSolverSetting('tolerance', '-1').ok).toBe(false);
    expect(parseSolverSetting('tolerance', 'abc').ok).toBe(false);
    expect(parseSolverSetting('inner_iterations', '10.5').ok).toBe(false);
    expect(parseSolverSetting('unknown', '1').ok).toBe(false);
  });
});
