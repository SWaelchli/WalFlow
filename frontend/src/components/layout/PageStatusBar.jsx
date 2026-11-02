import React from 'react';
import { EditIcon, LockIcon } from '../symbols/IconLibrary';

/**
 * Status bar of a page (the Catalogue), fixed slots left to right: entry count of the current list, source filter;
 * right: the user's role on the page ("Read-only" or "Can edit"). Static slots only, no canvas state.
 */
export default function PageStatusBar({ count, filterLabel, canEdit }) {
  const RoleIcon = canEdit ? EditIcon : LockIcon;
  return (
    <>
      <span className="status-slot status-slot-static" title="Entries in the list">
        {`${count} ${count === 1 ? 'entry' : 'entries'}`}
      </span>
      <span className="status-slot status-slot-static" title="Source filter of the list">
        {`Source: ${filterLabel}`}
      </span>
      <span className="status-spacer" />
      <span
        className="status-slot status-slot-static"
        title={canEdit ? 'Your role can edit the catalogue' : 'Your role can view the catalogue but not edit it'}
      >
        <RoleIcon size={14} />
        <span>{canEdit ? 'Can edit' : 'Read-only'}</span>
      </span>
    </>
  );
}
