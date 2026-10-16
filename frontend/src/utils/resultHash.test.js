import { describe, it, expect } from 'vitest';
import { computeCaseInputHash, computeCaseInputHashes, isCaseResultStale } from './resultHash';

const base = () => ({
  nodes: [
    { id: 'p', type: 'valve', position: { x: 0, y: 0 }, data: { label: 'V1', opening: 50, rotation: 0 } },
    { id: 'n', type: 'text_bubble', position: { x: 5, y: 5 }, data: { text: 'note' } },
  ],
  edges: [{ id: 'e', source: 'p', target: 'p', data: { diameter: 0.05, length: 10, label: 'Pipe 1' } }],
  globalSettings: { fluid_type: 'water', unit_system: 'metric', tolerance: 1e-6 },
  cases: [
    { id: 'case_base', is_base: true, overrides: { nodes: {} } },
    { id: 'c2', is_base: false, overrides: { nodes: { p: { opening: 20 } } } },
  ],
});

describe('F2-07: input hash of a case', () => {
  it('is stable and ignores appearance, notes, display units and runtime fields', () => {
    const h = computeCaseInputHash(base(), 'case_base');
    const g = base();
    g.nodes[0].position = { x: 99, y: 99 };
    g.nodes[0].data.label = 'Renamed';
    g.nodes[0].data.rotation = 90;
    g.nodes[0].data.telemetry = { a: 1 };
    g.nodes[1].data.text = 'other note';
    g.edges[0].data.label = 'Pipe 2';
    g.globalSettings.unit_system = 'imperial';
    expect(computeCaseInputHash(g, 'case_base')).toBe(h);
  });

  it('ignores instrument bubbles, their limits and the signal lines into them', () => {
    const h = computeCaseInputHash(base(), 'case_base');
    const g = base();
    g.nodes.push({ id: 'i', type: 'instrument', position: { x: 0, y: 0 }, data: { variable: 'P', alarm_h: 5 } });
    g.edges.push({ id: 's', source: 'p', target: 'i', sourceHandle: 'signal-inlet-0', targetHandle: 'signal-in', data: { type: 'SIGNAL' } });
    expect(computeCaseInputHash(g, 'case_base')).toBe(h);
    g.nodes[2].data.alarm_h = 6;
    expect(computeCaseInputHash(g, 'case_base')).toBe(h);
  });

  it('changes with any solver input', () => {
    const h = computeCaseInputHash(base(), 'case_base');
    const edits = [
      (g) => { g.nodes[0].data.opening = 51; },
      (g) => { g.edges[0].data.diameter = 0.06; },
      (g) => { g.globalSettings.fluid_type = 'oil'; },
      (g) => { g.edges.pop(); },
      (g) => { g.nodes.push({ id: 'x', type: 'valve', position: { x: 0, y: 0 }, data: {} }); },
    ];
    edits.forEach((edit) => {
      const g = base();
      edit(g);
      expect(computeCaseInputHash(g, 'case_base')).not.toBe(h);
    });
  });

  it('depends on the overrides of that case only', () => {
    const hashes = computeCaseInputHashes(base());
    const g = base();
    g.cases[1].overrides.nodes.p.opening = 30;
    const after = computeCaseInputHashes(g);
    expect(after.case_base).toBe(hashes.case_base);
    expect(after.c2).not.toBe(hashes.c2);
  });

  it('marks results stale only when the hash differs', () => {
    const hashes = computeCaseInputHashes(base());
    const solved = { id: 'case_base', telemetry: { nodes: {} }, result_hash: hashes.case_base };
    expect(isCaseResultStale(solved, hashes)).toBe(false);
    expect(isCaseResultStale({ ...solved, result_hash: 'old' }, hashes)).toBe(true);
    expect(isCaseResultStale({ id: 'case_base' }, hashes)).toBe(false);
    expect(isCaseResultStale({ id: 'case_base', telemetry: {} }, hashes)).toBe(true); // results without a hash
  });
});
