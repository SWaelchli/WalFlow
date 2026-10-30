import { describe, it, expect } from 'vitest';
import {
  readInstrument, readInstruments, alarmState, limitOrderError, retagForVariable, defaultInstrumentData,
  limitToDisplay, limitFromDisplay, formatReading, instrumentInput, describeInstrumentInput,
} from './instrumentReadings';

const tel = {
  nodes: {
    tap: { inlets: [{ pressure: 351325, flow_rate: 0.002, temperature: 313.15, density: 860, viscosity: 0.0258 }], outlets: [{ pressure: 351325 }] },
    j: { ports: [{ pressure: 300000, flow_rate: 0.001 }, { pressure: 300000, flow_rate: -0.0004 }, { pressure: 300000, flow_rate: null }] },
    f: { inlets: [{ pressure: 400000 }], outlets: [{ pressure: 385000 }] },
    o: { ports: [{ pressure: 400000, flow_rate: 0.001 }, { pressure: 380000, flow_rate: -0.001 }] },
    tk: { ports: [{ pressure: 200000, flow_rate: 0.003 }, { pressure: 200000, flow_rate: 0.001 }] },
  },
};
const edges = [
  { id: 'p1', source: 'pump', target: 'tap', sourceHandle: 'outlet-0', targetHandle: 'inlet-0', data: { type: 'PIPE', diameter_m: 0.05 } },
  { id: 'p2', source: 'tap', target: 'tank', sourceHandle: 'outlet-0', targetHandle: 'inlet-0', data: { type: 'PIPE', diameter_m: 0.08 } },
  { id: 's1', source: 'tap', target: 'i', sourceHandle: 'signal-inlet-0', targetHandle: 'signal-in', data: { type: 'SIGNAL' } },
  { id: 'jp0', source: 'j', target: 'jq', sourceHandle: 'signal-port-0', targetHandle: 'signal-in', data: { type: 'SIGNAL' } },
  { id: 'jp1', source: 'j', target: 'jr', sourceHandle: 'signal-port-1', targetHandle: 'signal-in', data: { type: 'SIGNAL' } },
  { id: 'jp2', source: 'j', target: 'js', sourceHandle: 'signal-port-2', targetHandle: 'signal-in', data: { type: 'SIGNAL' } },
  { id: 'jpipe', source: 'j', target: 'tank', sourceHandle: 'port-1', targetHandle: 'inlet-0', data: { type: 'PIPE', diameter_m: 0.04 } },
  { id: 'op0', source: 'o', target: 'tank', sourceHandle: 'port-0', targetHandle: 'inlet-0', data: { type: 'PIPE', diameter_m: 0.05 } },
  { id: 'op1', source: 'o', target: 'tank', sourceHandle: 'port-1', targetHandle: 'inlet-0', data: { type: 'PIPE', diameter_m: 0.05 } },
  { id: 'so0', source: 'o', target: 'oq', sourceHandle: 'signal-port-0', targetHandle: 'signal-in', data: { type: 'SIGNAL' } },
  { id: 'so1', source: 'o', target: 'or', sourceHandle: 'signal-port-1', targetHandle: 'signal-in', data: { type: 'SIGNAL' } },
  { id: 'st0', source: 'tk', target: 'tq0', sourceHandle: 'signal-port-0', targetHandle: 'signal-in', data: { type: 'SIGNAL' } },
  { id: 'st1', source: 'tk', target: 'tq1', sourceHandle: 'signal-port-1', targetHandle: 'signal-in', data: { type: 'SIGNAL' } },
  { id: 's2', source: 'f', target: 'd', sourceHandle: 'signal-inlet-0', targetHandle: 'signal-in', data: { type: 'SIGNAL' } },
  { id: 's3', source: 'f', target: 'd', sourceHandle: 'signal-outlet-0', targetHandle: 'signal-in-ref', data: { type: 'SIGNAL' } },
];
const hosts = [{ id: 'o', type: 'orifice' }, { id: 'tk', type: 'tank' }];
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

  it('reads a junction port pin from telemetry.ports: flow positive into the junction, null when unconnected', () => {
    const at = (id, variable) => readInstrument({ id, type: 'instrument', data: { variable } }, edges, tel);
    expect(at('jq', 'Q')).toBeCloseTo(60, 6);
    expect(at('jr', 'Q')).toBeCloseTo(-24, 6);
    expect(at('js', 'Q')).toBeNull();
    expect(at('jq', 'P')).toBeCloseTo(1.98675, 6);
    expect(at('jr', 'v')).toBeCloseTo(-0.0004 / (Math.PI * 0.04 ** 2 / 4), 6); // pipe found on the junction port as its source
    expect(at('jq', 'v')).toBeNull(); // no pipe on port-0
  });

  it('reads the flow through a two-port component whichever port is tapped', () => {
    const at = (id, variable) => readInstrument({ id, type: 'instrument', data: { variable } }, edges, tel, 101325, hosts);
    const through = 0.001 / (Math.PI * 0.05 ** 2 / 4);
    expect(at('oq', 'Q')).toBeCloseTo(60, 6);
    expect(at('or', 'Q')).toBeCloseTo(60, 6); // port-1 reads +Q, not the flow into that port
    expect(at('or', 'v')).toBeCloseTo(through, 6);
    expect(at('or', 'P')).toBeCloseTo(2.78675, 6); // pressure stays that of the tapped port
    // a two-port tank is not in-line: each port reads its own flow
    expect(at('tq0', 'Q')).toBeCloseTo(180, 6);
    expect(at('tq1', 'Q')).toBeCloseTo(60, 6);
    // without the node list the tapped port's own entry is read
    expect(readInstrument({ id: 'or', type: 'instrument', data: { variable: 'Q' } }, edges, tel)).toBeCloseTo(-60, 6);
  });

  it('reads the through flow of a two-port component whose port 0 is free (null)', () => {
    const half = { nodes: { o: { ports: [null, { pressure: 380000, flow_rate: -0.001 }] } } };   // leaving by Port 2
    const at = (variable) => readInstrument({ id: 'or', type: 'instrument', data: { variable } }, edges, half, 101325, hosts);
    expect(at('Q')).toBeCloseTo(60, 6);
    expect(at('v')).toBeCloseTo(0.001 / (Math.PI * 0.05 ** 2 / 4), 6);
  });

  it('names a junction pin 1-based and a component pin by its handle', () => {
    const nodes = [{ id: 'j', type: 'junction', data: { label: 'J-1' } }, { id: 'f', type: 'filter', data: { label: 'F-1' } }];
    expect(describeInstrumentInput(instrumentInput('js', edges), nodes)).toBe('J-1 · Port 3');
    expect(describeInstrumentInput(instrumentInput('d', edges), nodes)).toBe('F-1 · inlet 0');
    expect(describeInstrumentInput(null, nodes)).toBeNull();
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
    expect(formatReading('P', 2.5, 'absolute', false)).toEqual({ text: '2.50', unit: 'bar a' });
    expect(formatReading('Q', null, 'gauge', false)).toEqual({ text: '—', unit: 'L/min' });
  });
});
