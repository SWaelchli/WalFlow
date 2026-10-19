import { describe, it, expect } from 'vitest';
import { computeHeatmapRange } from './heatmapRange';

const edge = (id, inP, outP, flow, dia = 0.05) => ({
  id, data: { diameter_m: dia, telemetry: { inlets: [{ pressure: inP, flow_rate: flow, temperature: 300 }], outlets: [{ pressure: outP, flow_rate: flow, temperature: 305 }] } },
});
const base = { cases: [{ id: 'case_base', is_base: true }], activeCaseId: 'case_base', telemetryMode: 'mitigated', allCases: false };

describe('computeHeatmapRange', () => {
  const edges = [edge('a', 5e5, 4.5e5, 1e-3), edge('b', 4.5e5, 2.123456e5, 5e-4)];

  it('scans both ends of every pipe', () => {
    expect(computeHeatmapRange({ ...base, edges, mode: 'pressure' })).toEqual({ min: 2.123456, max: 5 });
  });

  it('rounds to 0.1 when asked (custom range)', () => {
    expect(computeHeatmapRange({ ...base, edges, mode: 'pressure', round: true })).toEqual({ min: 2.1, max: 5 });
  });

  it('converts temperature, flow and velocity', () => {
    expect(computeHeatmapRange({ ...base, edges, mode: 'temperature' })).toEqual({ min: 300 - 273.15, max: 305 - 273.15 });
    const flow = computeHeatmapRange({ ...base, edges, mode: 'volumeflow' });
    expect(flow.min).toBeCloseTo(30, 6);
    expect(flow.max).toBeCloseTo(60, 6);
    const v = computeHeatmapRange({ ...base, edges: [edge('a', 1, 1, 1e-3, 0.05), edge('b', 1, 1, 2e-3, 0.05)], mode: 'velocity' });
    const area = Math.PI * 0.05 ** 2 / 4;
    expect(v.min).toBeCloseTo(1e-3 / area, 6);
    expect(v.max).toBeCloseTo(2e-3 / area, 6);
  });

  it('falls back when there are no results or all values are equal', () => {
    expect(computeHeatmapRange({ ...base, edges: [{ id: 'x', data: {} }], mode: 'pressure' })).toEqual({ min: 0, max: 6 });
    expect(computeHeatmapRange({ ...base, edges: [edge('a', 3e5, 3e5, 0)], mode: 'pressure' })).toEqual({ min: 0, max: 6 });
    expect(computeHeatmapRange({ ...base, edges, mode: 'default' })).toEqual({ min: 0, max: 1 });
  });
});
