import { describe, it, expect } from 'vitest';
import { splitEdgeWithTap, canInsertTap } from './insertTap';

const pipe = {
  id: 'e1', source: 'a', target: 'b', sourceHandle: 'outlet-0', targetHandle: 'inlet-0', label: 'Pipe 100',
  data: { label: 'Pipe 100', type: 'PIPE', length_m: 30, diameter_m: 0.05248, roughness_mm: 0.045, pipeClass: 'CS', telemetry: { flow_rate: 1 } },
};
const signal = { id: 's1', source: 'a', target: 'v', sourceHandle: 'signal-outlet-0', targetHandle: 'signal-in', data: { type: 'SIGNAL' } };
const nodes = [{ id: 'a', type: 'tank', position: { x: 0, y: 0 }, data: {} }, { id: 'b', type: 'tank', position: { x: 200, y: 0 }, data: {} }];

const split = (overrides = {}) => splitEdgeWithTap({
  nodes, edges: [pipe, signal], edgeId: 'e1', position: { x: 100, y: 50 },
  tapId: 'tap', tapData: { label: 'Measure Point 1' }, downstreamEdgeId: 'e2', downstreamLabel: 'Pipe 101', ...overrides,
});

describe('splitEdgeWithTap', () => {
  it('puts a tap between two halves of the pipe', () => {
    const { nodes: n, edges: e, tap } = split();
    expect(tap).toMatchObject({ id: 'tap', type: 'measure_point', position: { x: 80, y: 40 } });
    expect(n.map((x) => x.id)).toEqual(['a', 'b', 'tap']);

    const up = e.find((x) => x.id === 'e1');
    const down = e.find((x) => x.id === 'e2');
    expect(up).toMatchObject({ source: 'a', sourceHandle: 'outlet-0', target: 'tap', targetHandle: 'inlet-0', label: 'Pipe 100' });
    expect(down).toMatchObject({ source: 'tap', sourceHandle: 'outlet-0', target: 'b', targetHandle: 'inlet-0', label: 'Pipe 101' });
    expect(up.data).toMatchObject({ label: 'Pipe 100', length_m: 15, diameter_m: 0.05248, roughness_mm: 0.045, pipeClass: 'CS' });
    expect(down.data).toMatchObject({ label: 'Pipe 101', length_m: 15, diameter_m: 0.05248, roughness_mm: 0.045, pipeClass: 'CS' });
  });

  it('drops the old results and keeps other edges in place', () => {
    const { edges: e } = split();
    expect(e.map((x) => x.id)).toEqual(['e1', 'e2', 's1']);
    expect(e[0].data.telemetry).toBeUndefined();
    expect(e[1].data.telemetry).toBeUndefined();
  });

  it('halves the default length when the pipe has none', () => {
    const { edges: e } = split({ edges: [{ ...pipe, data: { type: 'PIPE' } }] });
    expect(e[0].data.length_m).toBe(12.5);
  });

  it('refuses signal lines and unknown edges', () => {
    expect(canInsertTap(signal)).toBe(false);
    expect(split({ edgeId: 's1' })).toBeNull();
    expect(split({ edgeId: 'nope' })).toBeNull();
  });
});
