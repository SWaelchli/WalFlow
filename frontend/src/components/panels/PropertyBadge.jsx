import React from 'react';
import { isCaseVariableProperty } from '../../constants/case_constants';
import { isPropertyOverridden } from '../../utils/case_resolver';
import { GlobeIcon, BoltIcon } from '../symbols/IconLibrary';

/** Small marker next to a property that shows whether the active case overrides it, with a reset button. */
export default function PropertyBadge({ propKey, nodeId, cases = [], activeCaseId = 'case_base', onResetOverride }) {
  const isCaseVar = isCaseVariableProperty(propKey);
  const activeCaseObj = cases.find(c => c.id === activeCaseId);
  const isBaseCase = !activeCaseObj || activeCaseObj.is_base;
  const isOverridden = !isBaseCase && isPropertyOverridden(nodeId, propKey, cases, activeCaseId);

  if (!isCaseVar) {
    return (
      <span className="badge-global" title="Global hardware specification fixed across all operating cases">
        <GlobeIcon size={10} color="var(--color-text-secondary)" /> Global
      </span>
    );
  }

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
      <span 
        className={`badge-case ${isOverridden ? '' : 'not-overridden'}`} 
        title="Case-specific operating variable"
      >
        <BoltIcon size={10} color={isOverridden ? '#d97706' : 'var(--color-primary)'} /> Case Variable
      </span>
      {isOverridden && (
        <span style={{ fontSize: '9px', color: '#d97706', fontWeight: '700' }} title={`Overridden in current case`}>
          ● Overridden
        </span>
      )}
      {isOverridden && onResetOverride && (
        <button
          onClick={(e) => { e.preventDefault(); onResetOverride(nodeId, propKey); }}
          title="Reset to Base Case value"
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '10px', color: 'var(--color-text-secondary)', padding: 0 }}
        >
          ↺ Reset
        </button>
      )}
    </div>
  );
}
