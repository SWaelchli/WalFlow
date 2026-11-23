import React from 'react';

const LEGEND_ICON = {
  plainline: (c) => <line x1="0" y1="7" x2="14" y2="7" stroke={c} strokeWidth="2" />,
  cross: (c) => <path d="M7 1V13M1 7H13" stroke={c} strokeWidth="2.5" />,
  swatch: (c, fill) => <rect x="1" y="3" width="12" height="8" fill={fill} stroke={c} strokeWidth="1" />,
};

export default function ChartLegend({ payload = [] }) {
  if (!payload || !payload.length) return null;
  return (
    <div className="result-chart-legend">
      {payload.map((e) => (
        <span key={e.value} className="result-chart-legend-item" style={{ color: e.color }}>
          <svg width="14" height="14" viewBox="0 0 14 14">
            {LEGEND_ICON[e.type]?.(e.color, e.fill)}
          </svg>
          {e.value}
        </span>
      ))}
    </div>
  );
}
