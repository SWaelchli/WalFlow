import React from 'react';

/** Compact single-choice toggle (joined buttons, aria-pressed). `options` is [{ value, label }]. */
export default function SegmentedToggle({ options, value, onChange, ariaLabel }) {
  return (
    <div className="segmented" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`btn-secondary btn-compact${o.value === value ? ' btn-active' : ''}`}
          aria-pressed={o.value === value}
          data-testid={`segmented-${o.value}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
