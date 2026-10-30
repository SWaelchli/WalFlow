import React from 'react';
import StatusBadge from '../components/common/StatusBadge';

/**
 * Text shown under a node symbol: optional name, value rows, secondary lines and status badges.
 * Nodes pass data only; styling comes from the .node-readout* classes.
 */
export default function NodeReadout({ name, rows = [], meta = [], badges = [] }) {
  return (
    <div className="node-readout">
      {name && <div className="node-readout-name">{name}</div>}
      {rows.map((row, i) => {
        if (row.value === null || row.value === undefined) return null;
        return (
          <div className="node-readout-row" key={row.key ?? i}>
            {row.label && <span className="node-readout-label">{row.label} </span>}
            <span className="node-readout-value">
              {row.value}
              {row.unit ? <span className="node-readout-unit"> {row.unit}</span> : null}
            </span>
          </div>
        );
      })}
      {meta.map((line, i) => (
        <div className="node-readout-meta" key={i}>{line}</div>
      ))}
      {badges.length > 0 && (
        <div className="node-readout-badges">
          {badges.map((b, i) => (
            <StatusBadge key={b.key ?? i} kind={b.kind} title={b.title}>{b.label}</StatusBadge>
          ))}
        </div>
      )}
    </div>
  );
}
