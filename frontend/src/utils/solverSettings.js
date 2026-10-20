// F2-17: allowed ranges of the numeric solver settings. A value outside the range, or an empty field, is
// not stored (the input shows the previous value again), so the backend never receives null or NaN.
export const SOLVER_SETTING_RANGES = {
  control_iterations: { min: 1, max: 1000, integer: true },
  property_iterations: { min: 1, max: 100, integer: true },
  tolerance: { min: 1e-9, max: 1e-2, integer: false },
  inner_iterations: { min: 1, max: 10000, integer: true },
};

/** Returns { ok: true, value } for an acceptable entry, otherwise { ok: false }. */
export const parseSolverSetting = (key, text) => {
  const range = SOLVER_SETTING_RANGES[key];
  if (!range || text === '' || text == null) return { ok: false };
  const value = Number(text);
  if (!Number.isFinite(value)) return { ok: false };
  if (value < range.min || value > range.max) return { ok: false };
  if (range.integer && !Number.isInteger(value)) return { ok: false };
  return { ok: true, value };
};
