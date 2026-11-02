import React from 'react';

const LEGEND_ICON = {
  plainline: (c) => <line x1="0" y1="7" x2="14" y2="7" stroke={c} strokeWidth="2" />,
  cross: (c) => <path d="M7 1V13M1 7H13" stroke={c} strokeWidth="2.5" />,
};

export default function ChartLegend({ payload = [] }) {
  if (!payload || !payload.length) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: '10px', fontSize: 'var(--fs-xs)' }}>
      {payload.map((e) => (
        <span key={e.value} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: e.color }}>
          <svg width="14" height="14" viewBox="0 0 14 14">
            {LEGEND_ICON[e.type]?.(e.color)}
          </svg>
          {e.value}
        </span>
      ))}
    </div>
  );
}
