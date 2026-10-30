import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateNetwork, checkNewConnection, normalizeConnection, flipBoundaryEdges, flipBlockedMessage, portsOf, dropEdgesToMissingHandles, PORTS_BY_TYPE, SAME_ROLE_MESSAGE } from './networkValidation';

const node = (id, type, label) => ({ id, type, position: { x: 0, y: 0 }, data: { label: label || id } });
const pipe = (id, source, target, sourceHandle = 'outlet-0', targetHandle = 'inlet-0') => (
  { id, source, target, sourceHandle, targetHandle, data: { type: 'PIPE', label: id } }
);
const codes = (list) => list.map(f => f.code).sort();

const good = () => ({
  nodes: [node('t1', 'tank'), node('p1', 'centrifugal_pump'), node('t2', 'tank')],
  edges: [pipe('e1', 't1', 'p1', 'port-0'), pipe('e2', 'p1', 't2', 'outlet-0', 'port-0')],
});

describe('measurement taps and instruments', () => {
  it('a tap is an in-line component and an instrument bubble is not part of the network', () => {
    const d = {
      nodes: [node('t1', 'tank'), node('tap', 'measure_point'), node('t2', 'tank'), node('i', 'instrument')],
      edges: [pipe('e1', 't1', 'tap', 'port-0', 'port-0'), pipe('e2', 'tap', 't2', 'port-1', 'port-0'),
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
    ['junction port to a neutral component port is kept as dragged', c('j', 'port-0', 'f', 'port-0'), true, false],
    ['junction port to a handle that is no port is rejected', c('j', 'port-0', 'f', 'bogus'), false],
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

  it('gives the same-role reason only for two outlets or two inlets', () => {
    expect(norm(c('t1', 'outlet-0', 'f', 'outlet-0')).message).toBe(SAME_ROLE_MESSAGE);
    expect(norm(c('t1', 'inlet-0', 'f', 'inlet-0')).message).toBe(SAME_ROLE_MESSAGE);
    expect(norm(c('j', 'port-0', 'f', 'bogus')).message).toBeUndefined();
    expect(norm(c('f', 'signal-inlet-0', 'j', 'port-0')).message).toBeUndefined();
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
    const edges = [pipe('a', 't1', 'j', 'port-0', 'port-0'), pipe('b', 'j', 't2', 'port-1', 'port-0')];
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
    expect(portsOf({ type: 'tank' })).toEqual({ either: ['port-0'], inlets: [], outlets: [] });
  });
});

describe('flow boundary direction', () => {
  const fb = (direction) => ({ ...node('b', 'flow_boundary'), data: { label: 'b', flow_direction: direction } });
  const c = (source, sourceHandle, target, targetHandle) => ({ source, sourceHandle, target, targetHandle });

  it.each([
    ['supply: drawn out of the boundary is kept', 'supply', c('b', 'port-0', 'f', 'inlet-0'), false],
    ['supply: drawn into the boundary is swapped', 'supply', c('f', 'inlet-0', 'b', 'port-0'), true],
    ['draw: drawn into the boundary is kept', 'draw', c('f', 'outlet-0', 'b', 'port-0'), false],
    ['draw: drawn out of the boundary is swapped', 'draw', c('b', 'port-0', 'f', 'outlet-0'), true],
    ['no direction counts as supply', undefined, c('f', 'inlet-0', 'b', 'port-0'), true],
  ])('%s', (_name, direction, conn, flips) => {
    const r = normalizeConnection([fb(direction), node('f', 'filter')], conn);
    expect(r.ok).toBe(true);
    expect(r.connection).toEqual(flips ? c(conn.target, conn.targetHandle, conn.source, conn.sourceHandle) : conn);
  });

  it('flipBoundaryEdges turns only the hydraulic pipes of that node and keeps signal lines and other pipes', () => {
    const edges = [
      pipe('a', 'b', 'f', 'port-0', 'inlet-0'),
      pipe('c', 'x', 'b', 'outlet-0', 'port-1'),
      pipe('other', 'x', 'f'),
      { id: 's', source: 'b', target: 'i', sourceHandle: 'signal-port-0', targetHandle: 'signal-in', data: { type: 'SIGNAL' } },
    ];
    const out = flipBoundaryEdges(edges, 'b');
    expect(out[0]).toMatchObject({ source: 'f', sourceHandle: 'inlet-0', target: 'b', targetHandle: 'port-0' });
    expect(out[1]).toMatchObject({ source: 'b', sourceHandle: 'port-1', target: 'x', targetHandle: 'outlet-0' });
    expect(out[2]).toBe(edges[2]);
    expect(out[3]).toBe(edges[3]);
  });

  it('flipBoundaryEdges drops the stale results of a turned pipe only', () => {
    const tele = { inlet: { flow_rate: 1 } };
    const edges = [
      { ...pipe('a', 'b', 'f'), data: { type: 'PIPE', telemetry: tele } },
      { ...pipe('other', 'x', 'f'), data: { type: 'PIPE', telemetry: tele } },
    ];
    const out = flipBoundaryEdges(edges, 'b');
    expect(out[0].data).toEqual({ type: 'PIPE' });
    expect(out[1].data.telemetry).toBe(tele);
  });

  const fbDir = (direction) => ({ ...node('b', 'flow_boundary', 'FB1'), data: { label: 'FB1', flow_direction: direction } });
  const dirErrors = (direction, edge) => validateNetwork({ nodes: [fbDir(direction), node('f', 'filter'), node('t', 'tank')], edges: [edge] })
    .errors.filter(f => f.code === 'flow_boundary_direction');

  it.each([
    ['draw boundary as pipe source', 'draw', pipe('e', 'b', 't', 'port-0', 'port-0'), /draws flow, so its pipes must run into it/],
    ['supply boundary as pipe target', 'supply', pipe('e', 't', 'b', 'port-0', 'port-0'), /supplies flow, so its pipes must run out of it/],
    ['missing direction counts as supply', undefined, pipe('e', 't', 'b', 'port-0', 'port-0'), /supplies flow/],
  ])('direction error: %s', (_name, direction, edge, message) => {
    const [f, ...rest] = dirErrors(direction, edge);
    expect(rest).toEqual([]);
    expect(f).toMatchObject({ severity: 'error', nodeIds: ['b'], edgeIds: ['e'] });
    expect(f.message).toMatch(message);
    expect(f.message).toMatch(/^Flow boundary 'FB1'/);
  });

  it.each([
    ['supply out of the boundary', 'supply', pipe('e', 'b', 't', 'port-0', 'port-0')],
    ['missing direction out of the boundary', undefined, pipe('e', 'b', 't', 'port-0', 'port-0')],
    ['draw into the boundary', 'draw', pipe('e', 't', 'b', 'port-0', 'port-0')],
    ['signal line on a boundary is not checked', 'draw',
      { id: 'e', source: 'b', target: 't', sourceHandle: 'signal-port-0', targetHandle: 'signal-in', data: { type: 'SIGNAL' } }],
  ])('no direction error: %s', (_name, direction, edge) => {
    expect(dirErrors(direction, edge)).toEqual([]);
  });

  describe('flipBlockedMessage', () => {
    const nodes = [fbDir('supply'), node('pump', 'centrifugal_pump', 'Pump 1'), node('f', 'filter'), node('t', 'tank'), node('j', 'junction'),
      { id: 'v', type: 'check_valve', data: {} }];
    const sig = { id: 's', source: 'b', target: 'pump', sourceHandle: 'signal-port-0', targetHandle: 'inlet-0', data: { type: 'SIGNAL' } };

    it.each([
      ['feeds a pump inlet', [pipe('e', 'b', 'pump', 'port-0', 'inlet-0')],
        "Cannot switch 'FB1' to draw: its pipe feeds the inlet of 'Pump 1'. Reconnect it first."],
      ['is fed by a pump outlet', [pipe('e', 'pump', 'b', 'outlet-0', 'port-0')],
        "Cannot switch 'FB1' to draw: its pipe is fed by the outlet of 'Pump 1'. Reconnect it first."],
      ['name falls back to the id', [pipe('e', 'b', 'v', 'port-0', 'inlet-0')],
        "Cannot switch 'FB1' to draw: its pipe feeds the inlet of 'v'. Reconnect it first."],
      ['first blocking pipe wins after neutral and signal ones',
        [pipe('n', 'b', 't', 'port-0', 'port-0'), sig, pipe('e', 'pump', 'b', 'outlet-0', 'port-1')],
        "Cannot switch 'FB1' to draw: its pipe is fed by the outlet of 'Pump 1'. Reconnect it first."],
      ['neutral far ends do not block',
        [pipe('a', 'b', 't', 'port-0', 'port-0'), pipe('c', 'j', 'b', 'port-1', 'port-1'), pipe('d', 'b', 'f', 'port-2', 'port-0')], null],
      ['signal lines and unrelated pipes are ignored', [sig, pipe('e', 'pump', 't', 'outlet-0', 'port-0')], null],
    ])('%s', (_name, edges, expected) => {
      expect(flipBlockedMessage(nodes, edges, 'b', 'draw')).toBe(expected);
    });

    it('names a component by label, then tag, then id', () => {
      const tagged = { id: 'n1', type: 'centrifugal_pump', data: { tag: 'P-7' } };
      const out = flipBlockedMessage([fbDir('supply'), tagged], [pipe('e', 'b', 'n1', 'port-0', 'inlet-0')], 'b', 'draw');
      expect(out).toMatch(/of 'P-7'/);
    });
  });
});

describe('boundary ports', () => {
  const withPorts = (type, numPorts) => ({
    nodes: [{ ...node('b', type), data: { label: 'b', num_ports: numPorts } }, node('t', 'tank')],
    edges: [pipe('a', 'b', 't', 'port-0', 'port-0')],
  });

  it.each(['tank', 'pressure_boundary', 'flow_boundary'])('%s accepts 1 to 8 ports, rejects 0 and 9', (type) => {
    [undefined, 1, 4, 8].forEach(k => expect(codes(validateNetwork(withPorts(type, k)).errors), `${k}`).toEqual([]));
    [0, 9].forEach(k => expect(codes(validateNetwork(withPorts(type, k)).errors), `${k}`).toEqual(['invalid_num_ports']));
    expect(portsOf({ type, data: { num_ports: 3 } }).either).toEqual(['port-0', 'port-1', 'port-2']);
  });

  it('a junction still needs 3 to 8 ports', () => {
    expect(codes(validateNetwork(withPorts('junction', 2)).errors)).toEqual(['invalid_num_ports']);
    expect(codes(validateNetwork(withPorts('junction', 3)).errors)).toEqual([]);
  });

  const split = (flowSplit, pipes, numPorts = 3) => ({
    nodes: [{ ...node('b', 'flow_boundary'), data: { label: 'FB-1', num_ports: numPorts, flow_split: flowSplit } },
      node('t1', 'tank'), node('t2', 'tank'), node('t3', 'tank')],
    edges: [pipe('a', 'b', 't1', 'port-0', 'port-0'), pipe('b', 'b', 't2', 'port-1', 'port-0'), pipe('c', 'b', 't3', 'port-2', 'port-0')].slice(0, pipes),
  });

  it.each([
    ['total_split', 2, true],
    ['per_port', 1, false],
    ['total_split', 3, false],
    ['common_pressure', 2, false],
    [undefined, 2, false],
    ['per_port', 0, false],
  ])('flow_split %s with %s pipes on 3 ports: port-open error is %s', (flowSplit, pipes, raised) => {
    const r = validateNetwork(split(flowSplit, pipes));
    expect(r.errors.filter(f => f.code === 'flow_split_port_open')).toHaveLength(raised ? 1 : 0);
    if (raised) expect(r.errors.find(f => f.code === 'flow_split_port_open').message).toMatch(new RegExp(`Port ${pipes + 1} has no pipe`));
  });

  it('warns about a sensing line from an unpiped boundary port', () => {
    const d = split('common_pressure', 1);
    d.nodes.push(node('i', 'instrument'));
    d.edges.push({ id: 's', source: 'b', target: 'i', sourceHandle: 'signal-port-2', targetHandle: 'signal-in', data: { type: 'SIGNAL' } });
    expect(validateNetwork(d).warnings.filter(f => f.code === 'signal_port_unpiped')).toHaveLength(1);
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
    d.edges.push(pipe('e3', 't3', 'p1', 'port-0'));
    const r = validateNetwork(d);
    expect(codes(r.errors)).toEqual(['port_shared']);
    expect(r.errors[0].edgeIds.sort()).toEqual(['e1', 'e3']);
    expect(r.errors[0].message).toMatch(/use a junction/i);
  });

  it('reports a pipe on a port the component does not have', () => {
    const d = good();
    d.edges[0] = pipe('e1', 't1', 'p1', 'port-0', 'inlet-3');
    expect(codes(validateNetwork(d).errors)).toEqual(['invalid_port']);
  });

  it('reports a pipe to a deleted component', () => {
    const d = good();
    d.edges.push(pipe('e9', 'p1', 'gone'));
    expect(codes(validateNetwork(d).errors)).toContain('unknown_endpoint');
  });

  it('warns about an open outlet (orifice port left open)', () => {
    const d = {
      nodes: [node('t1', 'tank'), node('o1', 'orifice')],
      edges: [pipe('e1', 't1', 'o1', 'port-0', 'port-0')],
    };
    const r = validateNetwork(d);
    expect(r.errors).toEqual([]);
    expect(codes(r.warnings)).toEqual(['open_port']);
    expect(r.warnings[0].nodeIds).toEqual(['o1']);
  });

  it('does not warn about unused tank ports or a vented relief outlet', () => {
    const d = {
      nodes: [node('t1', 'tank'), node('r1', 'pressure_safety_valve')],
      edges: [pipe('e1', 't1', 'r1', 'port-0')],
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
      edges: [pipe('e1', 'p1', 'f1', 'outlet-0', 'port-0'), pipe('e2', 'f1', 'p1', 'port-1', 'inlet-0')],
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
        pipe('a', 't1', 'j', 'port-0', 'port-0'),   // into the junction
        pipe('b', 'j', 't2', 'port-1', 'port-0'),    // out of it
        pipe('c', 't3', 'j', 'port-0', 'port-2'),
      ],
    };
    const r = validateNetwork(d);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);   // Port 4 (port-3) is unused, which is normal for a junction
    d.nodes.push(node('t4', 'tank'));
    d.edges.push(pipe('x', 'j', 't4', 'port-4', 'port-0'));
    const bad = validateNetwork(d).errors;
    expect(codes(bad)).toEqual(['invalid_port']);
    expect(bad[0].message).toMatch(/Port 5/);   // 1-based, not "port-4"
    expect(bad[0].message).not.toMatch(/port-4/);
  });

  it('two pipes on one junction port are an error even when they run in opposite directions', () => {
    const d = {
      nodes: [node('t1', 'tank'), node('j', 'junction'), node('t2', 'tank')],
      edges: [pipe('a', 't1', 'j', 'port-0', 'port-0'), pipe('b', 'j', 't2', 'port-0', 'port-0')],
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
      edges: [pipe('a', 't1', 'j', 'port-0', 'port-0'), pipe('b', 'j', 't2', 'port-1', 'port-0'), sense(port)],
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
      edges: [pipe('a', 't1', 'j', 'port-0', 'port-0')],
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

  // A handle the helper forgets would silently cut a valid pipe out of a shipped drawing on load
  it.each(files)('%s loses no connection to a missing handle', (file) => {
    const data = JSON.parse(readFileSync(file, 'utf-8'));
    const r = dropEdgesToMissingHandles(data.nodes, data.edges);
    expect(r.dropped).toBe(0);
    expect(r.edges).toHaveLength(data.edges.length);
  });
});

describe('dropEdgesToMissingHandles', () => {
  const withData = (id, type, data) => ({ ...node(id, type), data });
  const edge = (id, source, target, sourceHandle, targetHandle) => ({ id, source, target, sourceHandle, targetHandle });

  it.each([
    ['pump outlet to valve inlet', [node('p', 'centrifugal_pump'), node('v', 'check_valve')], edge('e', 'p', 'v', 'outlet-0', 'inlet-0'), 0],
    ['junction port beyond num_ports', [withData('j', 'junction', { num_ports: 3 }), node('t', 'tank')], edge('e', 'j', 't', 'port-5', 'port-0'), 1],
    ['junction port within num_ports', [withData('j', 'junction', { num_ports: 6 }), node('t', 'tank')], edge('e', 'j', 't', 'port-5', 'port-0'), 0],
    ['dP instrument reference input', [node('t', 'tank'), withData('i', 'instrument', { variable: 'dP' })], edge('e', 't', 'i', 'port-0', 'signal-in-ref'), 0],
    ['reference input on a non-dP instrument', [node('t', 'tank'), withData('i', 'instrument', { variable: 'P' })], edge('e', 't', 'i', 'port-0', 'signal-in-ref'), 1],
    ['pilot PSV signal input', [node('i', 'tank'), withData('v', 'psv', { valve_type: 'pilot' })], edge('e', 'i', 'v', 'port-0', 'signal-in'), 0],
    ['signal input on a non-pilot PSV', [node('i', 'tank'), withData('v', 'psv', { valve_type: 'direct' })], edge('e', 'i', 'v', 'port-0', 'signal-in'), 1],
    ['sensing pin switched on', [withData('p', 'centrifugal_pump', { sensing: { 'outlet-0': true } }), node('i', 'instrument')], edge('e', 'p', 'i', 'signal-outlet-0', 'signal-in'), 0],
    ['sensing pin switched off', [withData('p', 'centrifugal_pump', { sensing: { 'outlet-0': false } }), node('i', 'instrument')], edge('e', 'p', 'i', 'signal-outlet-0', 'signal-in'), 1],
    ['null handle', [node('p', 'centrifugal_pump'), node('v', 'check_valve')], edge('e', 'p', 'v', null, undefined), 0],
    ['unknown node type', [node('x', 'future_widget'), node('v', 'check_valve')], edge('e', 'x', 'v', 'whatever', 'inlet-0'), 0],
    ['unknown type does not excuse a bad handle on the other end', [node('x', 'future_widget'), node('v', 'check_valve')], edge('e', 'x', 'v', 'whatever', 'inlet-9'), 1],
  ])('%s', (_name, nodes, e, dropped) => {
    const r = dropEdgesToMissingHandles(nodes, [e]);
    expect(r.dropped).toBe(dropped);
    expect(r.edges).toEqual(dropped ? [] : [e]);
  });

  it('keeps the good edges and counts only the dropped ones', () => {
    const nodes = [node('p', 'centrifugal_pump'), node('v', 'check_valve')];
    const good1 = edge('a', 'p', 'v', 'outlet-0', 'inlet-0');
    const r = dropEdgesToMissingHandles(nodes, [good1, edge('b', 'p', 'v', 'outlet-3', 'inlet-0'), edge('c', 'p', 'v', 'outlet-0', 'inlet-7')]);
    expect(r).toEqual({ edges: [good1], dropped: 2 });
  });
});
