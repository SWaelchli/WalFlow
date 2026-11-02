import React from 'react';
import { PlusIcon, ImportIcon, GlobeIcon } from '../symbols/IconLibrary';

/**
 * The page controls of a catalogue tab (pipe classes or fitting standards). Library-wide commands (import, export,
 * restore defaults) live in the menu bar only; the page keeps New at the top of the list, the actions of the
 * selected entry, and Save and Cancel while editing.
 */

/** New at the top of the list pane; only for a user who can manage the catalogue. */
export function ListNewButton({ canManage, label, onNew }) {
  if (!canManage) return null;
  return (
    <div className="page-list-actions">
      <button type="button" onClick={onNew} className="btn-secondary">
        <PlusIcon size={12} />
        {label}
      </button>
    </div>
  );
}

/** The list of a library that has no entries at all: say so, and offer New and the imports to who can manage. */
export function EmptyLibrary({ message, canManage, newLabel, onNew, onImportTr2000, onImport }) {
  return (
    <div className="page-empty">
      <span>{message}</span>
      {canManage && (
        <>
          <button type="button" onClick={onNew} className="btn-secondary">
            <PlusIcon size={12} />
            {newLabel}
          </button>
          {onImportTr2000 && (
            <button type="button" onClick={onImportTr2000} className="btn-secondary" title="Search and import pipe classes from Equinor TR2000">
              <GlobeIcon size={12} />
              Import from TR2000
            </button>
          )}
          <button type="button" onClick={onImport} className="btn-secondary">
            <ImportIcon size={12} />
            Import library
          </button>
        </>
      )}
    </div>
  );
}

/** Actions of the selected entry (Clone, Edit, Delete). Nothing is drawn when the user has none. */
export function DetailToolbar({ children }) {
  if (React.Children.toArray(children).length === 0) return null;
  return (
    <div role="group" aria-label="Selected item actions" className="page-toolbar">
      {children}
    </div>
  );
}

/** Save and Cancel of an entry being edited; it sticks to the top of the scrolling details. */
export function EditBar({ label, isDirty, isSaving, onCancel, onSave }) {
  return (
    <div className="page-edit-bar" role="toolbar" aria-label="Editing actions">
      <span>
        <span className="page-edit-bar-title">{`Editing ${label}`}</span>
        {isDirty && <span className="page-edit-bar-state">Unsaved changes</span>}
      </span>
      <div className="page-edit-bar-actions">
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
        <button type="button" onClick={onSave} disabled={isSaving} className="btn-primary">
          {isSaving ? 'Saving...' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}
