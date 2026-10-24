/**
 * Property Classification Matrix
 * Identifies which component properties are GLOBAL hardware specifications (fixed across all cases)
 * vs CASE_VARIABLE operating parameters (overridable per operating case scenario).
 */

export const PROPERTY_TYPES = {
  GLOBAL: 'global',
  CASE_VARIABLE: 'case_variable',
};

// Set of property field keys that represent dynamic operating conditions
export const CASE_VARIABLE_FIELDS = new Set([
  'active',            // Component active/inactive state (boolean)
  'opening_pct',       // Linear / Remote Control Valve opening percentage (%)
  'clogging_pct',      // Filter clogging / dirt factor (%)
  'level_m',           // Tank fluid level (m)
  'temperature_k',     // Tank / source fluid temperature (K)
  'set_pressure_pa',   // Linear / Remote regulator set pressure (Pa)
  'set_temperature_c', // Three-way TCV set temperature (°C)
  'forced_state',      // Contingency Test Mode (auto / forced_closed / forced_open per case)
  'source_pressure_bara', // FluidSource: set pressure (bara), case-overridable per scenario
  'source_flow_lmin',     // FluidSource: set flow rate (L/min), case-overridable per scenario
  'relief_ramp_enabled',  // Pump / source: ramped by the relief analysis
]);

// Equipment the relief analysis can ramp to find each relief device's opening (backend: is_relief_driver)
export const RELIEF_DRIVER_TYPES = ['centrifugal_pump', 'pump', 'volumetric_pump', 'pressure_source', 'flow_source'];

/**
 * Checks if a node data property is a case-specific operating variable.
 */
export const isCaseVariableProperty = (propKey) => {
  return CASE_VARIABLE_FIELDS.has(propKey);
};

export const DEFAULT_BASE_CASE = {
  id: 'case_base',
  name: 'Case 1',
  is_base: true,
  overrides: {
    nodes: {},
    global_settings: {}
  }
};
