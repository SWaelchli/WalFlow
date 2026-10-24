import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateNetwork, checkNewConnection, PORTS_BY_TYPE } from './networkValidation';

const node = (id, type, label) => ({ id, type, position: { x: 0, y: 0 }, data: { label: label || id } });
const pipe = (id, source, target, sourceHandle = 'outlet-0', targetHandle = 'inlet-0') => (
  { id, source, target, sourceHandle, targetHandle, data: { type: 'PIPE', label: id } }
);
const codes = (list) => list.map(f => f.code).sort();

const good = () => ({
  nodes: [node('t1', 'tank'), node('p1', 'centrifugal_pump'), node('t2', 'tank')],
  edges: [pipe('e1', 't1', 'p1'), pipe('e2', 'p1', 't2')],
});

describe('measurement taps and instruments', () => {
  it('a tap is an in-line component and an instrument bubble is not part of the network', () => {
    const d = {
      nodes: [node('t1', 'tank'), node('tap', 'measure_point'), node('t2', 'tank'), node('i', 'instrument')],
      edges: [pipe('e1', 't1', 'tap'), pipe('e2', 'tap', 't2'),
        { id: 's', source: 'tap', target: 'i', sourceHandle: 'signal-inlet-0', targetHandle: 'signal-in', data: { type: 'SIGNAL' } }],
    };
    const r = validateNetwork(d);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  const sig = (id, source, targetHandle) => (
    { id, source, target: 'i', sourceHandle: 'signal-outlet-0', targetHandle, data: { type: 'SIGNAL' } }
  );
  const withInstrument = (variable, signals) => {
    const d = good();
    d.nodes.push({ ...node('i', 'instrument', 'PIT 1'), data: { label: 'PIT 1', variable } });
    d.edges.push(...signals);
    return validateNetwork(d).warnings;
  };

  it('warns about an instrument that is not wired', () => {
    const w = withInstrument('P', []);
    expect(codes(w)).toEqual(['instrument_unwired']);
    expect(w[0].nodeIds).toEqual(['i']);
    expect(withInstrument('P', [sig('s', 'p1', 'signal-in')])).toEqual([]);
  });

  it('warns about a ΔP instrument with only one input', () => {
    expect(codes(withInstrument('dP', []))).toEqual(['instrument_unwired']);
    expect(withInstrument('dP', [sig('s', 'p1', 'signal-in')])[0].message).toMatch(/only its \(\+\) input/);
    expect(withInstrument('dP', [sig('s', 'p1', 'signal-in-ref')])[0].message).toMatch(/only its \(−\) input/);
    expect(withInstrument('dP', [sig('s', 'p1', 'signal-in'), sig('r', 't1', 'signal-in-ref')])).toEqual([]);
  });
});

describe('checkNewConnection', () => {
  const edges = [pipe('e1', 't1', 'p1')];

  it('refuses a second pipe on an occupied outlet or inlet', () => {
    expect(checkNewConnection(edges, { source: 't1', target: 'x', sourceHandle: 'outlet-0', targetHandle: 'inlet-0' }).ok).toBe(false);
    expect(checkNewConnection(edges, { source: 'y', target: 'p1', sourceHandle: 'outlet-0', targetHandle: 'inlet-0' }).ok).toBe(false);
  });

  it('allows free ports, other ports of the same component and self-loops on free ports', () => {
    expect(checkNewConnection(edges, { source: 'p1', target: 't2', sourceHandle: 'outlet-0', targetHandle: 'inlet-0' }).ok).toBe(true);
    expect(checkNewConnection(edges, { source: 's', target: 'm', sourceHandle: 'outlet-1', targetHandle: 'inlet-1' }).ok).toBe(true);
    expect(checkNewConnection([], { source: 'p', target: 'p', sourceHandle: 'outlet-0', targetHandle: 'inlet-0' }).ok).toBe(true);
  });

  it('does not restrict signal links', () => {
    const withSignal = [...edges, { id: 's1', source: 't1', target: 'rv', sourceHandle: 'signal-outlet-0', targetHandle: 'signal-in', data: { type: 'SIGNAL' } }];
    expect(checkNewConnection(withSignal, { source: 't1', target: 'rv2', sourceHandle: 'signal-outlet-0', targetHandle: 'signal-in' }).ok).toBe(true);
  });
});

describe('validateNetwork', () => {
  it('accepts a complete circuit without findings', () => {
    expect(validateNetwork(good())).toEqual({ errors: [], warnings: [] });
  });

  it('blocks an empty drawing (notes do not count)', () => {
    expect(codes(validateNetwork({ nodes: [], edges: [] }).errors)).toEqual(['empty_drawing']);
    expect(codes(validateNetwork({ nodes: [node('n', 'text_bubble')], edges: [] }).errors)).toEqual(['empty_drawing']);
  });

  it('reports an unknown component type as an error', () => {
    const d = good();
    d.nodes.push(node('x', 'warp_drive'));
    const r = validateNetwork(d);
    expect(codes(r.errors)).toEqual(['unknown_type']);
    expect(r.errors[0].nodeIds).toEqual(['x']);
  });

  it('honours the set of types the canvas can render', () => {
    const r = validateNetwork(good(), new Set(['tank']));
    expect(codes(r.errors)).toEqual(['unknown_type']);
  });

  it('reports two pipes on one port as an error naming a splitter', () => {
    const d = good();
    d.nodes.push(node('t3', 'tank'));
    d.edges.push(pipe('e3', 't3', 'p1'));
    const r = validateNetwork(d);
    expect(codes(r.errors)).toEqual(['port_shared']);
    expect(r.errors[0].edgeIds.sort()).toEqual(['e1', 'e3']);
    expect(r.errors[0].message).toMatch(/splitter or mixer/);
  });

  it('reports a pipe on a port the component does not have', () => {
    const d = good();
    d.edges[0] = pipe('e1', 't1', 'p1', 'outlet-0', 'inlet-3');
    expect(codes(validateNetwork(d).errors)).toEqual(['invalid_port']);
  });

  it('reports a pipe to a deleted component', () => {
    const d = good();
    d.edges.push(pipe('e9', 'p1', 'gone'));
    expect(codes(validateNetwork(d).errors)).toContain('unknown_endpoint');
  });

  it('warns about an open outlet (orifice outlet left open)', () => {
    const d = {
      nodes: [node('t1', 'tank'), node('o1', 'orifice')],
      edges: [pipe('e1', 't1', 'o1')],
    };
    const r = validateNetwork(d);
    expect(r.errors).toEqual([]);
    expect(codes(r.warnings)).toEqual(['open_port']);
    expect(r.warnings[0].nodeIds).toEqual(['o1']);
  });

  it('does not warn about unused tank ports or a vented relief outlet', () => {
    const d = {
      nodes: [node('t1', 'tank'), node('r1', 'pressure_safety_valve')],
      edges: [pipe('e1', 't1', 'r1')],
    };
    expect(validateNetwork(d)).toEqual({ errors: [], warnings: [] });
  });

  it('blocks a self-loop that also shares ports with other pipes', () => {
    const d = good();
    d.edges.push(pipe('loop', 'p1', 'p1'));
    const r = validateNetwork(d);
    expect(r.errors.map(f => f.code)).toEqual(['port_shared', 'port_shared']);
  });

  it('warns about a self-loop on a pump that otherwise stands alone', () => {
    const d = { nodes: [node('p1', 'centrifugal_pump')], edges: [pipe('loop', 'p1', 'p1')] };
    const r = validateNetwork(d);
    expect(r.errors).toEqual([]);
    expect(codes(r.warnings)).toEqual(['no_boundary', 'self_loop']);
  });

  it('warns about an isolated component', () => {
    const d = good();
    d.nodes.push(node('lonely', 'filter'));
    const r = validateNetwork(d);
    expect(r.errors).toEqual([]);
    expect(codes(r.warnings)).toEqual(['isolated_node']);
  });

  it('warns about a connected group without a boundary', () => {
    const d = {
      nodes: [node('p1', 'centrifugal_pump'), node('f1', 'filter')],
      edges: [pipe('e1', 'p1', 'f1'), pipe('e2', 'f1', 'p1')],
    };
    expect(codes(validateNetwork(d).warnings)).toEqual(['no_boundary']);
  });

  it('ignores signal links', () => {
    const d = good();
    d.nodes.push(node('rv', 'remote_control_valve'));
    d.edges.push({ id: 's1', source: 't1', target: 'rv', sourceHandle: 'signal-outlet-0', targetHandle: 'signal-in', data: { type: 'SIGNAL' } });
    const r = validateNetwork(d);
    expect(r.errors).toEqual([]);
    expect(codes(r.warnings)).toEqual(['isolated_node']);
  });

  it('splitters and mixers take one pipe per port', () => {
    const d = {
      nodes: [node('t1', 'tank'), node('s', 'splitter'), node('t2', 'tank'), node('t3', 'tank')],
      edges: [pipe('a', 't1', 's'), pipe('b', 's', 't2', 'outlet-0'), pipe('c', 's', 't3', 'outlet-1')],
    };
    expect(validateNetwork(d)).toEqual({ errors: [], warnings: [] });
  });

  it('knows the ports of every type', () => {
    Object.values(PORTS_BY_TYPE).forEach(p => {
      expect(Array.isArray(p.inlets) && Array.isArray(p.outlets)).toBe(true);
    });
  });
});

// Every shipped drawing passes the model checks, so none of them is blocked from running
describe('shipped diagrams pass the model checks', () => {
  const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
  const files = [
    ...readdirSync(join(dataDir, 'examples')).filter(f => f.endsWith('.wlf')).map(f => join(dataDir, 'examples', f)),
    join(dataDir, 'GreetingCanvas.wlf'),
  ];

  it.each(files)('%s has no errors or warnings', (file) => {
    const data = JSON.parse(readFileSync(file, 'utf-8'));
    expect(validateNetwork(data, new Set(Object.keys(PORTS_BY_TYPE)))).toEqual({ errors: [], warnings: [] });
  });
});
