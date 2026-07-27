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
  'opening',           // Linear / Remote Control Valve opening percentage (%)
  'clogging',          // Filter clogging / dirt factor (%)
  'level',             // Tank fluid level (m)
  'temperature',       // Tank fluid temperature (K or °C)
  'speed_rpm',         // VFD Pump speed (RPM)
  'set_pressure',      // Linear / Remote regulator set pressure (Pa)
  'set_temperature_c', // Three-way TCV set temperature (°C)
  'flow_demand',       // External flow demand
  'forced_state',      // Contingency Test Mode (auto / forced_closed per case)
]);

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
