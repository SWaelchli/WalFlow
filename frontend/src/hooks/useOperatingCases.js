import { useState, useCallback } from 'react';
import { askName } from '../utils/dialogs';
import { DEFAULT_BASE_CASE } from '../constants/case_constants';
import { updateCaseTelemetry, updateCaseOverride, removeCaseOverride, duplicateCase } from '../utils/case_resolver';

/** Operating cases: list, active case, edits, overrides, and where solver results are stored. */
export function useOperatingCases({ nodes }) {
  // Operating Case Manager State
  const [cases, setCases] = useState([DEFAULT_BASE_CASE]);
  const [activeCaseId, setActiveCaseId] = useState('case_base');
  const [showCaseManager, setShowCaseManager] = useState(false);

  const handleAddCase = useCallback(async () => {
    const currentActiveCase = cases.find(c => c.id === activeCaseId) || cases[0] || DEFAULT_BASE_CASE;
    const name = await askName({
      title: 'New operating case',
      label: `Name (copies the settings of "${currentActiveCase.name}")`,
      initial: `Case ${cases.length + 1}`,
      confirmLabel: 'Create case',
    });
    if (!name) return;
    const newCase = duplicateCase(currentActiveCase, name);
    setCases(prev => [...prev, newCase]);
    setActiveCaseId(newCase.id);
  }, [cases, activeCaseId]);

  const handleRenameCase = useCallback((caseId, newName) => {
    setCases(prev => prev.map(c => c.id === caseId ? { ...c, name: newName } : c));
  }, []);

  const handleDeleteCase = useCallback((caseId) => {
    // The follow-up (new active case) is decided here, not inside the state updater
    const remaining = cases.filter(c => c.id !== caseId);
    setCases(remaining);
    if (activeCaseId === caseId) setActiveCaseId(remaining[0]?.id || 'case_base');
  }, [cases, activeCaseId]);

  const handleReorderCases = useCallback((fromIdx, toIdx) => {
    setCases(prev => {
      if (fromIdx <= 0 || toIdx <= 0 || fromIdx >= prev.length || toIdx >= prev.length) return prev;
      const newCases = [...prev];
      const [moved] = newCases.splice(fromIdx, 1);
      newCases.splice(toIdx, 0, moved);
      return newCases;
    });
  }, []);

  const handleResetCaseOverride = useCallback((nodeId, propKey) => {
    setCases(prev => removeCaseOverride(prev, activeCaseId, nodeId, propKey));
  }, [activeCaseId]);

  const handleSetCaseOverride = useCallback((caseId, nodeId, propKey, value) => {
    const nodeObj = nodes.find(n => n.id === nodeId);
    const baseValue = nodeObj?.data?.[propKey];
    setCases(prev => updateCaseOverride(prev, caseId, nodeId, propKey, value, baseValue));
  }, [nodes]);

  const [batchStats, setBatchStats] = useState(null);

  // Results from the solver (single run) and from the batch solve
  const handleUpdateCaseTelemetry = useCallback((targetCaseId, telemetry, kpis, telemetryUnmitigated, telemetryPeak, resultHash) => {
    setCases(prev => updateCaseTelemetry(prev, targetCaseId, telemetry, kpis, telemetryUnmitigated, telemetryPeak, resultHash));
  }, []);

  // inputHashes: { caseId: hash } of the inputs the batch was sent with (F2-07)
  const handleBatchResultsTelemetry = useCallback((batchResults, inputHashes = {}) => {
    setCases(prev => prev.map(c => {
      const match = batchResults.find(b => b.case_id === c.id);
      return (match && (match.telemetry || match.kpis)) 
        ? { 
            ...c, 
            telemetry: match.telemetry || c.telemetry, 
            telemetry_unmitigated: match.telemetry_unmitigated || c.telemetry_unmitigated,
            telemetry_peak: match.telemetry ? (match.telemetry_peak ?? null) : (c.telemetry_peak ?? null),
            kpis: match.kpis || c.kpis,
            result_hash: match.telemetry ? inputHashes[c.id] : c.result_hash
          } 
        : c;
    }));

    if (batchResults) {
      setBatchStats(batchResults.map(r => ({
        case_id: r.case_id,
        case_name: r.case_name,
        status: r.status,
        error_message: r.error_message,
        ...(r.stats || {})
      })));
    }
  }, []);

  return {
    cases, setCases, activeCaseId, setActiveCaseId, showCaseManager, setShowCaseManager,
    handleAddCase, handleRenameCase, handleDeleteCase, handleReorderCases, handleResetCaseOverride, handleSetCaseOverride,
    handleUpdateCaseTelemetry, batchStats, handleBatchResultsTelemetry,
  };
}

export default useOperatingCases;
