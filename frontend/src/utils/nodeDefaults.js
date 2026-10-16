import { HEAT_EXCHANGER_DEFAULTS } from './equipmentDefaults';

const PUMP_DEFAULTS = { flow_rated_lmin: 100.0, head_rated_m: 50.0, rise_to_shutoff_pct: 20.0, efficiency: 75.0, active: true };

// Inputs of a component dropped on the canvas, by type. Units as in the file (see docs/node-fields.md).
const DEFAULTS_BY_TYPE = {
  centrifugal_pump: PUMP_DEFAULTS,
  pump: PUMP_DEFAULTS,
  volumetric_pump: { flow_rated: 100.0, motor_power: 5.0, efficiency: 85.0, drive_type: 'fixed_speed', max_discharge_pressure_bara: 50.0, active: true },
  linear_control_valve: { max_cv: 0.05, opening: 50.0 },
  linear_regulator: { max_cv: 0.05, set_pressure: 500000.0, backpressure: false },
  orifice: { pipe_diameter: 0.05248, orifice_diameter: 0.02, standard: 'iso_5167', standardDn: 50, standardSch: '40' },
  calibrated_restriction: { flow_base_lmin: 10.0, inlet_pressure_base_bar: 3.5, outlet_pressure_base_bar: 1.0, temp_base_c: 45.0, restriction_model: 'orifice', fluid_type: 'system' },
  reducer: {
    standard: 'ASME_B16_9', reducer_type: 'concentric', dn_large: 80, nps_large: '3', dn_small: 50, nps_small: '2',
    sch_large: 'STD', sch_small: 'STD', length: 0.089, length_mm: 89.0, cone_angle_deg: 18.2,
    diameter_in: 0.07792, diameter_out: 0.05248, orientation: 'reducing',
  },
  pressure_source: { source_pressure_bara: 6.0, temperature: 293.15 },
  flow_source: { source_flow_lmin: 50.0, temperature: 293.15, max_discharge_pressure_bara: 50.0 },
  filter: { dp_clean: 0.2, dp_terminal: 1.0, flow_ref: 100.0, clogging: 0.0 },
  heat_exchanger: HEAT_EXCHANGER_DEFAULTS,
  remote_control_valve: { max_cv: 0.05, set_pressure: 500000.0 },
  three_way_tcv: { max_cv: 0.1, set_temperature_c: 40.0, hot_port_idx: 0 },
  check_valve: { cv: 10.0, cracking_pressure_bar: 0.05 },
  pressure_safety_valve: { set_pressure_barg: 20.0, cv: 10.0, action_mode: 'pop_action', blowdown_pct: 7.0, forced_state: 'auto' },
  psv: { set_pressure_barg: 20.0, cv: 10.0, action_mode: 'pop_action', blowdown_pct: 7.0, forced_state: 'auto' },
  rupture_disc: { burst_pressure_barg: 25.0, bore_type: 'full_bore', cv: 10.0, forced_state: 'auto' },
  check_valve_orifice: { cv: 10.0, cracking_pressure_bar: 0.05, pipe_diameter: 0.05248, orifice_diameter: 0.01, standardDn: 50, standardSch: '40' },
  instrument: { variable: 'P', pressure_basis: 'gauge', alarm_ll: null, alarm_l: null, alarm_h: null, alarm_hh: null },
  text_bubble: { label: 'Note', title: 'NOTE', text: 'Double-click to edit note...', fontSize: 'md' },
};

/**
 * Data of a new component of `type`.
 * @param {string} type
 * @param {{label: string, ambientTemperature: number, onRotate: Function, onChange: Function}} ctx
 */
export function defaultNodeData(type, { label, ambientTemperature, onRotate, onChange }) {
  return {
    label,
    rotation: 0,
    onRotate,
    onChange: type === 'linear_control_valve' ? onChange : undefined,
    // a new tank starts at the drawing's ambient temperature
    ...(type === 'tank' && { level: 2.0, elevation: 0.0, temperature: ambientTemperature }),
    ...DEFAULTS_BY_TYPE[type],
  };
}
