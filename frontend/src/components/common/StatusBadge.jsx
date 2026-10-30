import React from 'react';

const KINDS = ['neutral', 'success', 'warning', 'danger', 'info'];

/** Small word-based state mark. The only coloured element a node shows (MASTER.md "Canvas values"). */
export default function StatusBadge({ kind = 'neutral', children, title, icon }) {
  const safeKind = KINDS.includes(kind) ? kind : 'neutral';
  return (
    <span className={`status-badge status-badge-${safeKind}`} title={title}>
      {icon}
      {children}
    </span>
  );
}
