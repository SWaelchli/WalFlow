import React, { useState } from 'react';
import { notify } from '../../utils/dialogs';
import {
  INSTRUMENT_VARIABLES, ALARM_KEYS, instrumentInput, instrumentUnit, limitToDisplay, limitFromDisplay,
  limitOrderError, retagForVariable, describeInstrumentInput as describeInput,
} from '../../utils/instrumentReadings';

const ALARM_LABELS = { alarm_ll: 'LL', alarm_l: 'L', alarm_h: 'H', alarm_hh: 'HH' };
const fieldLabel = { fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)' };

/**
 * Inspector fields of an instrument bubble. Variable, basis and alarm limits are stored on the instrument itself,
 * so they are the same in every operating case; each case's reading is judged against them.
 */
export default function InstrumentSetup({ id, data, allNodes = [], allEdges = [], isImperial, onUpdate }) {
  const [drafts, setDrafts] = useState({});
  const variable = data.variable || 'P';
  const basis = data.pressure_basis || 'gauge';
  const unit = instrumentUnit(variable, basis, isImperial);
  const isDp = variable === 'dP';

  const plus = describeInput(instrumentInput(id, allEdges), allNodes);
  const minus = isDp ? describeInput(instrumentInput(id, allEdges, 'signal-in-ref'), allNodes) : null;

  const changeVariable = (next) => {
    if (next === variable) return;
    const labels = allNodes.filter(n => n.id !== id).map(n => n.data?.label);
    // Limits belong to the old variable's unit, so they are cleared
    onUpdate(id, {
      variable: next,
      label: retagForVariable(data.label, variable, next, labels),
      alarm_ll: null, alarm_l: null, alarm_h: null, alarm_hh: null,
    });
    setDrafts({});
  };

  const commitLimit = (key) => {
    if (!Object.prototype.hasOwnProperty.call(drafts, key)) return;
    const value = limitFromDisplay(variable, drafts[key], isImperial);
    setDrafts(prev => { const next = { ...prev }; delete next[key]; return next; });
    const error = limitOrderError({ ...data, [key]: value });
    if (error) {
      notify(error, 'warning');
      return;
    }
    onUpdate(id, { [key]: value });
  };

  const segment = (active) => ({
    flex: 1, padding: '6px 8px', fontSize: 'var(--fs-xs)', fontWeight: 600, cursor: 'pointer',
    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
    background: active ? 'var(--color-brand-dark)' : 'var(--color-surface-hover)',
    color: active ? 'var(--color-text-inverse)' : 'var(--color-text-primary)',
    transition: 'background 0.15s ease',
  });

  return (
    <>
      <div>
        <label htmlFor={`instrument-variable-${id}`} style={fieldLabel}>Measured variable</label>
        <select
          id={`instrument-variable-${id}`}
          className="form-select" style={{ width: '100%' }}
          value={variable}
          onChange={(e) => changeVariable(e.target.value)}
        >
          {Object.entries(INSTRUMENT_VARIABLES).map(([key, v]) => (
            <option key={key} value={key}>{v.name} ({v.letters})</option>
          ))}
        </select>
      </div>

      {variable === 'P' && (
        <div>
          <span style={fieldLabel}>Pressure basis</span>
          <div role="group" aria-label="Pressure basis" style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
            <button type="button" aria-pressed={basis === 'gauge'} style={segment(basis === 'gauge')} onClick={() => onUpdate(id, { pressure_basis: 'gauge' })}>
              Gauge
            </button>
            <button type="button" aria-pressed={basis === 'absolute'} style={segment(basis === 'absolute')} onClick={() => onUpdate(id, { pressure_basis: 'absolute' })}>
              Absolute
            </button>
          </div>
        </div>
      )}

      <div>
        <span style={fieldLabel}>{isDp ? 'Measuring (+)' : 'Measuring at'}</span>
        <div style={{ fontSize: 'var(--fs-sm)', color: plus ? 'var(--color-text-primary)' : 'var(--color-warning-text)', marginTop: '2px' }}>
          {plus || 'Not wired: drag a signal line from a yellow pin to the bubble.'}
        </div>
        {isDp && (
          <>
            <span style={{ ...fieldLabel, display: 'block', marginTop: '6px' }}>Reference (−)</span>
            <div style={{ fontSize: 'var(--fs-sm)', color: minus ? 'var(--color-text-primary)' : 'var(--color-warning-text)', marginTop: '2px' }}>
              {minus || 'Not wired: connect a second pin to the right-hand input.'}
            </div>
          </>
        )}
      </div>

      <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '8px' }}>
        <span style={{ ...fieldLabel, fontWeight: 'bold' }}>Alarm limits ({unit})</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginTop: '4px' }}>
          {ALARM_KEYS.map((key) => (
            <div key={key}>
              <label htmlFor={`${key}-${id}`} style={{ ...fieldLabel, fontWeight: 700, color: key.endsWith('hh') || key.endsWith('ll') ? 'var(--color-danger-text)' : 'var(--color-primary-text)' }}>
                {ALARM_LABELS[key]}
              </label>
              <input
                id={`${key}-${id}`}
                type="number" step="any" placeholder="off"
                className="form-input" style={{ width: '100%' }}
                value={drafts[key] !== undefined ? drafts[key] : limitToDisplay(variable, data[key], isImperial)}
                onChange={(e) => setDrafts(prev => ({ ...prev, [key]: e.target.value }))}
                onBlur={() => commitLimit(key)}
              />
            </div>
          ))}
        </div>
        <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>
          Blank is off. Limits apply to every operating case; alarms are indication only.
        </p>
      </div>
    </>
  );
}
