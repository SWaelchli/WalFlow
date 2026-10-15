import { describe, it, expect } from 'vitest';
import { pressureDrop, pressureRise, outletFlow, portPressures } from './nodeReadouts';
import { formatPressureFromPa, formatFlowFromM3s } from './converters';

const solved = { inlets: [{ pressure: 500000 }], outlets: [{ pressure: 300000, flow_rate: 0.001 }] };

describe('F3-10 readouts before a run', () => {
  it('are null, and format as a dash, without telemetry', () => {
    expect(pressureDrop(undefined)).toBeNull();
    expect(pressureRise({})).toBeNull();
    expect(outletFlow(null)).toBeNull();
    expect(portPressures({ inlets: [], outlets: [] })).toEqual({ pIn: null, pOut: null });
    expect(formatPressureFromPa(pressureDrop(undefined))).toBe('—');
    expect(formatFlowFromM3s(outletFlow(undefined))).toBe('—');
  });

  it('give a positive drop and a positive rise once solved (F3-11: no negative drops)', () => {
    expect(pressureDrop(solved)).toBe(200000);
    expect(pressureRise({ inlets: [{ pressure: 100000 }], outlets: [{ pressure: 700000 }] })).toBe(600000);
    expect(outletFlow(solved)).toBe(0.001);
  });

  it('treat a real zero as a value, not as missing', () => {
    expect(pressureDrop({ inlets: [{ pressure: 100000 }], outlets: [{ pressure: 100000 }] })).toBe(0);
  });
});
