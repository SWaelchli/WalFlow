// Defaults written to a component when it is dropped on the canvas. They must match what the inspector
// shows and what the backend uses when a field is missing.

export const HEAT_EXCHANGER_DEFAULTS = {
  active: true,
  cooler_type: 'water_cooled',
  rating_method: 'rated_duty',
  rated_cooling_kw: 300.0,
  rated_flow_lmin: 500.0,
  design_inlet_temp_c: 50.0,
  design_outlet_temp_c: 40.0,
  medium_temp_c: 10.0,
  ua_direct_w_k: 1000.0,
  rated_dp_bar: 0.5,
};
