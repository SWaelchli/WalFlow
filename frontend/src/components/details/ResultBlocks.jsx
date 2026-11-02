import React from 'react';
import { WarningIcon, InfoIcon } from '../symbols/IconLibrary';
import StatusBadge from '../common/StatusBadge';
import ChartLegend from './ChartLegend';

// Shared blocks of the inspector Results tab (MASTER.md "Results display"). Views pass data; the look is in index.css.

/** A group of results: the one section header (title, optional state badge) plus content. */
export function ResultSection({ title, badge, children }) {
  const { text, kind, title: badgeTitle } = badge || {};
  return (
    <section className="result-section">
      <div className="result-section-head">
        <h4 className="result-section-title">{title}</h4>
        {badge && <StatusBadge kind={kind} title={badgeTitle}>{text}</StatusBadge>}
      </div>
      <div className="result-section-body">{children}</div>
    </section>
  );
}

/** Key/value table. `columns` names the value columns when a row has more than one (ports, cases). */
export function ResultTable({ columns, children }) {
  const dense = columns && columns.length > 2;
  return (
    <div className="result-table-wrap">
    <table className={`result-table${dense ? ' result-table-dense' : ''}`}>
      {columns && (
        <thead>
          <tr>
            <th scope="col" aria-label="Quantity" />
            {columns.map((c) => <th key={c} scope="col">{c}</th>)}
          </tr>
        </thead>
      )}
      <tbody>{children}</tbody>
    </table>
    </div>
  );
}

const hasValue = (v) => v !== null && v !== undefined && v !== '';

function Cell({ value, unit, text }) {
  const cls = `result-value${text ? ' result-value-text' : ''}`;
  if (!hasValue(value) || value === '—') return <td className={cls}>—</td>;
  return (
    <td className={cls}>
      {value}
      {hasValue(unit) && <span className="result-unit">{unit}</span>}
    </td>
  );
}

/**
 * One result: label left, value right with its unit after it ("—" for no value).
 * `values` replaces value/unit for a multi-column table; each entry is a value or `{ value, unit }`.
 * `text` marks the value(s) as words (sans font, not mono). `labelUnit` shows one unit after the label
 * instead of after every value (ports, cases).
 */
export function ResultRow({ label, value, unit, values, title, text = false, labelUnit }) {
  return (
    <tr title={title}>
      <td className="result-label">
        {label}
        {hasValue(labelUnit) && <span className="result-unit">{labelUnit}</span>}
      </td>
      {values
        ? values.map((v, i) => (v !== null && typeof v === 'object' && 'value' in v
          ? <Cell key={i} value={v.value} unit={v.unit} text={text} />
          : <Cell key={i} value={v} text={text} />))
        : <Cell value={value} unit={unit} text={text} />}
    </tr>
  );
}

/** Warning, error or note: info-bar style with icon and words. `tone` is warning, danger or info. */
export function ResultCallout({ tone = 'warning', title, children, role }) {
  const safeTone = ['warning', 'danger', 'info'].includes(tone) ? tone : 'warning';
  return (
    <div className={`result-callout result-callout-${safeTone}`} role={role ?? (safeTone === 'info' ? 'status' : 'alert')}>
      {safeTone === 'info'
        ? <InfoIcon size={16} className="result-callout-icon" />
        : <WarningIcon size={16} className="result-callout-icon" />}
      <div className="result-callout-body">
        {title && <span className="result-callout-title">{title}</span>}
        {children && <span className="result-callout-text">{children}</span>}
      </div>
    </div>
  );
}

/** Chart frame. Pass the ResponsiveContainer as child, or `empty` (text) while there is nothing to draw. `legend` is a payload drawn above the plot, never inside it. */
export function ResultChart({ empty, compact = false, legend, children }) {
  if (empty) return <div className="result-chart-empty">{empty}</div>;
  return (
    <>
      {legend && <ChartLegend payload={legend} />}
      <div className={`result-chart${compact ? ' result-chart-compact' : ''}`}>{children}</div>
    </>
  );
}

/** Share bar (0-100 %) for capacity used, valve opening; the fill colour is a state (primary, success, warning, danger). */
export function ResultMeter({ value, tone = 'primary' }) {
  const pct = Math.min(100, Math.max(0, Number(value) || 0));
  return (
    <div className="result-meter" role="presentation">
      <div className={`result-meter-fill result-meter-${tone}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
