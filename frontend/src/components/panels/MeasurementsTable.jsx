import React, { useMemo, useState } from 'react';
import { notify } from '../../utils/dialogs';
import { useUnits } from '../../context/UnitContext';
import { clickableProps } from '../../utils/a11yProps';
import { getCaseTelemetrySet } from '../../utils/case_resolver';
import { isCaseResultStale } from '../../utils/resultHash';
import {
  INSTRUMENT_VARIABLES, ALARM_KEYS, instrumentInput, describeInstrumentInput, instrumentUnit,
  readInstrument, alarmState, formatReading, limitToDisplay, limitFromDisplay, limitOrderError,
} from '../../utils/instrumentReadings';

const ALARM_LABELS = { alarm_ll: 'LL', alarm_l: 'L', alarm_h: 'H', alarm_hh: 'HH' };
const isTrip = (key) => key === 'alarm_ll' || key === 'alarm_hh';

// Alarm state as text first; the colour only backs it up
const STATE_STYLE = {
  HH: { bg: '#FEF2F2', border: 'var(--color-danger)', text: 'var(--color-danger-text)' },
  LL: { bg: '#FEF2F2', border: 'var(--color-danger)', text: 'var(--color-danger-text)' },
  H: { bg: 'var(--color-warning-bg)', border: 'var(--color-primary)', text: 'var(--color-primary-text)' },
  L: { bg: 'var(--color-warning-bg)', border: 'var(--color-primary)', text: 'var(--color-primary-text)' },
};

const ACTIVE_BG = '#fff7ed';
const th = { padding: '6px 12px', verticalAlign: 'middle', whiteSpace: 'nowrap' };
const td = { padding: '4px 12px', verticalAlign: 'middle', whiteSpace: 'nowrap' };

/** Where the instrument senses: "PIT tap 1", or "+ FT-1 inlet 0 / − FT-1 outlet 0" for a ΔP. */
const locationText = (inst, nodes, edges) => {
  const plus = describeInstrumentInput(instrumentInput(inst.id, edges), nodes);
  if (inst.data?.variable !== 'dP') return plus;
  const minus = describeInstrumentInput(instrumentInput(inst.id, edges, 'signal-in-ref'), nodes);
  return plus || minus ? `+ ${plus || '?'}  /  − ${minus || '?'}` : null;
};

/**
 * Measurements tab: one row per instrument with its editable alarm limits, and its reading in every operating case,
 * so it shows which case trips an alarm. Limits are stored on the instrument, so they are the same in every case.
 */
export default function MeasurementsTable({
  nodes = [], edges = [], cases = [], activeCaseId, onSelectCase, onSelectNode, onUpdateNode,
  caseInputHashes = {}, telemetryMode = 'mitigated', globalSettings, isImperial,
}) {
  const { flowUnit } = useUnits();
  const [drafts, setDrafts] = useState({});
  const instruments = useMemo(() => nodes.filter((n) => n.type === 'instrument'), [nodes]);

  // Readings per case and instrument, judged against the current limits (no re-run needed)
  const readings = useMemo(() => {
    const out = {};
    cases.forEach((c) => {
      const caseId = c.id || c.case_id;
      const atmPa = c.overrides?.global_settings?.atmospheric_pressure ?? globalSettings?.atmospheric_pressure;
      const set = getCaseTelemetrySet(c, telemetryMode);
      out[caseId] = {};
      instruments.forEach((inst) => {
        const value = set ? readInstrument(inst, edges, set, atmPa, nodes) : null;
        out[caseId][inst.id] = { value, state: alarmState(value, inst.data) };
      });
    });
    return out;
  }, [cases, instruments, nodes, edges, telemetryMode, globalSettings?.atmospheric_pressure]);

  if (instruments.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-text-secondary)', fontSize: 'var(--fs-base)', fontWeight: '600' }}>
        ℹ No instruments in the current diagram. Drag an Instrument from the sidebar onto the canvas, or right-click a tap or pin and choose Add instrument.
      </div>
    );
  }

  const draftKey = (id, key) => `${id}:${key}`;

  const commitLimit = (inst, key) => {
    const dk = draftKey(inst.id, key);
    if (!Object.prototype.hasOwnProperty.call(drafts, dk)) return;
    const value = limitFromDisplay(inst.data?.variable || 'P', drafts[dk], isImperial, flowUnit);
    setDrafts((prev) => { const next = { ...prev }; delete next[dk]; return next; });
    const error = limitOrderError({ ...inst.data, [key]: value });
    if (error) {
      notify(error, 'warning');
      return;
    }
    if (onUpdateNode) onUpdateNode(inst.id, { [key]: value });
  };

  const cancelLimit = (inst, key) => {
    const dk = draftKey(inst.id, key);
    setDrafts((prev) => { const next = { ...prev }; delete next[dk]; return next; });
  };

  return (
    <table style={{ width: '100%', height: 'max-content', borderCollapse: 'collapse', fontSize: 'var(--fs-xs)', textAlign: 'left', tableLayout: 'auto' }}>
      <thead>
        <tr style={{ background: 'var(--color-border-hover)', borderBottom: '2px solid var(--color-border)', color: 'var(--color-brand-dark)', fontWeight: '700', height: '40px' }}>
          <th style={{ ...th, minWidth: '120px' }}>Instrument Tag</th>
          <th style={{ ...th, minWidth: '140px' }}>Variable</th>
          <th style={{ ...th, minWidth: '160px' }}>Location</th>
          {ALARM_KEYS.map((key) => (
            <th key={key} style={{ ...th, width: '76px', color: isTrip(key) ? 'var(--color-danger-text)' : 'var(--color-primary-text)' }}
              title={isTrip(key) ? 'Trip limit (red)' : 'Alarm limit (orange)'}>
              {ALARM_LABELS[key]}
            </th>
          ))}
          {cases.map((c) => {
            const caseId = c.id || c.case_id;
            const isActive = caseId === activeCaseId;
            return (
              <th key={caseId} style={{ ...th, minWidth: '140px', background: isActive ? ACTIVE_BG : 'inherit', borderLeft: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>{c.name || c.case_name} {c.is_base ? '(Base)' : ''}</span>
                  {!isActive && onSelectCase && (
                    <button
                      onClick={() => onSelectCase(caseId)}
                      style={{ padding: '2px 6px', fontSize: 'var(--fs-xs)', borderRadius: '4px', border: '1px solid var(--color-border)', background: '#ffffff', cursor: 'pointer', color: 'var(--color-brand-dark)', fontWeight: '600' }}
                    >
                      Switch
                    </button>
                  )}
                  {isActive && <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-primary-text)', fontWeight: 'bold' }}>Active</span>}
                  {isCaseResultStale(c, caseInputHashes) && (
                    <span title="The diagram changed since this case was solved. Run the simulation again." style={{ fontSize: 'var(--fs-xs)', fontWeight: '700', color: '#7A3E00', background: '#FFF7ED', border: '1px solid #FDE3C3', padding: '1px 6px', borderRadius: '10px' }}>Out of date</span>
                  )}
                </div>
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {instruments.map((inst, idx) => {
          const data = inst.data || {};
          const variable = data.variable || 'P';
          const unit = instrumentUnit(variable, data.pressure_basis, isImperial, flowUnit);
          const tag = data.label || inst.id;
          const location = locationText(inst, nodes, edges);
          return (
            <tr key={inst.id} style={{ borderBottom: '1px solid var(--color-border-hover)', background: idx % 2 === 0 ? '#FFFFFF' : '#F8FAFA', height: '36px' }}>
              <td {...clickableProps}
                onClick={() => onSelectNode && onSelectNode(inst.id)}
                style={{ ...td, fontWeight: '700', color: 'var(--color-primary-text)', cursor: 'pointer' }}
                title="Click to locate on canvas"
              >
                {tag}
              </td>
              <td style={{ ...td, color: 'var(--color-text-secondary)' }}>
                {(INSTRUMENT_VARIABLES[variable] || INSTRUMENT_VARIABLES.P).name} ({unit})
              </td>
              <td style={{ ...td, color: location ? 'var(--color-text-primary)' : 'var(--color-warning-text)' }}>
                {location || 'Not wired'}
              </td>
              {ALARM_KEYS.map((key) => {
                const dk = draftKey(inst.id, key);
                return (
                  <td key={key} style={{ ...td, padding: '4px 4px' }}>
                    <input
                      type="number" step="any" placeholder="off"
                      aria-label={`${ALARM_LABELS[key]} limit of ${tag} (${unit})`}
                      className="form-input" style={{ width: '68px' }}
                      value={drafts[dk] !== undefined ? drafts[dk] : limitToDisplay(variable, data[key], isImperial, flowUnit)}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [dk]: e.target.value }))}
                      onBlur={() => commitLimit(inst, key)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                        else if (e.key === 'Escape') { cancelLimit(inst, key); e.currentTarget.blur(); }
                      }}
                    />
                  </td>
                );
              })}
              {cases.map((c) => {
                const caseId = c.id || c.case_id;
                const reading = readings[caseId]?.[inst.id] || { value: null, state: null };
                const { text, unit: shownUnit } = formatReading(variable, reading.value, data.pressure_basis, isImperial, flowUnit);
                const s = STATE_STYLE[reading.state];
                return (
                  <td key={caseId} style={{ ...td, background: caseId === activeCaseId ? ACTIVE_BG : 'inherit', borderLeft: '1px solid var(--color-border)', fontFamily: 'var(--font-mono)' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'baseline', gap: '4px', padding: '1px 6px', borderRadius: 'var(--radius-sm)',
                      background: s ? s.bg : 'transparent', border: `1px solid ${s ? s.border : 'transparent'}`,
                      color: s ? s.text : 'var(--color-text-primary)', fontWeight: 700,
                    }}>
                      {reading.state && <span>{reading.state}</span>}
                      <span>{text}</span>
                      <span style={{ fontWeight: 500 }}>{shownUnit}</span>
                    </span>
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
