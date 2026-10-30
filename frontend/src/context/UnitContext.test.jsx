import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import { UnitProvider, useUnits } from './UnitContext';
import { UNIT_SYSTEMS } from '../utils/converters';

afterEach(() => { cleanup(); localStorage.clear(); });

const stored = (prefs, key, typed) => {
  Object.entries(prefs).forEach(([k, v]) => localStorage.setItem(k, v));
  const { result } = renderHook(() => useUnits(), {
    wrapper: ({ children }) => <UnitProvider initialUnitSystem={UNIT_SYSTEMS.METRIC}>{children}</UnitProvider>,
  });
  return result.current.fromInputValue(key, typed);
};

describe('values typed in gauge or m3/h are stored without float noise', () => {
  it('stores 8.2 bar g as 9.21325 bar a, not 9.213249999999999', () => {
    expect(stored({ walflow_pressure_basis: 'gauge' }, 'max_discharge_pressure_bara', '8.2')).toBe(9.21325);
  });

  it('stores 0.1 m3/h as 1.66666666667 L/min', () => {
    const v = stored({ walflow_flow_unit: 'm3h' }, 'flow_rated_lmin', '0.1');
    expect(v).toBe(1.66666666667);
    expect(String(v).length).toBeLessThanOrEqual(14);
  });
});
