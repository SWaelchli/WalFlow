import React from 'react';
import DraftNumberInput from '../common/DraftNumberInput';
import { parseSolverSetting } from '../../utils/solverSettings';
import { SOURCE_LABELS } from '../../utils/settingsLevels';

const labelStyle = { display: 'block', fontSize: 'var(--fs-xs)', fontWeight: '600', color: 'var(--color-text-secondary)', marginBottom: '6px' };
const hintStyle = { fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', marginTop: '4px' };
const inputStyle = { width: '100%' };

/**
 * The solver settings group, shared by the Drawing, Project and Global tabs.
 *
 * - `values`: the values to show.
 * - `onChange(patch)`: called with { key: value } for an accepted edit.
 * - `toggle`: optional { checked, onChange, label, disabled, disabledHint } — the "use <level> solver settings" box.
 *   While it is unticked the fields are greyed out and show the values in force, with `inheritedFrom` as their source.
 * - `overriddenBy`: when a higher level is in force, a note says so.
 * - `inForce`: optional; shows an "In force" / "Not in force" badge so it is clear which level the solver uses.
 */
export default function SolverSettingsGroup({ values, onChange, toggle, inheritedFrom, overriddenBy, readOnly = false, inForce }) {
  const active = toggle ? toggle.checked : true;
  const disabled = readOnly || !active;

  const commit = (key, text) => {
    const parsed = parseSolverSetting(key, text);
    if (parsed.ok) onChange({ [key]: parsed.value });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <h4 style={{ fontSize: 'var(--fs-xs)', fontWeight: '700', textTransform: 'uppercase', color: 'var(--color-text-secondary)', margin: 0, letterSpacing: '0.05em' }}>
          Numerical solver
        </h4>
        {inForce !== undefined && (
          <span
            title={inForce ? 'The solver uses these settings for the open drawing' : 'Another level supplies the solver settings for the open drawing'}
            style={{
              fontSize: 'var(--fs-xs)', fontWeight: '600', padding: '2px 8px', borderRadius: '10px',
              backgroundColor: inForce ? '#ECFDF5' : 'var(--color-surface-hover)',
              color: inForce ? '#047857' : 'var(--color-text-secondary)',
              border: `1px solid ${inForce ? '#A7F3D0' : 'var(--color-border)'}`,
            }}
          >
            {inForce ? 'In force' : 'Not in force'}
          </span>
        )}
      </div>

      {toggle && (
        <label
          style={{
            display: 'flex', alignItems: 'center', gap: '8px', minHeight: '32px', padding: '4px 10px',
            border: '1px solid #D8E2E1', borderRadius: '6px', backgroundColor: '#F4F7F6',
            cursor: toggle.disabled ? 'not-allowed' : 'pointer',
            opacity: toggle.disabled ? 0.7 : 1,
          }}
          title={toggle.disabled ? toggle.disabledHint : undefined}
        >
          <input
            type="checkbox"
            checked={toggle.checked}
            disabled={toggle.disabled}
            onChange={(e) => toggle.onChange(e.target.checked)}
            style={{ width: '16px', height: '16px', accentColor: '#395253', cursor: 'inherit' }}
          />
          <span style={{ fontSize: 'var(--fs-sm)', fontWeight: '600', color: 'var(--color-text-primary)' }}>{toggle.label}</span>
        </label>
      )}

      {toggle && !toggle.checked && inheritedFrom && (
        <p style={{ ...hintStyle, margin: 0 }}>
          Showing the values in force, <strong>from {SOURCE_LABELS[inheritedFrom]}</strong>. Tick the box to set your own.
        </p>
      )}
      {toggle && toggle.checked && overriddenBy && (
        <p style={{ ...hintStyle, margin: 0 }}>
          Not in force here: the <strong>{SOURCE_LABELS[overriddenBy]}</strong> settings take precedence.
        </p>
      )}
      {toggle?.disabled && toggle.disabledHint && (
        <p style={{ ...hintStyle, margin: 0 }}>{toggle.disabledHint}</p>
      )}

      <fieldset disabled={disabled} style={{ border: 'none', padding: 0, margin: 0, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '14px', opacity: disabled ? 0.6 : 1 }}>
        <div>
          <label style={labelStyle}>Solver method</label>
          <select
            value={values.solver_method || 'sparse_newton'}
            onChange={(e) => onChange({ solver_method: e.target.value })}
            className="form-select"
            style={inputStyle}
          >
            <option value="sparse_newton">Sparse Newton (Analytical)</option>
            <option value="lm">LM (Least-Squares)</option>
          </select>
          <p style={hintStyle}>Sparse Newton is fast and scalable; LM is a legacy dense solver.</p>
        </div>

        <div>
          <label style={labelStyle}>Warm-start cache</label>
          <select
            value={values.warm_start !== false ? 'true' : 'false'}
            onChange={(e) => onChange({ warm_start: e.target.value === 'true' })}
            className="form-select"
            style={inputStyle}
          >
            <option value="true">Enabled (Recommended)</option>
            <option value="false">Disabled (Force Cold Starts)</option>
          </select>
          <p style={hintStyle}>Reuses the last solved state as an initial guess. Speeds up real-time slider updates.</p>
        </div>

        <div>
          <label style={labelStyle}>Control iterations</label>
          <DraftNumberInput
            step="1" min="1" displayValue={values.control_iterations}
            onCommit={(text) => commit('control_iterations', text)}
            className="form-input" style={inputStyle}
          />
          <p style={hintStyle}>Max outer loop iterations for regulators and control valves (1 to 1000).</p>
        </div>

        <div>
          <label style={labelStyle}>Property iterations</label>
          <DraftNumberInput
            step="1" min="1" displayValue={values.property_iterations}
            onCommit={(text) => commit('property_iterations', text)}
            className="form-input" style={inputStyle}
          />
          <p style={hintStyle}>Max loops for propagating fluid temperature and thermal properties (1 to 100).</p>
        </div>

        <div>
          <label style={labelStyle}>Convergence tolerance</label>
          <DraftNumberInput
            step="any" displayValue={values.tolerance}
            onCommit={(text) => commit('tolerance', text)}
            className="form-input" style={inputStyle}
          />
          <p style={hintStyle}>Target numerical residual precision, 1e-9 to 1e-2 (e.g., 1e-6).</p>
        </div>

        <div>
          <label style={labelStyle}>Inner solver iterations</label>
          <DraftNumberInput
            step="1" min="1" displayValue={values.inner_iterations}
            onCommit={(text) => commit('inner_iterations', text)}
            className="form-input" style={inputStyle}
          />
          <p style={hintStyle}>Max steps for the core matrix solver per iteration (1 to 10000).</p>
        </div>
      </fieldset>
    </div>
  );
}
