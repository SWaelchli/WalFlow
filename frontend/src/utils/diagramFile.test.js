import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkFormatVersion, validateDiagramStructure, checkDiagramFile, stripResults, serializeDiagram, toSolverGraph, sanitizeDiagramElements,
} from './diagramFile';
import { HEAT_EXCHANGER_DEFAULTS } from './nodeDefaults';

const node = (id, extra = {}) => ({ id, type: 'tank', position: { x: 0, y: 0 }, data: { label: id }, ...extra });
const good = () => ({ version: '0.2', nodes: [node('a'), node('b')], edges: [{ id: 'e', source: 'a', target: 'b', data: {} }] });
const TYPES = new Set(['tank', 'centrifugal_pump']);

describe('one version check for every load path', () => {
  it('accepts the current format only', () => {
    expect(checkFormatVersion({ version: '0.2' })).toBeNull();
    expect(checkFormatVersion({ version: '0.1' })).toMatch(/format 0\.1.*needs format 0\.2/);
    expect(checkFormatVersion({ nodes: [] })).toMatch(/unknown/);
  });
});

describe('structural validation', () => {
  it('accepts a sound diagram', () => {
    expect(validateDiagramStructure(good(), TYPES)).toEqual([]);
  });

  it('names each problem', () => {
    const d = good();
    d.nodes[0].position = undefined;
    d.nodes[1].type = 'warp_drive';
    d.edges[0].target = 'zzz';
    const text = validateDiagramStructure(d, TYPES).join('|');
    expect(text).toMatch(/no valid position/);
    expect(text).toMatch(/unknown type "warp_drive"/);
    expect(text).toMatch(/unknown component "zzz"/);
  });

  it('rejects non-list nodes and non-objects', () => {
    expect(validateDiagramStructure({ nodes: 'x', edges: [] })).toHaveLength(1);
    expect(validateDiagramStructure(null)).toHaveLength(1);
    expect(validateDiagramStructure([])).toHaveLength(1);
  });

  it('checkDiagramFile reports version first, then structure', () => {
    expect(checkDiagramFile({ ...good(), version: '0.1' }).message).toMatch(/format 0\.1/);
    const bad = good();
    bad.nodes[0].id = '';
    expect(checkDiagramFile(bad, TYPES)).toEqual({ ok: false, message: expect.stringMatching(/cannot be loaded/) });
    expect(checkDiagramFile(good(), TYPES)).toEqual({ ok: true });
  });
});

describe('results are not stored in files or solver messages', () => {
  const withResults = () => ({
    nodes: [node('a', { data: { label: 'a', telemetry: { x: 1 }, onRotate: () => {}, opening: 50 } })],
    edges: [{ id: 'e', source: 'a', target: 'a', data: { telemetry: { y: 2 }, length: 5 } }],
    globalSettings: { fluid_type: 'water' },
    cases: [{ id: 'case_base', is_base: true, telemetry: { n: 1 }, telemetry_unmitigated: {}, telemetry_peak: {}, kpis: {}, result_hash: 'x', _scalingInfo: {}, overrides: { nodes: { a: { opening: 10 } } } }],
    activeCaseId: 'case_base',
  });

  it('stripResults removes telemetry and case results but keeps inputs', () => {
    const out = stripResults(withResults());
    expect(out.nodes[0].data).toEqual({ label: 'a', opening: 50 });
    expect(out.edges[0].data).toEqual({ length: 5 });
    expect(out.cases[0]).toEqual({ id: 'case_base', is_base: true, overrides: { nodes: { a: { opening: 10 } } } });
  });

  it('serializeDiagram and toSolverGraph carry no results', () => {
    const file = JSON.stringify(serializeDiagram(withResults()));
    expect(file).not.toMatch(/telemetry|kpis|result_hash|_scalingInfo/);
    expect(JSON.parse(file).version).toBe('0.2');
    expect(JSON.stringify(toSolverGraph(withResults()))).not.toMatch(/telemetry|kpis|result_hash/);
  });
});

describe('drop defaults of a heat exchanger', () => {
  it('include the rated pressure drop the inspector shows', () => {
    expect(HEAT_EXCHANGER_DEFAULTS.rated_dp_bar).toBe(0.5);
    expect(HEAT_EXCHANGER_DEFAULTS.rated_flow_lmin).toBe(500);
  });
});

describe('shipped diagrams', () => {
  const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
  const files = [
    ...readdirSync(join(dataDir, 'examples')).filter(f => f.endsWith('.wlf')).map(f => join(dataDir, 'examples', f)),
    join(dataDir, 'GreetingCanvas.wlf'),
  ];

  it('finds the examples', () => {
    expect(files.length).toBeGreaterThanOrEqual(11);
  });

  it.each(files)('%s is current format, valid, stores no results and round-trips through export', (file) => {
    const text = readFileSync(file, 'utf-8');
    const data = JSON.parse(text);
    expect(checkDiagramFile(data)).toEqual({ ok: true });
    const exported = JSON.parse(JSON.stringify(serializeDiagram({
      nodes: data.nodes, edges: data.edges, cases: data.cases, activeCaseId: data.active_case_id, globalSettings: data.globalSettings,
    })));
    expect(checkDiagramFile(exported)).toEqual({ ok: true });
    const ignore = ({ created_at, app_version, ...rest }) => rest; // eslint-disable-line no-unused-vars
    expect(ignore(exported)).toEqual(ignore({ ...data, ...stripResults(data) }));
    expect(text).not.toMatch(/"telemetry"|"kpis"|"_scalingInfo"|"result_hash"/);
    data.nodes.filter(n => n.type === 'heat_exchanger').forEach(n => expect(n.data.rated_dp_bar).toBeGreaterThan(0));
  });
});

describe('imported nodes and edges keep only what the canvas needs', () => {
  const n = (extra) => ({ id: 'a', type: 'tank', position: { x: 1, y: 2 }, data: { label: 'A' }, ...extra });
  const e = (extra) => ({ id: 'e', source: 'a', target: 'b', data: { length_m: 5 }, ...extra });
  const cleanNode = (extra) => sanitizeDiagramElements({ nodes: [n(extra)], edges: [] }).nodes[0];
  const cleanEdge = (extra) => sanitizeDiagramElements({ nodes: [], edges: [e(extra)] }).edges[0];

  it.each([
    ['unlisted node keys', () => cleanNode({ className: 'x', hidden: true, parentNode: 'p', zIndex: 9, ariaLabel: 'l', domAttributes: { onclick: 'x' } }), n()],
    ['unlisted edge keys', () => cleanEdge({ className: 'x', hidden: true, markerEnd: 'url(#m)', zIndex: 9 }), e()],
    ['an own __proto__ key', () => cleanNode(JSON.parse('{"__proto__": {"polluted": 1}}')), n()],
    ['a valid node geometry', () => cleanNode({ width: 40, height: 50, dragging: false, positionAbsolute: { x: 3, y: 4 } }),
      n({ width: 40, height: 50, dragging: false, positionAbsolute: { x: 3, y: 4 } })],
    ['wrongly typed node geometry', () => cleanNode({ width: '40', height: NaN, dragging: 'yes', positionAbsolute: { x: 1, y: Infinity } }), n()],
    ['a valid edge label and flag', () => cleanEdge({ label: 'L', animated: true }), e({ label: 'L', animated: true })],
    ['wrongly typed edge label and flag', () => cleanEdge({ label: { a: 1 }, animated: 'true' }), e()],
    ['node style width and height only', () => cleanNode({ style: { width: 120, height: '80px', position: 'fixed', backgroundImage: 'url(https://x)' } }),
      n({ style: { width: 120, height: '80px' } })],
    ['node style numbers as strings', () => cleanNode({ style: { width: '120', height: Infinity } }), n({ style: { width: '120' } })],
    ['node style with a bad size', () => cleanNode({ style: { width: 'calc(1px + 2px)', height: 'url(x)' } }), n({ style: {} })],
    ['edge style that is safe', () => cleanEdge({ style: { stroke: '#3b82f6', strokeWidth: 3, strokeDasharray: '5, 5.5' } }),
      e({ style: { stroke: '#3b82f6', strokeWidth: 3, strokeDasharray: '5, 5.5' } })],
    ['edge colours as short hex, alpha hex and variable', () => [
      cleanEdge({ style: { stroke: '#fff' } }).style.stroke, cleanEdge({ style: { stroke: '#11223344' } }).style.stroke,
      cleanEdge({ style: { stroke: 'var(--color-primary)' } }).style.stroke], ['#fff', '#11223344', 'var(--color-primary)']],
    ['edge style keys dropped one by one', () => cleanEdge({ style: { stroke: 'url(https://x)', strokeWidth: '2', strokeDasharray: '4;x', position: 'fixed', backgroundImage: 'url(https://x)' } }),
      e({ style: { strokeWidth: '2' } })],
    ['edge stroke that is not a colour', () => cleanEdge({ style: { stroke: 'red', strokeWidth: 'thick' } }), e({ style: {} })],
  ])('%s', (_name, run, expected) => {
    expect(run()).toEqual(expected);
  });

  it('does not touch the input, passes data through and never pollutes Object', () => {
    const input = { nodes: [n({ className: 'x', style: { width: 5, position: 'fixed' } })], edges: [e({ className: 'x' })] };
    const before = JSON.stringify(input);
    const out = sanitizeDiagramElements(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(out.nodes[0].data).toEqual(input.nodes[0].data);
    expect({}.polluted).toBeUndefined();
  });

  const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'examples');
  const examples = readdirSync(dataDir).filter(f => f.endsWith('.wlf'));
  it.each(examples)('%s loses nothing', (file) => {
    const { nodes, edges } = JSON.parse(readFileSync(join(dataDir, file), 'utf-8'));
    expect(sanitizeDiagramElements({ nodes, edges })).toEqual({ nodes, edges });
  });
});
