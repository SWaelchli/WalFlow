import { describe, it, expect } from 'vitest';
import {
  readInstrument, readInstruments, alarmState, limitOrderError, retagForVariable, defaultInstrumentData,
  limitToDisplay, limitFromDisplay, formatReading,
} from './instrumentReadings';

const tel = {
  nodes: {
    tap: { inlets: [{ pressure: 351325, flow_rate: 0.002, temperature: 313.15, density: 860, viscosity: 0.0258 }], outlets: [{ pressure: 351325 }] },
    f: { inlets: [{ pressure: 400000 }], outlets: [{ pressure: 385000 }] },
  },
};
const edges = [
  { id: 'p1', source: 'pump', target: 'tap', sourceHandle: 'outlet-0', targetHandle: 'inlet-0', data: { type: 'PIPE', diameter: 0.05 } },
  { id: 'p2', source: 'tap', target: 'tank', sourceHandle: 'outlet-0', targetHandle: 'inlet-0', data: { type: 'PIPE', diameter: 0.08 } },
  { id: 's1', source: 'tap', target: 'i', sourceHandle: 'signal-inlet-0', targetHandle: 'signal-in', data: { type: 'SIGNAL' } },
  { id: 's2', source: 'f', target: 'd', sourceHandle: 'signal-inlet-0', targetHandle: 'signal-in', data: { type: 'SIGNAL' } },
  { id: 's3', source: 'f', target: 'd', sourceHandle: 'signal-outlet-0', targetHandle: 'signal-in-ref', data: { type: 'SIGNAL' } },
];
const inst = (variable, extra = {}) => ({ id: 'i', type: 'instrument', data: { variable, ...extra } });

describe('readInstrument', () => {
  it('reads pressure as gauge by default and absolute on request', () => {
    expect(readInstrument(inst('P'), edges, tel)).toBeCloseTo(2.5, 6);
    expect(readInstrument(inst('P', { pressure_basis: 'absolute' }), edges, tel)).toBeCloseTo(3.51325, 6);
    expect(readInstrument(inst('P'), edges, tel, 100000)).toBeCloseTo(2.51325, 6);
  });

  it('reads flow, temperature, velocity in the inlet-side pipe and kinematic viscosity', () => {
    expect(readInstrument(inst('Q'), edges, tel)).toBeCloseTo(120, 6);
    expect(readInstrument(inst('T'), edges, tel)).toBeCloseTo(40, 6);
    expect(readInstrument(inst('v'), edges, tel)).toBeCloseTo(0.002 / (Math.PI * 0.05 ** 2 / 4), 6); // ~1.02 m/s in DN50
    expect(readInstrument(inst('nu'), edges, tel)).toBeCloseTo(30, 6);
  });

  it('reads a pressure difference as (+) minus (-) and needs both inputs', () => {
    const d = { id: 'd', type: 'instrument', data: { variable: 'dP' } };
    expect(readInstrument(d, edges, tel)).toBeCloseTo(0.15, 6);
    expect(readInstrument(d, edges.filter((e) => e.id !== 's3'), tel)).toBeNull();
  });

  it('is null when unwired or without results', () => {
    expect(readInstrument({ id: 'x', type: 'instrument', data: { variable: 'P' } }, edges, tel)).toBeNull();
    expect(readInstrument(inst('P'), edges, null)).toBeNull();
    expect(readInstrument(inst('P'), edges, { nodes: {} })).toBeNull();
  });

  it('reads every instrument with its alarm state', () => {
    const nodes = [inst('P', { alarm_h: 2.0, alarm_hh: 3.0 }), { id: 'tap', type: 'measure_point', data: {} }];
    expect(readInstruments(nodes, edges, tel).get('i')).toEqual({ value: expect.closeTo(2.5, 6), state: 'H' });
    expect([...readInstruments(nodes, edges, tel).keys()]).toEqual(['i']);
  });
});

describe('alarms', () => {
  const limits = { alarm_ll: 1, alarm_l: 2, alarm_h: 8, alarm_hh: 9 };
  it('judges a reading against the set limits; blank limits are off', () => {
    expect(alarmState(9.5, limits)).toBe('HH');
    expect(alarmState(8, limits)).toBe('H');
    expect(alarmState(5, limits)).toBeNull();
    expect(alarmState(1.5, limits)).toBe('L');
    expect(alarmState(0.5, limits)).toBe('LL');
    expect(alarmState(100, { alarm_h: '' })).toBeNull();
    expect(alarmState(null, limits)).toBeNull();
  });

  it('requires LL < L < H < HH among the set limits', () => {
    expect(limitOrderError(limits)).toBeNull();
    expect(limitOrderError({ alarm_l: 2, alarm_hh: 9 })).toBeNull();
    expect(limitOrderError({ alarm_h: 8, alarm_hh: 8 })).toMatch(/LL < L < H < HH/);
    expect(limitOrderError({ alarm_ll: 5, alarm_h: 3 })).toMatch(/LL < L < H < HH/);
  });
});

describe('tags and units', () => {
  it('auto-tags by ISA letters and re-tags only automatic tags', () => {
    expect(defaultInstrumentData('P', ['PIT 1', 'PIT 2']).label).toBe('PIT 3');
    expect(defaultInstrumentData('nu', []).label).toBe('νI 1');
    expect(retagForVariable('PIT 3', 'P', 'Q', ['FIT 1'])).toBe('FIT 2');
    expect(retagForVariable('PT-101A', 'P', 'Q', [])).toBe('PT-101A');
  });

  it('converts limits for imperial input and formats readings', () => {
    expect(limitToDisplay('P', 1, true)).toBeCloseTo(14.504, 3);
    expect(limitFromDisplay('P', 14.503773773, true)).toBeCloseTo(1, 6);
    expect(limitFromDisplay('Q', '', false)).toBeNull();
    expect(limitToDisplay('nu', 30, true)).toBe(30);
    expect(formatReading('dP', 0.015, 'gauge', false)).toEqual({ text: '15.0', unit: 'mbar' });
    expect(formatReading('P', 2.5, 'absolute', false)).toEqual({ text: '2.50', unit: 'bar(a)' });
    expect(formatReading('Q', null, 'gauge', false)).toEqual({ text: '—', unit: 'L/min' });
  });
});
