import { DEFAULT_BASE_CASE } from '../constants/case_constants';

/**
 * Returns the active operating case object from the cases list.
 */
export const getActiveCase = (cases = [], activeCaseId = 'case_base') => {
  if (!cases || cases.length === 0) return DEFAULT_BASE_CASE;
  return cases.find(c => c.id === activeCaseId) || cases[0] || DEFAULT_BASE_CASE;
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

  const caseTelemetry = telemetryMode === 'unmitigated_global'
    ? (activeCase?.telemetry_unmitigated?.nodes?.[node.id] || node.data?.telemetry)
    : (activeCase?.telemetry?.nodes?.[node.id] || node.data?.telemetry);

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

  const caseTelemetry = telemetryMode === 'unmitigated_global'
    ? (activeCase?.telemetry_unmitigated?.edges?.[edge.id] || edge.data?.telemetry)
    : (activeCase?.telemetry?.edges?.[edge.id] || edge.data?.telemetry);

  if (caseTelemetry) {
    effective.telemetry = caseTelemetry;
  }

  return effective;
};

/**
 * Updates the calculated telemetry for a specific operating case (both Mitigated and Unmitigated passes).
 */
export const updateCaseTelemetry = (cases = [], targetCaseId, telemetry, kpis, telemetryUnmitigated) => {
  return cases.map(c => {
    if (c.id !== targetCaseId) return c;
    return {
      ...c,
      telemetry: telemetry || c.telemetry,
      telemetry_unmitigated: telemetryUnmitigated || c.telemetry_unmitigated || telemetry || c.telemetry,
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
 * Returns a updated copy of the cases array with a specific property override set.
 */
export const updateCaseOverride = (cases = [], activeCaseId, nodeId, propKey, value) => {
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
