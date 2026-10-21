import { describe, it, expect } from 'vitest';
import { defaultNodeData } from './nodeDefaults';

const ctx = { label: 'X', ambientTemperature: 300, onRotate: () => {}, onChange: () => {} };

describe('defaultNodeData', () => {
  it('gives every new component its label, rotation and handlers', () => {
    const d = defaultNodeData('filter', ctx);
    expect(d).toMatchObject({ label: 'X', rotation: 0, dp_clean_bar: 0.2, dp_terminal_bar: 1.0 });
    expect(d.onRotate).toBe(ctx.onRotate);
    expect(d.onChange).toBeUndefined();               // only control valves get the slider handler
    expect(defaultNodeData('linear_control_valve', ctx).onChange).toBe(ctx.onChange);
  });

  it('starts a tank at the ambient temperature of the drawing', () => {
    expect(defaultNodeData('tank', ctx)).toMatchObject({ level_m: 2.0, elevation_m: 0.0, temperature_k: 300 });
  });

  it('keeps the note text and the pump defaults the parser needs', () => {
    expect(defaultNodeData('text_bubble', ctx)).toMatchObject({ label: 'Note', title: 'NOTE', fontSize: 'md' });
    expect(defaultNodeData('centrifugal_pump', ctx)).toMatchObject({ flow_rated_lmin: 100, head_rated_m: 50, efficiency_pct: 75, active: true });
    expect(defaultNodeData('psv', ctx).set_pressure_barg).toBe(20);
    expect(defaultNodeData('pressure_safety_valve', ctx)).toMatchObject({ valve_type: 'conventional', design_superimposed_bp_barg: 0, action_mode: 'pop_action' });
  });

  it('only sets fields the backend reads (Data Fields tables in backend/simulation/equipment/*.md)', () => {
    expect(defaultNodeData('splitter', ctx)).toEqual({ label: 'X', rotation: 0, onRotate: ctx.onRotate, onChange: undefined });
  });
});
