import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateNetwork, checkNewConnection, normalizeConnection, portsOf, PORTS_BY_TYPE } from './networkValidation';

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

describe('junction ports', () => {
  const nodes = [node('t1', 'tank'), node('t2', 'tank'), node('f', 'filter'), node('j', 'junction'), node('k', 'junction')];
  const c = (source, sourceHandle, target, targetHandle) => ({ source, sourceHandle, target, targetHandle });
  const norm = (conn) => normalizeConnection(nodes, conn);
  const swapped = (conn) => c(conn.target, conn.targetHandle, conn.source, conn.sourceHandle);

  it.each([
    ['outlet to inlet is kept', c('t1', 'outlet-0', 'f', 'inlet-0'), true, false],
    ['inlet to outlet is swapped', c('f', 'inlet-0', 't1', 'outlet-0'), true, true],
    ['outlet to outlet is rejected', c('t1', 'outlet-0', 'f', 'outlet-0'), false],
    ['inlet to inlet is rejected', c('t1', 'inlet-0', 'f', 'inlet-0'), false],
    ['outlet to a junction port is kept', c('t1', 'outlet-0', 'j', 'port-1'), true, false],
    ['junction port to an inlet is kept', c('j', 'port-1', 'f', 'inlet-0'), true, false],
    ['inlet dragged to a junction port is swapped', c('f', 'inlet-0', 'j', 'port-1'), true, true],
    ['junction port dragged to an outlet is swapped', c('j', 'port-1', 't1', 'outlet-0'), true, true],
    ['junction port to a handle that is no port is rejected', c('j', 'port-0', 'f', 'port-0'), false],
    ['two junction ports are stored as dragged', c('k', 'port-2', 'j', 'port-0'), true, false],
    ['signal pin to an input is kept', c('f', 'signal-outlet-0', 'i', 'signal-in'), true, false],
    ['signal input dragged to a pin is swapped', c('i', 'signal-in-ref', 'j', 'signal-port-1'), true, true],
    ['signal pin to a pin is rejected', c('f', 'signal-inlet-0', 'j', 'signal-port-0'), false],
    ['signal to a hydraulic port is rejected', c('f', 'signal-inlet-0', 'j', 'port-0'), false],
    ['same port to itself is rejected', c('j', 'port-0', 'j', 'port-0'), false],
    ['two ports of one junction are a kept self-loop', c('j', 'port-0', 'j', 'port-1'), true, false],
  ])('%s', (_name, conn, ok, flips) => {
    const r = norm(conn);
    expect(r.ok).toBe(ok);
    if (ok) expect(r.connection).toEqual(flips ? swapped(conn) : conn);
  });

  it('whatever pair of handles is dragged, a stored pipe never starts at an inlet or ends at an outlet', () => {
    const ends = [['t1', 'outlet-0'], ['f', 'inlet-0'], ['j', 'port-1'], ['k', 'port-2'], ['t2', 'outlet-1'], ['f', 'inlet-1']];
    ends.forEach(([s, sh]) => ends.forEach(([t, th]) => {
      const r = norm(c(s, sh, t, th));
      if (!r.ok) return;
      expect(r.connection.sourceHandle, `${sh} -> ${th}`).not.toMatch(/^inlet-/);
      expect(r.connection.targetHandle, `${sh} -> ${th}`).not.toMatch(/^outlet-/);
    }));
  });

  it('a junction port takes one pipe in total, whichever end of the pipe it is on', () => {
    const edges = [pipe('a', 't1', 'j', 'outlet-0', 'port-0'), pipe('b', 'j', 't2', 'port-1', 'inlet-0')];
    expect(checkNewConnection(edges, c('f', 'outlet-0', 'j', 'port-0')).ok).toBe(false);   // port-0 is a pipe target
    expect(checkNewConnection(edges, c('j', 'port-0', 'f', 'inlet-0')).ok).toBe(false);    // as a source
    expect(checkNewConnection(edges, c('f', 'outlet-0', 'j', 'port-1')).ok).toBe(false);   // port-1 is a pipe source
    expect(checkNewConnection(edges, c('j', 'port-1', 'f', 'inlet-0')).ok).toBe(false);
    expect(checkNewConnection(edges, c('f', 'outlet-0', 'j', 'port-2')).ok).toBe(true);
    expect(checkNewConnection(edges, c('j', 'port-2', 'k', 'port-0')).ok).toBe(true);
  });

  it('portsOf follows num_ports of a junction and clamps it to 3..8', () => {
    const ids = (n) => portsOf({ type: 'junction', data: { num_ports: n } }).either;
    expect(ids(3)).toEqual(['port-0', 'port-1', 'port-2']);
    expect(ids(8)).toEqual(Array.from({ length: 8 }, (_, k) => `port-${k}`));
    expect(ids(undefined)).toHaveLength(3);
    expect(ids(20)).toHaveLength(8);
    expect(portsOf({ type: 'tank' })).toEqual({ either: [], inlets: ['inlet-0'], outlets: ['outlet-0'] });
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

  it('reports two pipes on one port as an error pointing to a junction', () => {
    const d = good();
    d.nodes.push(node('t3', 'tank'));
    d.edges.push(pipe('e3', 't3', 'p1'));
    const r = validateNetwork(d);
    expect(codes(r.errors)).toEqual(['port_shared']);
    expect(r.errors[0].edgeIds.sort()).toEqual(['e1', 'e3']);
    expect(r.errors[0].message).toMatch(/use a junction/i);
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

  it('a junction drawn in either direction has no invalid port and does not warn about its unused port', () => {
    const jn = { ...node('j', 'junction'), data: { label: 'j', num_ports: 4 } };
    const d = {
      nodes: [node('t1', 'tank'), jn, node('t2', 'tank'), node('t3', 'tank')],
      edges: [
        pipe('a', 't1', 'j', 'outlet-0', 'port-0'),   // into the junction
        pipe('b', 'j', 't2', 'port-1', 'inlet-0'),    // out of it
        pipe('c', 't3', 'j', 'outlet-0', 'port-2'),
      ],
    };
    const r = validateNetwork(d);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);   // Port 4 (port-3) is unused, which is normal for a junction
    d.edges.push(pipe('x', 'j', 't1', 'port-4', 'inlet-0'));
    const bad = validateNetwork(d).errors;
    expect(codes(bad)).toEqual(['invalid_port']);
    expect(bad[0].message).toMatch(/Port 5/);   // 1-based, not "port-4"
    expect(bad[0].message).not.toMatch(/port-4/);
  });

  it('two pipes on one junction port are an error even when they run in opposite directions', () => {
    const d = {
      nodes: [node('t1', 'tank'), node('j', 'junction'), node('t2', 'tank')],
      edges: [pipe('a', 't1', 'j', 'outlet-0', 'port-0'), pipe('b', 'j', 't2', 'port-0', 'inlet-0')],
    };
    const r = validateNetwork(d);
    expect(codes(r.errors)).toEqual(['port_shared']);
    expect(r.errors[0].message).toMatch(/Port 1 of/);   // shown 1-based
  });

  it('warns about a sensing line from a junction port without a pipe, and only then', () => {
    const jn = { ...node('j', 'junction'), data: { label: 'J-1', num_ports: 3 } };
    const sense = (port) => (
      { id: 's', source: 'j', target: 'i', sourceHandle: `signal-port-${port}`, targetHandle: 'signal-in', data: { type: 'SIGNAL' } }
    );
    const diagram = (port) => ({
      nodes: [node('t1', 'tank'), jn, node('t2', 'tank'), node('i', 'instrument')],
      edges: [pipe('a', 't1', 'j', 'outlet-0', 'port-0'), pipe('b', 'j', 't2', 'port-1', 'inlet-0'), sense(port)],
    });
    expect(validateNetwork(diagram(1)).warnings).toEqual([]);
    const r = validateNetwork(diagram(2));
    expect(r.errors).toEqual([]);
    expect(codes(r.warnings)).toEqual(['signal_port_unpiped']);
    expect(r.warnings[0].message).toMatch(/Port 3 of J-1/);
    expect(r.warnings[0].nodeIds).toEqual(['j']);
    expect(r.warnings[0].edgeIds).toEqual(['s']);
  });

  it.each([
    ['missing key', undefined, true],
    ['whole number', 4, true],
    ['whole decimal string', '4.0', true],
    ['padded string', ' 4 ', true],
    ['numeric string', '4', true],
    ['lower bound', 3, true],
    ['upper bound', 8, true],
    ['fraction', 4.6, false],
    ['null', null, false],
    ['empty string', '', false],
    ['text', 'x', false],
    ['infinity', Infinity, false],
    ['NaN', NaN, false],
    ['boolean', true, false],
    ['false', false, false],
    ['hex string', '0x4', false],
    ['binary string', '0b100', false],
    ['octal string', '0o4', false],
    ['below 3', 2, false],
    ['above 8', 9, false],
  ])('junction num_ports: %s', (_name, numPorts, valid) => {
    const data = { label: 'J-1' };
    if (numPorts !== undefined) data.num_ports = numPorts;
    const d = {
      nodes: [node('t1', 'tank'), { ...node('j', 'junction'), data }],
      edges: [pipe('a', 't1', 'j', 'outlet-0', 'port-0')],
    };
    const r = validateNetwork(d);
    expect(codes(r.errors)).toEqual(valid ? [] : ['invalid_num_ports']);
    if (!valid) expect(r.errors[0].nodeIds).toEqual(['j']);
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
