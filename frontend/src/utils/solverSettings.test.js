import { describe, it, expect } from 'vitest';
import { parseSolverSetting } from './solverSettings';

describe('solver setting entries', () => {
  it('accepts values in range', () => {
    expect(parseSolverSetting('tolerance', '1e-6')).toEqual({ ok: true, value: 1e-6 });
    expect(parseSolverSetting('control_iterations', '100')).toEqual({ ok: true, value: 100 });
  });

  it('rejects empty, non-numeric, out-of-range and non-integer entries', () => {
    expect(parseSolverSetting('control_iterations', '').ok).toBe(false);
    expect(parseSolverSetting('control_iterations', '0').ok).toBe(false);
    expect(parseSolverSetting('control_iterations', '5000').ok).toBe(false);
    expect(parseSolverSetting('damping_factor', '0.25').ok).toBe(false);   // retired setting
    expect(parseSolverSetting('tolerance', '-1').ok).toBe(false);
    expect(parseSolverSetting('tolerance', 'abc').ok).toBe(false);
    expect(parseSolverSetting('inner_iterations', '10.5').ok).toBe(false);
    expect(parseSolverSetting('unknown', '1').ok).toBe(false);
  });
});
