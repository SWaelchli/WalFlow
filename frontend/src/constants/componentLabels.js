// Display names for component types, shared by the library, inspector and data grid so one
// component is called the same thing everywhere. Sentence case, as in the rest of the UI.
export const COMPONENT_LABELS = {
  tank: 'Tank',
  pressure_boundary: 'Pressure boundary',
  flow_boundary: 'Flow boundary',
  centrifugal_pump: 'Centrifugal pump',
  pump: 'Centrifugal pump',
  volumetric_pump: 'Volumetric pump',
  linear_control_valve: 'Control valve',
  check_valve: 'Check valve',
  check_valve_orifice: 'Check valve with orifice',
  pressure_safety_valve: 'Safety relief valve',
  rupture_disc: 'Rupture disc',
  remote_control_valve: 'Remote valve',
  linear_regulator: 'Pressure regulator',
  three_way_tcv: '3-way temperature valve',
  reducer: 'Reducer / expander',
  orifice: 'Orifice',
  calibrated_restriction: 'Calibrated restriction',
  junction: 'Junction',
  measure_point: 'Measurement tap',
  instrument: 'Instrument',
  filter: 'Filter',
  heat_exchanger: 'Cooler',
  text_bubble: 'Note',
};

/** Display name for a node type, or for an edge when `type` is an edge type (pipe, signal) or empty. */
export function componentLabel(type, { isEdge = false } = {}) {
  if (isEdge || !type) return type === 'signal' ? 'Signal line' : 'Pipe';
  if (type === 'signal') return 'Signal line';
  if (type === 'pipe' || type === 'default') return 'Pipe';
  if (COMPONENT_LABELS[type]) return COMPONENT_LABELS[type];
  const words = type.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
