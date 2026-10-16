import React from 'react';
import { isCaseVariableProperty } from '../../constants/case_constants';
import { isPropertyOverridden } from '../../utils/case_resolver';
import { GlobeIcon, BoltIcon, DotIcon, ResetIcon } from '../symbols/IconLibrary';

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
        <BoltIcon size={10} color={isOverridden ? 'var(--color-warning-text)' : 'var(--color-primary-text)'} /> Case variable
      </span>
      {isOverridden && (
        <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-warning-text)', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '3px' }} title="Overridden in current case">
          <DotIcon size={6} /> Overridden
        </span>
      )}
      {isOverridden && onResetOverride && (
        <button
          onClick={(e) => { e.preventDefault(); onResetOverride(nodeId, propKey); }}
          title="Reset to base case value"
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', padding: 0, display: 'inline-flex', alignItems: 'center', gap: '3px' }}
        >
          <ResetIcon size={11} /> Reset
        </button>
      )}
    </div>
  );
}
