import React from 'react';
import { PlusIcon, ExportIcon, ImportIcon, GlobeIcon, ResetIcon } from '../symbols/IconLibrary';

const btnStyle = { height: '32px', padding: '0 10px', fontSize: 'var(--fs-xs)', fontWeight: '700', gap: '4px' };

/**
 * Library-wide actions of a catalogue (pipe classes or fitting standards): create, import, export
 * and restore the shipped defaults. Export is open to everyone; the rest needs `canManage`.
 */
export default function LibraryActions({
  canManage,
  newLabel,
  onNew,
  onImportTr2000,
  onImport,
  importTitle,
  onExport,
  exportTitle,
  onRestore,
  restoreTitle,
  isRestoring = false,
}) {
  return (
    <div role="group" aria-label="Library actions" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
      {canManage && (
        <button type="button" onClick={onNew} className="btn-secondary" style={btnStyle}>
          <PlusIcon size={12} />
          {newLabel}
        </button>
      )}
      {canManage && onImportTr2000 && (
        <button type="button" onClick={onImportTr2000} className="btn-secondary" style={btnStyle} title="Search and import pipe classes from Equinor TR2000">
          <GlobeIcon size={12} />
          Import from TR2000
        </button>
      )}
      {canManage && (
        <button type="button" onClick={onImport} className="btn-secondary" style={btnStyle} title={importTitle}>
          <ImportIcon size={12} />
          Import library
        </button>
      )}
      <button type="button" onClick={onExport} className="btn-secondary" style={btnStyle} title={exportTitle}>
        <ExportIcon size={12} />
        Export library
      </button>
      {canManage && (
        <button type="button" onClick={onRestore} disabled={isRestoring} className="btn-secondary" style={btnStyle} title={restoreTitle}>
          <ResetIcon size={12} />
          {isRestoring ? 'Restoring...' : 'Restore defaults'}
        </button>
      )}
    </div>
  );
}

/** Toolbar row of a detail card: item actions on the left, library actions on the right. */
export function DetailToolbar({ children, library }) {
  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: '8px 16px',
      paddingBottom: '14px',
      marginBottom: '16px',
      borderBottom: '1px solid var(--color-border)'
    }}>
      <div role="group" aria-label="Selected item actions" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
        {children}
      </div>
      {library}
    </div>
  );
}
