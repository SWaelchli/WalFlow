// Settings exist on three levels.
//   Drawing  (.wlf)             title, fluid, ambient, atmospheric pressure, solver settings (+ "use drawing solver settings")
//   Project  (database)         pipe classes, custom pipes, solver settings (+ "use project solver settings")
//   Global   (database / local) unit preference, solver settings (always active)
// Solver precedence: Drawing (if ticked) > Project (if ticked) > Global. A ticked level replaces the whole group.

export const SOLVER_KEYS = [
  'solver_method', 'warm_start', 'control_iterations',
  'property_iterations', 'tolerance', 'inner_iterations',
];

export const BUILTIN_SOLVER_SETTINGS = {
  solver_method: 'sparse_newton',
  warm_start: true,
  control_iterations: 100,
  property_iterations: 5,
  tolerance: 1e-6,
  inner_iterations: 1000,
};

/** Settings of a new drawing: always the built-in defaults, solver group not overriding. */
export const DEFAULT_DRAWING_SETTINGS = {
  fluid_type: 'water',
  ambient_temperature: 293.15,
  atmospheric_pressure: 101325.0,
  ...BUILTIN_SOLVER_SETTINGS,
  use_drawing_solver: false,
};

export const SOURCE_LABELS = { drawing: 'Drawing', project: 'Project', global: 'Global' };

const pickSolver = (obj) => {
  const out = {};
  SOLVER_KEYS.forEach((k) => { if (obj && obj[k] !== undefined) out[k] = obj[k]; });
  return out;
};

/**
 * Which level supplies the solver settings, and their values.
 * @param drawing  the drawing's globalSettings (solver keys plus use_drawing_solver)
 * @param project  the active project's settings ({ use_project_solver, solver }) or null
 * @param user     the user's global settings ({ solver }) or null
 * @returns {{ source: 'drawing'|'project'|'global', values: object }}
 */
export const resolveSolverSettings = ({ drawing, project, user } = {}) => {
  // a ticked level replaces the whole group: keys it lacks fall back to the built-in values, not to a lower level
  if (drawing?.use_drawing_solver === true) {
    return { source: 'drawing', values: { ...BUILTIN_SOLVER_SETTINGS, ...pickSolver(drawing) } };
  }
  if (project?.use_project_solver === true) {
    return { source: 'project', values: { ...BUILTIN_SOLVER_SETTINGS, ...pickSolver(project.solver) } };
  }
  return { source: 'global', values: { ...BUILTIN_SOLVER_SETTINGS, ...pickSolver(user?.solver) } };
};

/** The drawing's globalSettings with the effective solver values filled in (what solver and result hash see). */
export const withEffectiveSolver = (globalSettings, { project, user } = {}) => {
  const { values } = resolveSolverSettings({ drawing: globalSettings, project, user });
  const { use_drawing_solver: _flag, ...rest } = globalSettings || {};
  return { ...rest, ...values };
};

/** Files made before the settings levels carry solver values but no flag: their values stay in force. */
export const migrateDrawingSettings = (settings) => {
  if (!settings || typeof settings !== 'object') return settings;
  const next = { ...settings };
  if (next.use_drawing_solver === undefined) next.use_drawing_solver = true;
  delete next.unit_system; // display preference now lives with the user
  delete next.global_roughness; // removed in 0.2.x: pipes take their roughness from the pipe class or their own value
  return next;
};
