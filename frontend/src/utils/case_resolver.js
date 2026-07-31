import { DEFAULT_BASE_CASE } from '../constants/case_constants';

/**
 * Returns the active operating case object from the cases list.
 */
export const getActiveCase = (cases = [], activeCaseId = 'case_base') => {
  if (!cases || cases.length === 0) return DEFAULT_BASE_CASE;
  return cases.find(c => c.id === activeCaseId) || cases[0] || DEFAULT_BASE_CASE;
};

/**
 * Helper to scale telemetry items (nodes or edges) to the peak pressure state.
 */
const scaleTelemetryItem = (item, S, pMinBar) => {
  if (!item) return item;
  const scalePort = (port) => {
    if (!port || typeof port.pressure !== 'number') return port;
    const pBar = port.pressure / 100000.0;
    const pPeakBar = pMinBar + S * (pBar - pMinBar);
    return {
      ...port,
      pressure: pPeakBar * 100000.0
    };
  };

  const inlets = item.inlets ? item.inlets.map(scalePort) : item.inlets;
  const outlets = item.outlets ? item.outlets.map(scalePort) : item.outlets;

  return {
    ...item,
    inlets,
    outlets
  };
};

/**
 * Computes scaling factor S and minimum pressure reference in unmitigated telemetry.
 */
export const getActiveCaseScalingInfo = (activeCase) => {
  if (!activeCase) return { S: 1.0, pMinBar: 1.01325 };
  if (activeCase._scalingInfo) return activeCase._scalingInfo;

  // Helper to extract maximum pressure from a telemetry dataset (in bar)
  const getMaxPressure = (tele) => {
    if (!tele) return null;
    let maxPa = -Infinity;
    if (tele.nodes) {
      for (const n of Object.values(tele.nodes)) {
        for (const p of [...(n.inlets || []), ...(n.outlets || [])]) {
          if (typeof p.pressure === 'number' && p.pressure > maxPa) {
            maxPa = p.pressure;
          }
        }
      }
    }
    if (tele.edges) {
      for (const e of Object.values(tele.edges)) {
        for (const p of [...(e.inlets || []), ...(e.outlets || [])]) {
          if (typeof p.pressure === 'number' && p.pressure > maxPa) {
            maxPa = p.pressure;
          }
        }
      }
    }
    return maxPa !== -Infinity ? maxPa / 100000.0 : null;
  };

  const pPeak = activeCase.kpis?.peak_pressure_bara ?? getMaxPressure(activeCase.telemetry);
  const pUnmit = activeCase.kpis?.unmitigated_peak_pressure_bara ?? getMaxPressure(activeCase.telemetry_unmitigated);

  if (pPeak == null || pUnmit == null) {
    return { S: 1.0, pMinBar: 1.01325 };
  }
  if (Math.abs(pUnmit - pPeak) < 1e-4) {
    activeCase._scalingInfo = { S: 1.0, pMinBar: 1.01325 };
    return activeCase._scalingInfo;
  }

  const telemetryUnmit = activeCase.telemetry_unmitigated;
  if (!telemetryUnmit) {
    return { S: 1.0, pMinBar: 1.01325 };
  }

  let minPa = Infinity;
  if (telemetryUnmit.nodes) {
    for (const n of Object.values(telemetryUnmit.nodes)) {
      for (const p of [...(n.inlets || []), ...(n.outlets || [])]) {
        if (typeof p.pressure === 'number' && p.pressure < minPa) {
          minPa = p.pressure;
        }
      }
    }
  }
  if (telemetryUnmit.edges) {
    for (const e of Object.values(telemetryUnmit.edges)) {
      for (const p of [...(e.inlets || []), ...(e.outlets || [])]) {
        if (typeof p.pressure === 'number' && p.pressure < minPa) {
          minPa = p.pressure;
        }
      }
    }
  }
  const pMinBar = minPa !== Infinity ? minPa / 100000.0 : 1.01325;
  const denominator = pUnmit - pMinBar;
  const S = denominator <= 1e-4 ? 1.0 : Math.min(1.0, Math.max(0.0, (pPeak - pMinBar) / denominator));
  
  activeCase._scalingInfo = { S, pMinBar };
  console.log("getActiveCaseScalingInfo debug details:", {
    caseId: activeCase.id,
    pPeak,
    pUnmit,
    pMinBar,
    S
  });
  return activeCase._scalingInfo;
};

/**
 * Computes effective node data by layering active case node overrides and telemetry over baseline node data.
 */
export const getEffectiveNodeData = (node, cases = [], activeCaseId = 'case_base', telemetryMode = 'mitigated', scalingInfo = null) => {
  if (!node) return {};
  const activeCase = getActiveCase(cases, activeCaseId);
  let effective = { ...(node.data || {}) };

  if (activeCase && !activeCase.is_base && activeCase.overrides?.nodes?.[node.id]) {
    effective = {
      ...effective,
      ...activeCase.overrides.nodes[node.id]
    };
  }

  let caseTelemetry;
  if (telemetryMode === 'unmitigated_global') {
    caseTelemetry = activeCase?.telemetry_unmitigated?.nodes?.[node.id] || node.data?.telemetry;
  } else if (telemetryMode === 'peak') {
    const unmitNode = activeCase?.telemetry_unmitigated?.nodes?.[node.id] || node.data?.telemetry;
    const { S, pMinBar } = scalingInfo || getActiveCaseScalingInfo(activeCase);
    caseTelemetry = scaleTelemetryItem(unmitNode, S, pMinBar);
  } else {
    caseTelemetry = activeCase?.telemetry?.nodes?.[node.id] || node.data?.telemetry;
  }

  if (caseTelemetry) {
    effective.telemetry = caseTelemetry;
  }

  return effective;
};

/**
 * Computes effective edge data by layering active case edge telemetry over baseline edge data.
 */
export const getEffectiveEdgeData = (edge, cases = [], activeCaseId = 'case_base', telemetryMode = 'mitigated', scalingInfo = null) => {
  if (!edge) return {};
  const activeCase = getActiveCase(cases, activeCaseId);
  let effective = { ...(edge.data || {}) };

  let caseTelemetry;
  if (telemetryMode === 'unmitigated_global') {
    caseTelemetry = activeCase?.telemetry_unmitigated?.edges?.[edge.id] || edge.data?.telemetry;
  } else if (telemetryMode === 'peak') {
    const unmitEdge = activeCase?.telemetry_unmitigated?.edges?.[edge.id] || edge.data?.telemetry;
    const { S, pMinBar } = scalingInfo || getActiveCaseScalingInfo(activeCase);
    caseTelemetry = scaleTelemetryItem(unmitEdge, S, pMinBar);
  } else {
    caseTelemetry = activeCase?.telemetry?.edges?.[edge.id] || edge.data?.telemetry;
  }

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
 * Helper to determine if two values are equivalent, taking default values into account.
 */
export const areValuesEquivalent = (val1, val2, propKey) => {
  let resolvedVal1 = val1;
  let resolvedVal2 = val2;

  const getFallback = (k) => {
    if (k === 'active') return true;
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
