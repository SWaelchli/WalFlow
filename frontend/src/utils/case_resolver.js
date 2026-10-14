import { DEFAULT_BASE_CASE } from '../constants/case_constants';

/**
 * Returns the active operating case object from the cases list.
 */
export const getActiveCase = (cases = [], activeCaseId = 'case_base') => {
  if (!cases || cases.length === 0) return DEFAULT_BASE_CASE;
  return cases.find(c => c.id === activeCaseId) || cases[0] || DEFAULT_BASE_CASE;
};

/**
 * Telemetry dataset of a case for the relief case view (F1-08):
 * - 'unmitigated_global': all relief devices held closed
 * - 'peak': solved steady state at the relief opening that sets the peak pressure; the backend
 *   sends no separate snapshot when the peak is the relieved state itself (or is unavailable)
 * - otherwise: relieved (final) state
 */
export const getCaseTelemetrySet = (activeCase, telemetryMode = 'mitigated') => {
  if (!activeCase) return null;
  if (telemetryMode === 'unmitigated_global') return activeCase.telemetry_unmitigated || null;
  if (telemetryMode === 'peak') return activeCase.telemetry_peak || activeCase.telemetry || null;
  return activeCase.telemetry || null;
};

/**
 * Computes effective node data by layering active case node overrides and telemetry over baseline node data.
 */
export const getEffectiveNodeData = (node, cases = [], activeCaseId = 'case_base', telemetryMode = 'mitigated') => {
  if (!node) return {};
  const activeCase = getActiveCase(cases, activeCaseId);
  let effective = { ...(node.data || {}) };

  if (activeCase && !activeCase.is_base && activeCase.overrides?.nodes?.[node.id]) {
    effective = {
      ...effective,
      ...activeCase.overrides.nodes[node.id]
    };
  }

  const caseTelemetry = getCaseTelemetrySet(activeCase, telemetryMode)?.nodes?.[node.id] || node.data?.telemetry;

  if (caseTelemetry) {
    effective.telemetry = caseTelemetry;
  }

  return effective;
};

/**
 * Computes effective edge data by layering active case edge telemetry over baseline edge data.
 */
export const getEffectiveEdgeData = (edge, cases = [], activeCaseId = 'case_base', telemetryMode = 'mitigated') => {
  if (!edge) return {};
  const activeCase = getActiveCase(cases, activeCaseId);
  let effective = { ...(edge.data || {}) };

  const caseTelemetry = getCaseTelemetrySet(activeCase, telemetryMode)?.edges?.[edge.id] || edge.data?.telemetry;

  if (caseTelemetry) {
    effective.telemetry = caseTelemetry;
  }

  return effective;
};

/**
 * Updates the calculated telemetry for a specific operating case (relieved, unmitigated and peak).
 * telemetryPeak is null when the peak is the relieved state, so a new run always replaces it.
 */
export const updateCaseTelemetry = (cases = [], targetCaseId, telemetry, kpis, telemetryUnmitigated, telemetryPeak = null) => {
  return cases.map(c => {
    if (c.id !== targetCaseId) return c;
    return {
      ...c,
      telemetry: telemetry || c.telemetry,
      telemetry_unmitigated: telemetryUnmitigated || c.telemetry_unmitigated || telemetry || c.telemetry,
      telemetry_peak: telemetry ? telemetryPeak : (c.telemetry_peak ?? null),
      kpis: kpis || c.kpis
    };
  });
};

/**
 * Computes effective global settings by layering active case global overrides over base global settings.
 */
export const getEffectiveGlobalSettings = (globalSettings = {}, cases = [], activeCaseId = 'case_base') => {
  const activeCase = getActiveCase(cases, activeCaseId);
  if (!activeCase || activeCase.is_base || !activeCase.overrides?.global_settings) {
    return globalSettings;
  }
  return { ...globalSettings, ...activeCase.overrides.global_settings };
};

/**
 * Checks if a specific node property is overridden in the currently active case.
 */
export const isPropertyOverridden = (nodeId, propKey, cases = [], activeCaseId = 'case_base') => {
  const activeCase = getActiveCase(cases, activeCaseId);
  if (!activeCase || activeCase.is_base) return false;
  return activeCase.overrides?.nodes?.[nodeId]?.[propKey] !== undefined;
};

/**
 * Checks if a node has any non-default active overrides in the current case.
 */
export const hasActiveOverrides = (nodeId, cases = [], activeCaseId = 'case_base') => {
  const activeCase = getActiveCase(cases, activeCaseId);
  if (!activeCase || activeCase.is_base) return false;
  const nodeOverrides = activeCase.overrides?.nodes?.[nodeId];
  return !!(nodeOverrides && Object.keys(nodeOverrides).length > 0);
};

/**
 * Helper to determine if two values are equivalent, taking default values into account.
 */
export const areValuesEquivalent = (val1, val2, propKey) => {
  let resolvedVal1 = val1;
  let resolvedVal2 = val2;

  const getFallback = (k) => {
    if (k === 'active') return true;
    if (k === 'relief_ramp_enabled') return true;
    if (k === 'forced_state') return 'auto';
    if (k === 'clogging') return 0.0;
    if (k === 'opening') return 50.0;
    if (k === 'level') return 0.0;
    if (k === 'temperature') return 313.15;
    if (k === 'set_pressure') return 500000.0;
    if (k === 'set_temperature_c') return 40.0;
    return undefined;
  };

  if (resolvedVal1 === undefined || resolvedVal1 === null) {
    resolvedVal1 = getFallback(propKey);
  }
  if (resolvedVal2 === undefined || resolvedVal2 === null) {
    resolvedVal2 = getFallback(propKey);
  }

  if (resolvedVal1 === resolvedVal2) return true;

  if (typeof resolvedVal1 === 'boolean' || typeof resolvedVal2 === 'boolean') {
    const b1 = resolvedVal1 === true || String(resolvedVal1) === 'true';
    const b2 = resolvedVal2 === true || String(resolvedVal2) === 'true';
    return b1 === b2;
  }

  const n1 = parseFloat(resolvedVal1);
  const n2 = parseFloat(resolvedVal2);
  if (!isNaN(n1) && !isNaN(n2)) {
    return Math.abs(n1 - n2) < 1e-9;
  }

  return String(resolvedVal1).trim() === String(resolvedVal2).trim();
};

/**
 * Returns a updated copy of the cases array with a specific property override set.
 */
export const updateCaseOverride = (cases = [], activeCaseId, nodeId, propKey, value, baseValue = undefined) => {
  if (baseValue !== undefined && areValuesEquivalent(value, baseValue, propKey)) {
    return removeCaseOverride(cases, activeCaseId, nodeId, propKey);
  }
  return cases.map(c => {
    if (c.id !== activeCaseId) return c;
    const currentNodes = c.overrides?.nodes || {};
    const currentNodeOverride = currentNodes[nodeId] || {};
    return {
      ...c,
      overrides: {
        ...c.overrides,
        nodes: {
          ...currentNodes,
          [nodeId]: {
            ...currentNodeOverride,
            [propKey]: value
          }
        }
      }
    };
  });
};

/**
 * Returns an updated copy of the cases array with a specific property override removed.
 */
export const removeCaseOverride = (cases = [], activeCaseId, nodeId, propKey) => {
  return cases.map(c => {
    if (c.id !== activeCaseId) return c;
    const currentNodes = c.overrides?.nodes || {};
    const currentNodeOverride = { ...(currentNodes[nodeId] || {}) };
    delete currentNodeOverride[propKey];

    const newNodes = { ...currentNodes };
    if (Object.keys(currentNodeOverride).length === 0) {
      delete newNodes[nodeId];
    } else {
      newNodes[nodeId] = currentNodeOverride;
    }

    return {
      ...c,
      overrides: {
        ...c.overrides,
        nodes: newNodes
      }
    };
  });
};

/**
 * Duplicates an operating case, creating a new non-base operating case.
 */
export const duplicateCase = (sourceCase, newName) => {
  const newId = `case_${crypto.randomUUID().split('-')[0]}`;
  return {
    id: newId,
    name: newName || `${sourceCase.name} (Copy)`,
    description: sourceCase.description || '',
    is_base: false,
    overrides: JSON.parse(JSON.stringify(sourceCase.overrides || { nodes: {}, global_settings: {} }))
  };
};

// Forced state of a relief device in a case: case override over the base value (default auto)
export const effectiveForcedState = (casesList, nodesList, caseId, nodeId) => {
  const c = (casesList || []).find(cs => cs.id === caseId);
  const override = c && !c.is_base ? c.overrides?.nodes?.[nodeId]?.forced_state : undefined;
  const node = (nodesList || []).find(n => n.id === nodeId);
  return override || node?.data?.forced_state || 'auto';
};
