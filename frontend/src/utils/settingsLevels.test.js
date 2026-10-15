import { describe, it, expect } from 'vitest';
import {
  resolveSolverSettings, withEffectiveSolver, migrateDrawingSettings, BUILTIN_SOLVER_SETTINGS,
} from './settingsLevels';
import { computeCaseInputHash } from './resultHash';

const user = { solver: { tolerance: 1e-8, solver_method: 'lm' } };
const project = { use_project_solver: true, solver: { tolerance: 1e-4, damping_factor: 0.5 } };
const drawing = { use_drawing_solver: true, tolerance: 1e-5, damping_factor: 0.9, fluid_type: 'water' };

describe('F3-12 solver precedence: Drawing > Project > Global', () => {
  // every combination of the two checkboxes, with and without a project open
  const cases = [
    { d: false, p: false, hasProject: true, source: 'global', tol: 1e-8 },
    { d: false, p: true, hasProject: true, source: 'project', tol: 1e-4 },
    { d: true, p: false, hasProject: true, source: 'drawing', tol: 1e-5 },
    { d: true, p: true, hasProject: true, source: 'drawing', tol: 1e-5 },
    { d: false, p: true, hasProject: false, source: 'global', tol: 1e-8 },
    { d: true, p: true, hasProject: false, source: 'drawing', tol: 1e-5 },
  ];
  cases.forEach(({ d, p, hasProject, source, tol }) => {
    it(`drawing ${d ? 'on' : 'off'}, project ${p ? 'on' : 'off'}, project ${hasProject ? 'open' : 'closed'} -> ${source}`, () => {
      const r = resolveSolverSettings({
        drawing: { ...drawing, use_drawing_solver: d },
        project: hasProject ? { ...project, use_project_solver: p } : null,
        user,
      });
      expect(r.source).toBe(source);
      expect(r.values.tolerance).toBe(tol);
    });
  });

  it('a ticked level replaces the whole group, not single fields', () => {
    const r = resolveSolverSettings({ drawing: { use_drawing_solver: false }, project, user });
    expect(r.values.damping_factor).toBe(0.5);
    // global's solver_method ('lm') is not mixed in while the project group is in force
    expect(r.values.solver_method).toBe('sparse_newton');
  });

  it('falls back to the built-in defaults without any stored settings', () => {
    const r = resolveSolverSettings({ drawing: { use_drawing_solver: false } });
    expect(r.source).toBe('global');
    expect(r.values).toEqual(BUILTIN_SOLVER_SETTINGS);
  });

  it('withEffectiveSolver keeps drawing-only fields and drops the flag', () => {
    const out = withEffectiveSolver({ ...drawing, use_drawing_solver: false }, { project, user });
    expect(out.fluid_type).toBe('water');
    expect(out.tolerance).toBe(1e-4);
    expect('use_drawing_solver' in out).toBe(false);
  });
});

describe('F3-12 result hash follows the effective solver settings', () => {
  const graph = (gs, extra) => ({ nodes: [], edges: [], cases: [{ id: 'c', is_base: true }], globalSettings: withEffectiveSolver(gs, extra) });
  const base = { ...drawing, use_drawing_solver: false };

  it('changes when a level that is in force changes', () => {
    const a = computeCaseInputHash(graph(base, { project, user }), 'c');
    const b = computeCaseInputHash(graph(base, { project: { ...project, solver: { tolerance: 1e-3 } }, user }), 'c');
    expect(a).not.toBe(b);
  });

  it('does not change when an overridden level changes', () => {
    const a = computeCaseInputHash(graph(drawing, { project, user }), 'c');
    const b = computeCaseInputHash(graph(drawing, { project: { ...project, solver: { tolerance: 1e-3 } }, user: { solver: { tolerance: 1e-3 } } }), 'c');
    expect(a).toBe(b);
  });

  it('changes when the checkbox switches to different effective values', () => {
    const a = computeCaseInputHash(graph(base, { project, user }), 'c');
    const b = computeCaseInputHash(graph({ ...drawing, use_drawing_solver: true }, { project, user }), 'c');
    expect(a).not.toBe(b);
  });
});

describe('F3-12 migration of existing files', () => {
  it('a file without the flag keeps its solver values as a ticked drawing override', () => {
    const m = migrateDrawingSettings({ tolerance: 1e-7, unit_system: 'imperial' });
    expect(m.use_drawing_solver).toBe(true);
    expect(m.unit_system).toBeUndefined();
    expect(resolveSolverSettings({ drawing: m, user }).values.tolerance).toBe(1e-7);
  });
  it('an explicit flag is kept', () => {
    expect(migrateDrawingSettings({ use_drawing_solver: false }).use_drawing_solver).toBe(false);
  });
});
