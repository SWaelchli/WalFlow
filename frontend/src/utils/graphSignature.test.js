import { describe, it, expect } from 'vitest';
import { solverMessageKey, persistKey } from './graphSignature';

const node = (id, extra = {}) => ({ id, type: 'tank', position: { x: 0, y: 0 }, data: { level: 2, label: id }, ...extra });
const graph = (nodes, overrides = {}) => ({
  nodes, edges: [{ id: 'e1', source: 'a', target: 'b', data: { length: 10 } }],
  globalSettings: { fluid_type: 'water' }, cases: [{ id: 'c1', is_base: true, variable_properties: {} }], activeCaseId: 'c1', ...overrides,
});

describe('solverMessageKey', () => {
  it('ignores drag, selection and results', () => {
    const base = graph([node('a'), node('b')]);
    const moved = graph([node('a', { position: { x: 50, y: 20 }, selected: true, dragging: true }), node('b')]);
    const withResults = graph([node('a', { data: { level: 2, label: 'a', telemetry: { x: 1 } } }), node('b')]);
    expect(solverMessageKey(moved)).toBe(solverMessageKey(base));
    expect(solverMessageKey(withResults)).toBe(solverMessageKey(base));
  });

  it('changes when an input, a label, a setting or the active case changes', () => {
    const base = solverMessageKey(graph([node('a'), node('b')]));
    expect(solverMessageKey(graph([node('a', { data: { level: 3, label: 'a' } }), node('b')]))).not.toBe(base);
    expect(solverMessageKey(graph([node('a', { data: { level: 2, label: 'renamed' } }), node('b')]))).not.toBe(base);
    expect(solverMessageKey(graph([node('a'), node('b')], { globalSettings: { fluid_type: 'seawater' } }))).not.toBe(base);
    expect(solverMessageKey(graph([node('a'), node('b')], { activeCaseId: 'c2' }))).not.toBe(base);
  });

  it('does not change when only the results of a case change', () => {
    const base = solverMessageKey(graph([node('a'), node('b')]));
    const cases = [{ id: 'c1', is_base: true, variable_properties: {}, telemetry: { big: 1 }, result_hash: 'x' }];
    expect(solverMessageKey(graph([node('a'), node('b')], { cases }))).toBe(base);
  });
});

describe('persistKey', () => {
  it('ignores selection and results but not the layout', () => {
    const base = persistKey(graph([node('a'), node('b')]));
    expect(persistKey(graph([node('a', { selected: true }), node('b')]))).toBe(base);
    expect(persistKey(graph([node('a', { position: { x: 5, y: 0 } }), node('b')]))).not.toBe(base);
  });
});
