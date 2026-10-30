import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { confirmDialog } from '../../utils/dialogs';
import { componentLabel } from '../../constants/componentLabels';
import { NEUTRAL_TYPES } from '../../utils/networkValidation';
import { BOUNDARY_PORT_TYPES } from '../../utils/boundaryLayout';
import { neutralPorts, firstPiped, netPortFlow } from '../../utils/nodeReadouts';
import { PlusIcon, PlayIcon, ExportIcon, CaseIcon, TrashIcon, SpinnerIcon, ArrowUpIcon, ArrowDownIcon, SortIcon, WarningIcon, CheckIcon, DragHandleIcon, CrossIcon } from '../symbols/IconLibrary';
import { getScheduleStandardOptions, getScheduleDataset, listSchedules, scheduleLabel, DEFAULT_SCHEDULE_STANDARD } from '../../utils/pipe_schedules';
import { formatDnOption } from '../../utils/reducer_catalog';
import { useFittingStandards } from '../../hooks/useFittingStandards';

import { updateCaseOverride, effectiveForcedState } from '../../utils/case_resolver';
import { useUnits } from '../../context/UnitContext';
import { BAR_TO_PA, absPaToDisplayPressure, formatAbsPressureFromBar } from '../../utils/converters';
import { resolvePipeSelection, findPipeClass, manualSelectionPatch, classSelectionPatch, classSizePatch, schedulePatch, matchScheduleByInnerDiameter, nearestDnByInnerDiameter } from '../../utils/pipeDefaults';
import DraftNumberInput from '../common/DraftNumberInput';
import MeasurementsTable from './MeasurementsTable';
import { buildCsv, buildCsvFileName } from '../../utils/csvExport';
import usePanelHeight from '../../hooks/usePanelHeight';
import { toSolverGraph } from '../../utils/diagramFile';
import { computeCaseInputHashes, isCaseResultStale } from '../../utils/resultHash';


import { clickableProps, clickableRowProps } from '../../utils/a11yProps';
const autoSortLogic = (nodes, edges) => {
  const ordered = [];
  const visitedNodes = new Set();
  const visitedEdges = new Set();
  const inDegree = {};
  nodes.forEach(n => inDegree[n.id] = edges.filter(e => e.target === n.id).length);
  const reachedCount = {};
  nodes.forEach(n => reachedCount[n.id] = 0);
  const sources = nodes.filter(n => !edges.some(e => e.target === n.id));
  sources.sort((a, b) => a.position.y - b.position.y);

  const traverse = (nodeId) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    reachedCount[nodeId]++;
    if (inDegree[nodeId] > 1 && reachedCount[nodeId] < inDegree[nodeId]) return;
    if (visitedNodes.has(nodeId)) return;
    visitedNodes.add(nodeId);
    ordered.push({ type: 'node', id: nodeId });
    let outgoing = edges.filter(e => e.source === nodeId);
    outgoing.sort((a, b) => (a.sourceHandle || "outlet-0").localeCompare(b.sourceHandle || "outlet-0"));
    outgoing.forEach(edge => {
      if (!visitedEdges.has(edge.id)) {
        visitedEdges.add(edge.id);
        ordered.push({ type: 'edge', id: edge.id });
        traverse(edge.target);
      }
    });
  };
  sources.forEach(s => traverse(s.id));
  nodes.forEach(n => { if (!visitedNodes.has(n.id)) traverse(n.id); });
  edges.forEach(e => { if (!visitedEdges.has(e.id)) { ordered.push({ type: 'edge', id: e.id }); visitedEdges.add(e.id); } });
  return ordered;
};

function SortHeader({ label, sortKey, sortConfig, requestSort, align = 'left' }) {
  const isSorted = sortConfig.key === sortKey;
  return (
    <th {...clickableRowProps} onClick={() => requestSort(sortKey)} style={{ padding: '8px', cursor: 'pointer', textAlign: align, userSelect: 'none', backgroundColor: isSorted ? '#e2e8f0' : 'inherit', transition: 'background 0.2s' }}>
      {label}{' '}
      {isSorted
        ? (sortConfig.direction === 'asc' ? <ArrowUpIcon size={11} /> : <ArrowDownIcon size={11} />)
        : <SortIcon size={11} color="var(--color-text-muted)" />}
    </th>
  );
}

const formatDelta = (val, baseVal, unit = '') => {
  if (val === undefined || baseVal === undefined || val === null || baseVal === null) return null;
  const delta = val - baseVal;
  if (Math.abs(delta) < 1e-4) return null;
  const pct = baseVal !== 0 ? (delta / baseVal) * 100 : 0;
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toFixed(2)} ${unit} (${sign}${pct.toFixed(1)}%)`;
};

const calculateMaxPressureBar = (telemetry) => {
  if (!telemetry) return undefined;
  if (telemetry.kpis?.max_pressure_bar !== undefined) return telemetry.kpis.max_pressure_bar;
  let maxPa = 0;
  if (telemetry.nodes) {
    Object.values(telemetry.nodes).forEach(node => {
      (node.inlets || []).forEach(port => {
        if (typeof port.pressure === 'number' && port.pressure > maxPa) maxPa = port.pressure;
      });
      (node.outlets || []).forEach(port => {
        if (typeof port.pressure === 'number' && port.pressure > maxPa) maxPa = port.pressure;
      });
      (node.ports || []).forEach(port => {
        if (typeof port?.pressure === 'number' && port.pressure > maxPa) maxPa = port.pressure;
      });
    });
  }
  if (telemetry.edges) {
    Object.values(telemetry.edges).forEach(edge => {
      (edge.inlets || []).forEach(port => {
        if (typeof port.pressure === 'number' && port.pressure > maxPa) maxPa = port.pressure;
      });
      (edge.outlets || []).forEach(port => {
        if (typeof port.pressure === 'number' && port.pressure > maxPa) maxPa = port.pressure;
      });
    });
  }
  return maxPa > 0 ? maxPa / 100000.0 : undefined;
};

// Relief device result badge (status as text, colour is secondary)
const RELIEF_BADGES = {
  open: { color: '#B45309', bg: 'var(--color-warning-bg)', border: 'var(--color-warning-border)' },
  overcapacity: { color: 'var(--color-danger-text)', bg: '#FEF2F2', border: '#FEE2E2' },
  closed: { color: '#587071', bg: '#F4F7F6', border: '#D8E2E1' },
};

const reliefBadge = (result) => {
  if (result.forced_state === 'forced_closed') return { label: 'Forced closed', ...RELIEF_BADGES.closed };
  if (result.status === 'overcapacity') return { label: 'Overcapacity', ...RELIEF_BADGES.overcapacity };
  if (result.status === 'burst') return { label: 'Burst', ...RELIEF_BADGES.open };
  if (result.status === 'cycling') return { label: 'Cycling', ...RELIEF_BADGES.open, title: 'Pop valve oversized for this load: the inlet cycles between reseat and set pressure. The flow is the average relief load.' };
  if (result.status === 'modulating') return { label: result.lift_pct != null ? `Modulating ${Math.round(result.lift_pct)} %` : 'Modulating', ...RELIEF_BADGES.open };
  if (result.status === 'open' || result.status === 'cracked') return { label: result.forced_state === 'forced_open' ? 'Forced open' : 'Open', ...RELIEF_BADGES.open };
  return { label: 'Closed', ...RELIEF_BADGES.closed };
};

function ReliefDeviceResult({ result, hasResults, formatPressure, unit, formatPressureGauge, formatFlow, flowUnit }) {
  const muted = { fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)' };
  if (!hasResults) return <div style={{ ...muted, marginTop: '4px' }}>Run the simulation for results</div>;
  if (!result) return null;
  const badge = reliefBadge(result);
  const opens = result.inlet_at_opening_bara != null;
  const title = [
    opens
      ? `Opening #${result.opening_order}: inlet reaches the set pressure at ${result.opening_ramp_pct} % driver load. Final (relieved) inlet pressure and relief flow are at 100 % load.`
      : 'Inlet pressure in the final (relieved) state.',
    badge.title,
  ].filter(Boolean).join(' ');
  return (
    <div title={title} style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: 'var(--fs-xs)', fontWeight: '700', color: badge.color, background: badge.bg, border: `1px solid ${badge.border}`, padding: '1px 6px', borderRadius: '10px' }}>
          {badge.label}{result.opening_order ? ` #${result.opening_order}` : ''}
        </span>
        {opens && <span style={muted}>at {result.opening_ramp_pct} % load</span>}
      </div>
      <span style={{ ...muted, whiteSpace: 'nowrap' }}>
        {opens && `Opens ${formatPressure(result.inlet_at_opening_bara)} · `}
        Final {result.inlet_relieved_bara != null ? formatPressure(result.inlet_relieved_bara) : '—'} {unit}
      </span>
      {result.status === 'cycling' && result.cycle_low_barg != null && formatPressureGauge && (
        <span style={{ ...muted, whiteSpace: 'nowrap' }}>
          Cycles {formatPressureGauge(result.cycle_low_barg)}–{formatPressureGauge(result.cycle_high_barg)} · avg {formatFlow(result.relief_flow_lmin)} {flowUnit}
        </span>
      )}
      {result.bp_exceeded && (
        <span
          title={result.bp_basis === 'built_up' ? 'Built-up backpressure above 10 % of set (conventional valve)' : 'Total backpressure above 50 % of set (balanced bellows valve)'}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: 'var(--fs-xs)', fontWeight: '700', color: 'var(--color-danger-text)', whiteSpace: 'nowrap' }}
        >
          <WarningIcon size={11} color="var(--color-danger-text)" />
          BP {result.bp_pct_of_set.toFixed(0)} % &gt; {result.bp_limit_pct} %
        </span>
      )}
    </div>
  );
}

// A case has results once the solver has returned KPIs or telemetry for it

export default function DataList({
  nodes,
  edges,
  rawNodes,
  rawEdges,
  onUpdateEdge,
  onUpdateNode,
  onSelectNode,
  onSelectEdge,
  cases = [],
  activeCaseId = 'case_base',
  globalSettings = {},
  onSelectCase,
  onAddCase,
  onRenameCase,
  onDeleteCase,
  onReorderCases,
  onBatchResults,
  telemetryMode = 'mitigated',
  telemetryUnmitigated,
  caseInputHashes = {},
  onSetCaseOverride,
  runSimulation,
  showCaseManager = true,
  onToggleCaseManager,
  availablePipeClasses = [],
  allowCustomPipes = true
}) {
  const { labels, isImperial, unitSystem, pressureBasis, lminToDisplay, formatPressure, formatDiffPressure, formatPressureGauge, formatFlow, formatFlowM3s, formatPower, formatTemperatureK, formatVelocity } = useUnits();

  const classList = availablePipeClasses || [];

  // Each case converts absolute pressures with its own site atmospheric pressure, so case deltas do not depend on the active case
  const caseAtmPa = (c) => c?.overrides?.global_settings?.atmospheric_pressure ?? globalSettings?.atmospheric_pressure;
  const caseFormatPressure = (c) => (valBar, decimals = 2) => formatAbsPressureFromBar(valBar, unitSystem, pressureBasis, caseAtmPa(c), decimals);
  const caseDisplayPressure = (c, valBar) => absPaToDisplayPressure(valBar === undefined || valBar === null ? null : valBar * BAR_TO_PA, { unitSystem, basis: pressureBasis, atmPa: caseAtmPa(c) });



  const [activeTab, setActiveTab] = useState('pipes');
  const scheduleOptions = getScheduleStandardOptions(useFittingStandards('pipe_schedule'));
  const panel = usePanelHeight('walflow_datalist_panel');

  const [manualOrder, setManualOrder] = useState([]);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [filterText, setFilterText] = useState("");
  
  const [draggedIdx, setDraggedIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [isEditing, setIsEditing] = useState(false);

  // Column drag and drop state for Operating Cases Matrix
  const [caseDragIdx, setCaseDragIdx] = useState(null);
  const [caseDragOverIdx, setCaseDragOverIdx] = useState(null);

  // Multi-Case Batch Matrix State
  const [batchResults, setBatchResults] = useState(null);
  const [isBatchLoading, setIsBatchLoading] = useState(false);
  const [batchError, setBatchError] = useState(null);

  // A caller that has just changed cases or nodes passes them in; the props still hold the previous state
  const fetchBatchSimulations = useCallback(async (next = {}) => {
    setIsBatchLoading(true);
    setBatchError(null);
    try {
      const baseNodes = next.nodes || rawNodes || nodes;
      const baseEdges = rawEdges || edges;
      const batchCases = next.cases || cases;
      const payload = toSolverGraph({
        nodes: baseNodes,
        edges: baseEdges,
        globalSettings,
        cases: batchCases,
        activeCaseId
      });
      // Results are tagged with the inputs they are solved from
      const inputHashes = computeCaseInputHashes({ nodes: baseNodes, edges: baseEdges, globalSettings, cases: batchCases });
      const response = await fetch('/api/simulation/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        throw new Error(`Batch server error (${response.status})`);
      }
      const data = await response.json();
      const resList = data.results || [];
      setBatchResults(resList);
      if (onBatchResults) {
        onBatchResults(resList, inputHashes);
      }
    } catch (err) {
      console.error("Batch simulation failed:", err);
      setBatchError(err.message || 'Failed to run batch simulation');
    } finally {
      setIsBatchLoading(false);
    }
  }, [nodes, edges, rawNodes, rawEdges, globalSettings, cases, activeCaseId, onBatchResults]);

  const displayCases = useMemo(() => {
    if (!cases || cases.length === 0) return [];
    
    return cases.map(c => {
      const batchMatch = batchResults?.find(b => b.case_id === c.id);
      return {
        ...c,
        case_id: c.id,
        case_name: c.name,
        telemetry: c.telemetry || batchMatch?.telemetry,
        telemetry_unmitigated: c.telemetry_unmitigated || batchMatch?.telemetry_unmitigated,
        telemetry_peak: c.telemetry ? c.telemetry_peak : batchMatch?.telemetry_peak,
        kpis: c.kpis || batchMatch?.kpis
      };
    });
  }, [cases, batchResults]);


  const onCaseDragStart = (e, colIdx) => {
    if (colIdx === 0) return; // Base Case cannot be dragged
    setCaseDragIdx(colIdx);
    e.dataTransfer.effectAllowed = "move";
    const img = new Image();
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    e.dataTransfer.setDragImage(img, 0, 0);
  };

  const onCaseDragOver = (e, colIdx) => {
    e.preventDefault();
    if (colIdx === 0 || caseDragIdx === null || caseDragIdx === colIdx) return;
    setCaseDragOverIdx(colIdx);
  };

  const onCaseDrop = (e, colIdx) => {
    e.preventDefault();
    if (colIdx !== 0 && caseDragIdx !== null && caseDragIdx !== colIdx && onReorderCases) {
      onReorderCases(caseDragIdx, colIdx);
    }
    setCaseDragIdx(null);
    setCaseDragOverIdx(null);
  };

  useEffect(() => {
    setManualOrder(prev => {
      const currentIds = new Set([...nodes.map(n => n.id), ...edges.map(e => e.id)]);
      let newOrder = prev.filter(item => currentIds.has(item.id));
      const existingIds = new Set(newOrder.map(item => item.id));
      nodes.forEach(n => { if (!existingIds.has(n.id)) newOrder.push({ type: 'node', id: n.id }); });
      edges.forEach(e => { if (!existingIds.has(e.id)) newOrder.push({ type: 'edge', id: e.id }); });
      if (prev.length === 0 && newOrder.length > 0) return autoSortLogic(nodes, edges);
      return newOrder;
    });
  }, [nodes, edges]);
  const reliefDevices = useMemo(() => {
    return (rawNodes || nodes || []).filter(
      n => n.type === 'pressure_safety_valve' || n.type === 'psv' || n.type === 'rupture_disc'
    );
  }, [rawNodes, nodes]);

  const reliefDeviceLabel = useCallback(
    (id) => reliefDevices.find(d => d.id === id)?.data?.label || id,
    [reliefDevices]
  );

  const [pendingRerun, setPendingRerun] = useState(null);   // active-case re-run waiting for the new state

  const handleMatrixForcedStateChange = useCallback((caseId, nodeId, value) => {
    const targetCase = displayCases.find(c => (c.id || c.case_id) === caseId);
    if (!targetCase) return;

    let nextCases = cases;
    let nextNodes = rawNodes || nodes;

    if (targetCase.is_base) {
      if (onUpdateNode) {
        onUpdateNode(nodeId, { forced_state: value }, caseId);
      }
      nextNodes = (rawNodes || nodes || []).map(n => n.id === nodeId ? { ...n, data: { ...n.data, forced_state: value } } : n);
    } else {
      const nodeObj = (rawNodes || nodes || []).find(n => n.id === nodeId);
      const baseValue = nodeObj?.data?.forced_state;
      if (onSetCaseOverride) {
        onSetCaseOverride(caseId, nodeId, 'forced_state', value);
      }
      nextCases = updateCaseOverride(cases, caseId, nodeId, 'forced_state', value, baseValue);
    }

    fetchBatchSimulations({ cases: nextCases, nodes: nextNodes });

    // The active case is re-run once the new state has reached the props (and with it runSimulation's graph)
    if (caseId === activeCaseId && runSimulation) {
      setPendingRerun({ caseId, nodeId, value });
    }
  }, [displayCases, cases, nodes, rawNodes, onUpdateNode, onSetCaseOverride, fetchBatchSimulations, activeCaseId, runSimulation]);

  useEffect(() => {
    if (!pendingRerun || !runSimulation) return;
    const { caseId, nodeId, value } = pendingRerun;
    if (effectiveForcedState(cases, rawNodes || nodes, caseId, nodeId) !== value) return;
    setPendingRerun(null);
    runSimulation();
  }, [pendingRerun, cases, rawNodes, nodes, runSimulation]);

  const handleAutoSortClick = () => {
    const newOrder = autoSortLogic(nodes, edges);
    setManualOrder(newOrder);
    setSortConfig({ key: null, direction: 'asc' });
  };

  const moveItem = (fromIdx, toIdx) => {
    const newOrder = [...manualOrder];
    const [moved] = newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, moved);
    setManualOrder(newOrder);
  };

  const onDragStart = (e, index) => {
    setDraggedIdx(index);
    e.dataTransfer.effectAllowed = "move";
    const img = new Image();
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    e.dataTransfer.setDragImage(img, 0, 0);
  };

  const onDragOver = (e, index) => {
    e.preventDefault();
    if (draggedIdx === index) return;
    setDragOverIdx(index);
  };

  const onDrop = (e, index) => {
    e.preventDefault();
    if (draggedIdx !== null) moveItem(draggedIdx, index);
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  const handleRowClick = (entry) => {
    if (entry.type === 'node') onSelectNode(entry.id);
    else onSelectEdge(entry.id);
  };

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key) {
      if (sortConfig.direction === 'asc') direction = 'desc';
      else if (sortConfig.direction === 'desc') {
        setSortConfig({ key: null, direction: 'asc' });
        return;
      }
    }
    setSortConfig({ key, direction });
  };

  const processedItems = useMemo(() => {
    const filterType = activeTab === 'pipes' ? 'edge' : 'all';
    
    // Filter manualOrder to exclude any items that are SIGNAL edges
    let items = manualOrder.map((ref, index) => {
      if (ref.type === 'node') {
        const node = nodes.find(n => n.id === ref.id);
        if (!node || node.type === 'text_bubble' || node.type === 'note') return null;
        // Missing results stay null and show as "—", never as 0 bar / 20 °C
        const telemetry = node.data?.telemetry;
        // Two-port components list their upstream port first
        const neutral = NEUTRAL_TYPES.has(node.type) ? neutralPorts(telemetry) : null;
        // Tank and boundaries report per port: the first piped port stands for the node, flow is the net exchange
        const isBoundary = BOUNDARY_PORT_TYPES.has(node.type);
        const bPort = isBoundary ? firstPiped(telemetry) : null;
        const bNet = isBoundary ? netPortFlow(telemetry) : null;
        const pStart = (isBoundary ? bPort : neutral ? neutral.up : telemetry?.inlets?.[0])?.pressure ?? null;
        const pEnd = (isBoundary ? bPort : neutral ? neutral.down : telemetry?.outlets?.[0])?.pressure ?? null;
        return {
          ...ref, originalIndex: index, item: node, label: node.data.label || node.id,
          displayType: componentLabel(node.type),
          flow: isBoundary ? (bNet != null ? Math.abs(bNet) : null) : neutral ? neutral.flow : (telemetry?.outlets?.[0]?.flow_rate ?? null),
          dp: pStart != null && pEnd != null ? Math.abs(pStart - pEnd) / 100000 : null,
          pStart: pStart != null ? pStart / 100000 : null,
          pEnd: pEnd != null ? pEnd / 100000 : null,
          temp: isBoundary ? (bPort?.temperature ?? null) : neutral ? (neutral.down.temperature ?? null) : (telemetry?.outlets?.[0]?.temperature ?? telemetry?.inlets?.[0]?.temperature ?? null),
          length: 0,
          velocity: null
        };
      } else {
        const edge = edges.find(e => e.id === ref.id);
        if (!edge) return null;
        
        // EXCLUDE SIGNALS
        if (edge.data?.type === 'SIGNAL') return null;

        const telemetry = edge.data?.telemetry;
        const pStart = telemetry?.inlets?.[0]?.pressure ?? null;
        const pEnd = telemetry?.outlets?.[0]?.pressure ?? null;
        const flow = telemetry?.outlets?.[0]?.flow_rate ?? null;
        const diaValue = edge.data.diameter_m || 0.1;
        const area = Math.PI * Math.pow(diaValue, 2) / 4;
        return {
          ...ref, originalIndex: index, item: edge, label: edge.data.label || edge.id, displayType: 'Pipe',
          flow: flow, dp: pStart != null && pEnd != null ? Math.abs(pStart - pEnd) / 100000 : null,
          pStart: pStart != null ? pStart / 100000 : null, pEnd: pEnd != null ? pEnd / 100000 : null,
          temp: telemetry?.outlets?.[0]?.temperature ?? telemetry?.inlets?.[0]?.temperature ?? null,
          velocity: flow != null && area > 0 ? flow / area : null,
          length: edge.data.length_m || 0
        };
      }
    }).filter(i => i !== null && (filterType === 'all' || i.type === filterType));

    if (filterText) {
      const lower = filterText.toLowerCase();
      items = items.filter(i => i.label.toLowerCase().includes(lower) || i.displayType.toLowerCase().includes(lower));
    }
    if (sortConfig.key) {
      const dir = sortConfig.direction === 'asc' ? 1 : -1;
      items.sort((a, b) => {
        const av = a[sortConfig.key];
        const bv = b[sortConfig.key];
        // Rows without a value sort last in either direction
        if (av == null || bv == null) return av == null && bv == null ? 0 : (av == null ? 1 : -1);
        if (typeof av === 'string' && typeof bv === 'string') {
          return dir * av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' });
        }
        if (av < bv) return -dir;
        if (av > bv) return dir;
        return 0;
      });
    }
    return items;
  }, [manualOrder, nodes, edges, activeTab, filterText, sortConfig]);

  const selectTab = (tab) => {
    if (panel.collapsed) panel.setCollapsed(false);
    setActiveTab(tab);
    setSortConfig({ key: null, direction: 'asc' });
  };

  const exportCSV = useCallback(() => {
    const headers = ["Type", "Name", `Flow (${labels.flow})`, `Velocity (${labels.velocity})`, `ΔP (${labels.pressureDiff})`, `P Start (${labels.pressureAbs})`, `P End (${labels.pressureAbs})`, `Temp (${labels.temperature})`];
    if (activeTab === 'pipes') headers.push(`Length (${labels.length})`);
    const rows = processedItems.map(i => {
      const lenDisplay = isImperial ? (i.length * 3.280839895).toFixed(2) : i.length;
      const row = [i.displayType, i.label, formatFlowM3s(i.flow), formatVelocity(i.velocity), formatDiffPressure(i.dp, 3), formatPressure(i.pStart), formatPressure(i.pEnd), formatTemperatureK(i.temp)];
      if (activeTab === 'pipes') row.push(lenDisplay);
      return row;
    });
    const blob = new Blob([buildCsv(headers, rows)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url); link.setAttribute("download", buildCsvFileName(cases.find(c => c.id === activeCaseId)?.name, activeTab)); link.click();
    URL.revokeObjectURL(url);
  }, [processedItems, activeTab, cases, activeCaseId, labels, isImperial, formatFlowM3s, formatVelocity, formatPressure, formatDiffPressure, formatTemperatureK]);

  return (
    <div style={{ height: `${panel.height}px`, flexShrink: 0, background: '#ffffff', borderTop: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 -4px 16px rgba(57, 82, 83, 0.05)', position: 'relative' }}>
      {!panel.collapsed && (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize data panel"
          aria-valuenow={panel.height}
          tabIndex={0}
          onPointerDown={panel.startDrag}
          onKeyDown={panel.onKeyDown}
          className="panel-resize-handle"
          title="Drag to resize (or use the arrow keys)"
        />
      )}
      <div style={{ display: 'flex', background: 'var(--color-surface-hover)', borderBottom: '1px solid var(--color-border)', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px' }}>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => panel.setCollapsed(!panel.collapsed)}
            aria-label={panel.collapsed ? 'Expand data panel' : 'Collapse data panel'}
            aria-expanded={!panel.collapsed}
            title={panel.collapsed ? 'Expand data panel' : 'Collapse data panel'}
            className="panel-collapse-btn"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
              style={{ transform: panel.collapsed ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}>
              <path d="M3 6l5 5 5-5" />
            </svg>
          </button>
          <button onClick={() => selectTab('pipes')}
            className={`datalist-tab ${activeTab === 'pipes' ? 'active' : ''}`}
          >
            Pipe Network List
          </button>
          <button onClick={() => selectTab('all')}
            className={`datalist-tab ${activeTab === 'all' ? 'active' : ''}`}
          >
            Full Equipment & Pipeline Data
          </button>
          <button onClick={() => selectTab('cases')}
            className={`datalist-tab ${activeTab === 'cases' ? 'active' : ''}`}
          >
            Operating Cases Matrix
          </button>
          <button onClick={() => selectTab('relief')}
            className={`datalist-tab ${activeTab === 'relief' ? 'active' : ''}`}
          >
            Relief Analysis Matrix
          </button>
          <button onClick={() => selectTab('measurements')}
            className={`datalist-tab ${activeTab === 'measurements' ? 'active' : ''}`}
          >
            Measurements
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {activeTab === 'cases' ? (
            <div style={{ display: 'flex', gap: '8px' }}>
              {onAddCase && (
                <button
                  onClick={onAddCase}
                  className="btn-secondary btn-compact"
                >
                  <PlusIcon size={14} style={{ marginRight: '6px' }} /> New case
                </button>
              )}
              <button
                onClick={onToggleCaseManager}
                className={showCaseManager ? "btn-secondary btn-active btn-compact" : "btn-secondary btn-compact"}
                aria-pressed={showCaseManager}
              >
                <CaseIcon size={14} style={{ marginRight: '6px' }} /> {showCaseManager ? 'Hide case manager' : 'Case manager'}
              </button>
              <button
                onClick={() => fetchBatchSimulations()}
                disabled={isBatchLoading}
                className="btn-primary btn-compact"
              >
                <PlayIcon size={14} style={{ marginRight: '6px' }} /> {isBatchLoading ? 'Solving cases…' : 'Solve all cases'}
              </button>
            </div>
          ) : activeTab === 'measurements' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0' }}>
              <button
                onClick={onToggleCaseManager}
                className={showCaseManager ? "btn-secondary btn-active btn-compact" : "btn-secondary btn-compact"}
                aria-pressed={showCaseManager}
              >
                <CaseIcon size={14} style={{ marginRight: '6px' }} /> {showCaseManager ? 'Hide case manager' : 'Case manager'}
              </button>
              <button
                onClick={() => fetchBatchSimulations()}
                disabled={isBatchLoading}
                className="btn-primary btn-compact"
              >
                <PlayIcon size={14} style={{ marginRight: '6px' }} /> {isBatchLoading ? 'Solving cases…' : 'Solve all cases'}
              </button>
            </div>
          ) : activeTab === 'relief' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '6px 0' }}>
              <button
                onClick={onToggleCaseManager}
                className={showCaseManager ? "btn-secondary btn-active btn-compact" : "btn-secondary btn-compact"}
                aria-pressed={showCaseManager}
              >
                <CaseIcon size={14} style={{ marginRight: '6px' }} /> {showCaseManager ? 'Hide case manager' : 'Case manager'}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input 
                  type="text" 
                  placeholder="Filter list…"
                  aria-label="Filter list" 
                  value={filterText} 
                  onChange={(e) => setFilterText(e.target.value)}
                  className="form-input"
                  style={{ width: '160px' }} 
                />
                {filterText && <button onClick={() => setFilterText("")} aria-label="Clear filter" title="Clear filter" style={{ position:'absolute', right:5, top:'50%', transform:'translateY(-50%)', border:'none', background:'none', cursor:'pointer', color:'var(--color-text-secondary)', display: 'inline-flex' }}><CrossIcon size={12} /></button>}
              </div>
              <button 
                onClick={handleAutoSortClick} 
                className="btn-secondary btn-compact"
              >
                Auto sort
              </button>
              <button 
                onClick={exportCSV} 
                className="btn-secondary btn-compact"
              >
                <ExportIcon size={14} style={{ marginRight: '6px' }} /> Export CSV
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="matrix-scroll-container" style={{ flexGrow: 1, overflowY: 'auto', overflowX: 'auto', maxWidth: '100%', display: 'block' }}>
        {activeTab === 'cases' ? (
          <div style={{ display: 'inline-block', minWidth: '100%', boxSizing: 'border-box', verticalAlign: 'top' }}>
            {isBatchLoading ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-text-secondary)', fontSize: 'var(--fs-base)', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <SpinnerIcon size={14} color="var(--color-text-secondary)" /> Running batch simulations across all operating cases...
              </div>
            ) : batchError ? (
              <div style={{ padding: '16px', color: 'var(--color-danger-text)', background: '#fef2f2', borderRadius: '8px', border: '1px solid #fee2e2' }}>
                <strong>Batch Simulation Error:</strong> {batchError}
              </div>
            ) : (
              <table style={{ width: '100%', height: 'max-content', borderCollapse: 'collapse', fontSize: 'var(--fs-xs)', textAlign: 'left', tableLayout: 'auto' }}>
                <thead>
                  <tr style={{ background: 'var(--color-border-hover)', borderBottom: '2px solid var(--color-border)', color: 'var(--color-brand-dark)', fontWeight: '700', height: '40px' }}>
                    <th style={{ padding: '6px 12px', verticalAlign: 'middle', width: '200px', minWidth: '200px', maxWidth: '200px', whiteSpace: 'nowrap' }}>Performance Metric</th>
                    {displayCases.map((c, colIdx) => {
                      const caseId = c.case_id || c.id;
                      const caseName = c.case_name || c.name || '';
                      const isBase = c.is_base;
                      const isActive = caseId === activeCaseId;
                      const inputWidth = Math.max(65, Math.min(220, (caseName.length || 6) * 8 + 14));

                      return (
                        <th 
                          key={caseId} 
                          draggable={!isBase}
                          onDragStart={(e) => onCaseDragStart(e, colIdx)}
                          onDragOver={(e) => onCaseDragOver(e, colIdx)}
                          onDrop={(e) => onCaseDrop(e, colIdx)}
                          style={{ 
                            padding: '6px 12px', 
                            background: isActive ? '#fff7ed' : 'inherit', 
                            borderLeft: caseDragOverIdx === colIdx ? '3px solid var(--color-primary)' : '1px solid var(--color-border)',
                            opacity: caseDragIdx === colIdx ? 0.5 : 1,
                            cursor: isBase ? 'default' : 'grab',
                            verticalAlign: 'middle',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'nowrap', whiteSpace: 'nowrap' }}>
                            {!isBase && (
                              <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-muted)', cursor: 'grab', userSelect: 'none' }} title="Drag column to reorder">
                                ⋮⋮
                              </span>
                            )}
                            <input 
                              aria-label="Case name"
                              style={{ 
                                width: `${inputWidth}px`, 
                                fontSize: 'var(--fs-xs)', 
                                border: '1px solid var(--color-border)', 
                                padding: '3px 6px', 
                                borderRadius: '5px', 
                                fontWeight: '700', 
                                color: isActive ? 'var(--color-primary)' : 'var(--color-text-primary)', 
                                outline: 'none', 
                                background: '#ffffff',
                                transition: 'width 0.15s ease'
                              }}
                              value={caseName} 
                              onChange={(e) => onRenameCase && onRenameCase(caseId, e.target.value)}
                              onPointerDown={(e) => e.stopPropagation()} 
                              onMouseDown={(e) => e.stopPropagation()}
                            />
                            {isBase && <span style={{ fontSize: 'var(--fs-xs)', fontWeight: '800', color: 'var(--color-brand-dark)' }}>(Base)</span>}
                            {!isActive && onSelectCase && (
                              <button
                                onClick={() => onSelectCase(caseId)}
                                style={{ padding: '2px 6px', fontSize: 'var(--fs-xs)', borderRadius: '4px', border: '1px solid var(--color-border)', background: '#ffffff', cursor: 'pointer', color: 'var(--color-brand-dark)', fontWeight: '600', whiteSpace: 'nowrap' }}
                              >
                                Switch
                              </button>
                            )}
                            {!isBase && onDeleteCase && (
                              <button aria-label="Delete this operating case"
                                onClick={async () => {
                                  const ok = await confirmDialog({
                                    title: 'Delete case?',
                                    message: `Delete case "${caseName}"?`,
                                    confirmLabel: 'Delete',
                                    danger: true,
                                  });
                                  if (ok) onDeleteCase(caseId);
                                }}
                                title="Delete this operating case"
                                style={{ padding: '2px 6px', fontSize: 'var(--fs-xs)', borderRadius: '4px', border: '1px solid #fee2e2', background: '#fef2f2', cursor: 'pointer', color: 'var(--color-danger-text)', fontWeight: '600', whiteSpace: 'nowrap' }}
                              >
                                <TrashIcon size={12} style={{ color: 'var(--color-danger-text)' }} />
                              </button>
                            )}
                            {isActive && <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-primary-text)', fontWeight: 'bold' }}>Active</span>}
                            {isCaseResultStale(c, caseInputHashes) && (
                              <span title="The diagram changed since this case was solved. Run the simulation again." style={{ fontSize: 'var(--fs-xs)', fontWeight: '700', color: '#7A3E00', background: '#FFF7ED', border: '1px solid #FDE3C3', padding: '1px 6px', borderRadius: '10px', whiteSpace: 'nowrap' }}>Out of date</span>
                            )}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {/* Max Pressure */}
                  <tr style={{ borderBottom: '1px solid var(--color-border-hover)', height: '36px' }}>
                    <td style={{ padding: '6px 12px', fontWeight: '700', color: 'var(--color-text-primary)', verticalAlign: 'middle', width: '200px', minWidth: '200px', maxWidth: '200px', whiteSpace: 'nowrap' }}>System Max Pressure ({labels.pressureAbs})</td>
                    {displayCases.map((c, colIdx) => {
                      const baseKpis = displayCases.find(b => b.is_base)?.kpis;
                      const kpis = c.kpis || {};
                      const val = kpis.max_pressure_bar;
                      const deltaStr = !c.is_base && baseKpis ? formatDelta(caseDisplayPressure(c, val), caseDisplayPressure(displayCases.find(b => b.is_base), baseKpis.max_pressure_bar), labels.pressureDiff) : null;
                      return (
                        <td key={c.case_id || c.id} style={{ padding: '6px 12px', borderLeft: caseDragOverIdx === colIdx ? '3px solid var(--color-primary)' : '1px solid var(--color-border)', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                          <span style={{ fontWeight: '700', color: 'var(--color-text-primary)' }}>{val !== undefined ? `${caseFormatPressure(c)(val)} ${labels.pressureAbs}` : '—'}</span>
                          {deltaStr && <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-warning-text)', marginLeft: '8px' }}>{deltaStr}</span>}
                        </td>
                      );
                    })}
                  </tr>
                  {/* Min Pressure */}
                  <tr style={{ borderBottom: '1px solid var(--color-border-hover)', background: '#F8FAFA', height: '36px' }}>
                    <td style={{ padding: '6px 12px', fontWeight: '700', color: 'var(--color-text-primary)', verticalAlign: 'middle', width: '200px', minWidth: '200px', maxWidth: '200px', whiteSpace: 'nowrap' }}>System Min Pressure ({labels.pressureAbs})</td>
                    {displayCases.map((c, colIdx) => {
                      const baseKpis = displayCases.find(b => b.is_base)?.kpis;
                      const kpis = c.kpis || {};
                      const val = kpis.min_pressure_bar;
                      const deltaStr = !c.is_base && baseKpis ? formatDelta(caseDisplayPressure(c, val), caseDisplayPressure(displayCases.find(b => b.is_base), baseKpis.min_pressure_bar), labels.pressureDiff) : null;
                      return (
                        <td key={c.case_id || c.id} style={{ padding: '6px 12px', borderLeft: caseDragOverIdx === colIdx ? '3px solid var(--color-primary)' : '1px solid var(--color-border)', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                          <span style={{ fontWeight: '700', color: 'var(--color-text-primary)' }}>{val !== undefined ? `${caseFormatPressure(c)(val)} ${labels.pressureAbs}` : '—'}</span>
                          {deltaStr && <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-warning-text)', marginLeft: '8px' }}>{deltaStr}</span>}
                        </td>
                      );
                    })}
                  </tr>
                  {/* Total Pump Flow */}
                  <tr style={{ borderBottom: '1px solid var(--color-border-hover)', height: '36px' }}>
                    <td style={{ padding: '6px 12px', fontWeight: '700', color: 'var(--color-text-primary)', verticalAlign: 'middle', width: '200px', minWidth: '200px', maxWidth: '200px', whiteSpace: 'nowrap' }}>Total Pump Flow ({labels.flow})</td>
                    {displayCases.map((c, colIdx) => {
                      const baseKpis = displayCases.find(b => b.is_base)?.kpis;
                      const kpis = c.kpis || {};
                      const val = kpis.total_flow_lmin;
                      const deltaStr = !c.is_base && baseKpis ? formatDelta(lminToDisplay(val), lminToDisplay(baseKpis.total_flow_lmin), labels.flow) : null;
                      return (
                        <td key={c.case_id || c.id} style={{ padding: '6px 12px', borderLeft: caseDragOverIdx === colIdx ? '3px solid var(--color-primary)' : '1px solid var(--color-border)', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                          <span style={{ fontWeight: '700', color: 'var(--color-text-primary)' }}>{val !== undefined ? `${formatFlow(val)} ${labels.flow}` : '—'}</span>
                          {deltaStr && <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-warning-text)', marginLeft: '8px' }}>{deltaStr}</span>}
                        </td>
                      );
                    })}
                  </tr>
                  {/* Total Pump Power */}
                  <tr style={{ borderBottom: '1px solid var(--color-border-hover)', background: '#F8FAFA', height: '36px' }}>
                    <td style={{ padding: '6px 12px', fontWeight: '700', color: 'var(--color-text-primary)', verticalAlign: 'middle', width: '200px', minWidth: '200px', maxWidth: '200px', whiteSpace: 'nowrap' }}>Total Pump Power ({labels.power})</td>
                    {displayCases.map((c, colIdx) => {
                      const baseKpis = displayCases.find(b => b.is_base)?.kpis;
                      const kpis = c.kpis || {};
                      const val = kpis.total_pump_power_kw;
                      const deltaStr = !c.is_base && baseKpis ? formatDelta(isImperial ? val * 1.34102209 : val, isImperial ? baseKpis.total_pump_power_kw * 1.34102209 : baseKpis.total_pump_power_kw, labels.power) : null;
                      return (
                        <td key={c.case_id || c.id} style={{ padding: '6px 12px', borderLeft: caseDragOverIdx === colIdx ? '3px solid var(--color-primary)' : '1px solid var(--color-border)', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                          <span style={{ fontWeight: '700', color: 'var(--color-text-primary)' }}>{val !== undefined ? `${formatPower(val)} ${labels.power}` : '—'}</span>
                          {deltaStr && <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-warning-text)', marginLeft: '8px' }}>{deltaStr}</span>}
                        </td>
                      );
                    })}
                  </tr>
                  {/* Cavitation Warning */}
                  <tr style={{ borderBottom: '1px solid var(--color-border-hover)', height: '36px' }}>
                    <td style={{ padding: '6px 12px', fontWeight: '700', color: 'var(--color-text-primary)', verticalAlign: 'middle', width: '200px', minWidth: '200px', maxWidth: '200px', whiteSpace: 'nowrap' }}>Cavitation Risk Status</td>
                    {displayCases.map((c, colIdx) => {
                      const hasCav = c.kpis?.has_cavitation_warning;
                      return (
                        <td key={c.case_id || c.id} style={{ padding: '6px 12px', borderLeft: caseDragOverIdx === colIdx ? '3px solid var(--color-primary)' : '1px solid var(--color-border)', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                          {!c.kpis ? (
                            <span style={{ fontWeight: '700', color: 'var(--color-text-primary)' }}>—</span>
                          ) : hasCav ? (
                            <span style={{ fontSize: 'var(--fs-xs)', fontWeight: '700', color: 'var(--color-danger-text)', background: '#fef2f2', padding: '2px 8px', borderRadius: '10px', border: '1px solid #fee2e2' }}>
                              <WarningIcon size={11} style={{ marginRight: '3px', verticalAlign: '-1px' }} />Cavitation risk
                            </span>
                          ) : (
                            <span style={{ fontSize: 'var(--fs-xs)', fontWeight: '700', color: '#166534', background: '#f0fdf4', padding: '2px 8px', borderRadius: '10px', border: '1px solid #dcfce7' }}>
                              <CheckIcon size={11} style={{ marginRight: '3px', verticalAlign: '-1px' }} />Normal
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        ) : activeTab === 'measurements' ? (
          <div style={{ display: 'inline-block', minWidth: '100%', boxSizing: 'border-box', verticalAlign: 'top' }}>
            {batchError && (
              <div style={{ margin: '8px 12px', padding: '8px 12px', color: 'var(--color-danger-text)', background: '#fef2f2', borderRadius: '8px', border: '1px solid #fee2e2' }}>
                <strong>Batch Simulation Error:</strong> {batchError}
              </div>
            )}
            <MeasurementsTable
              nodes={rawNodes || nodes}
              edges={rawEdges || edges}
              cases={displayCases}
              activeCaseId={activeCaseId}
              onSelectCase={onSelectCase}
              onSelectNode={onSelectNode}
              onUpdateNode={onUpdateNode}
              caseInputHashes={caseInputHashes}
              telemetryMode={telemetryMode}
              globalSettings={globalSettings}
              isImperial={isImperial}
            />
          </div>
        ) : activeTab === 'relief' ? (
          <div style={{ display: 'inline-block', minWidth: '100%', boxSizing: 'border-box', verticalAlign: 'top' }}>
            {reliefDevices.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-text-secondary)', fontSize: 'var(--fs-base)', fontWeight: '600' }}>
                ℹ No Pressure Safety Valves or Rupture Discs in the current diagram. Drag a PSV or Rupture Disc from the sidebar onto the canvas to enable relief contingency analysis.
              </div>
            ) : (
              <table style={{ width: '100%', height: 'max-content', borderCollapse: 'collapse', fontSize: 'var(--fs-xs)', textAlign: 'left', tableLayout: 'auto' }}>
                <thead>
                  <tr style={{ background: 'var(--color-border-hover)', borderBottom: '2px solid var(--color-border)', color: 'var(--color-brand-dark)', fontWeight: '700', height: '40px' }}>
                    <th style={{ padding: '6px 12px', verticalAlign: 'middle', width: '180px', minWidth: '180px', whiteSpace: 'nowrap' }}>Relief Equipment Tag</th>
                    <th style={{ padding: '6px 12px', verticalAlign: 'middle', width: '140px', minWidth: '140px', whiteSpace: 'nowrap' }}>Equipment Type</th>
                    <th style={{ padding: '6px 12px', verticalAlign: 'middle', width: '120px', minWidth: '120px', whiteSpace: 'nowrap' }}>Set / Burst Rating</th>
                    {displayCases.map(c => {
                      const caseId = c.id || c.case_id;
                      const isActive = caseId === activeCaseId;
                      return (
                        <th key={caseId} style={{ padding: '6px 12px', verticalAlign: 'middle', minWidth: '160px', background: isActive ? '#fff7ed' : 'inherit', borderLeft: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'nowrap', whiteSpace: 'nowrap' }}>
                            <span>{c.name || c.case_name} {c.is_base ? '(Base)' : ''}</span>
                            {!isActive && onSelectCase && (
                              <button
                                onClick={() => onSelectCase(caseId)}
                                style={{ padding: '2px 6px', fontSize: 'var(--fs-xs)', borderRadius: '4px', border: '1px solid var(--color-border)', background: '#ffffff', cursor: 'pointer', color: 'var(--color-brand-dark)', fontWeight: '600', whiteSpace: 'nowrap' }}
                              >
                                Switch
                              </button>
                            )}
                            {isActive && <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-primary-text)', fontWeight: 'bold' }}>Active</span>}
                            {isCaseResultStale(c, caseInputHashes) && (
                              <span title="The diagram changed since this case was solved. Run the simulation again." style={{ fontSize: 'var(--fs-xs)', fontWeight: '700', color: '#7A3E00', background: '#FFF7ED', border: '1px solid #FDE3C3', padding: '1px 6px', borderRadius: '10px', whiteSpace: 'nowrap' }}>Out of date</span>
                            )}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {reliefDevices.map((dev, idx) => {
                    const devTypeLabel = dev.type === 'rupture_disc'
                      ? 'Rupture Disc'
                      : (dev.data?.action_mode === 'modulating' ? 'PSV (Modulating)' : 'PSV (Pop Action)');
                    // Set / burst pressure in gauge; older files without it show "missing"
                    const ratingBarg = dev.type === 'rupture_disc' ? dev.data?.burst_pressure_barg : dev.data?.set_pressure_barg;
                    const ratingLabel = ratingBarg ? formatPressureGauge(Number(ratingBarg)) : 'missing';

                    return (
                      <tr key={dev.id} style={{ borderBottom: '1px solid var(--color-border-hover)', background: idx % 2 === 0 ? '#FFFFFF' : '#F8FAFA', height: '36px' }}>
                        <td {...clickableProps} 
                          onClick={() => onSelectNode && onSelectNode(dev.id)} 
                          style={{ padding: '6px 12px', fontWeight: '700', color: 'var(--color-primary-text)', cursor: 'pointer', verticalAlign: 'middle' }}
                          title="Click to locate on canvas"
                        >
                          {dev.data?.label || dev.id}
                        </td>
                        <td style={{ padding: '6px 12px', color: 'var(--color-text-secondary)', verticalAlign: 'middle' }}>{devTypeLabel}</td>
                        <td style={{ padding: '6px 12px', fontWeight: '600', color: 'var(--color-text-primary)', verticalAlign: 'middle' }}>{ratingLabel}</td>
                        
                        {displayCases.map(c => {
                          const caseId = c.id || c.case_id;
                          const forcedState = effectiveForcedState(cases, rawNodes || nodes, caseId, dev.id);

                          return (
                            <td key={caseId} style={{ padding: '4px 12px', background: caseId === activeCaseId ? '#fff7ed' : 'inherit', borderLeft: '1px solid var(--color-border)', verticalAlign: 'middle' }}>
                              <select
                                aria-label={`${dev.data?.label || dev.id} state in ${c.case_name || c.name || 'case'}`}
                                value={forcedState}
                                onChange={(e) => handleMatrixForcedStateChange(caseId, dev.id, e.target.value)}
                                style={{
                                  padding: '4px 8px',
                                  fontSize: 'var(--fs-xs)',
                                  fontWeight: '700',
                                  borderRadius: '6px',
                                  border: `1px solid ${
                                    forcedState === 'forced_closed' ? '#FEE2E2' : (forcedState === 'forced_open' ? '#FEF3C7' : 'var(--color-border)')
                                  }`,
                                  background: forcedState === 'forced_closed' ? '#FEF2F2' : (forcedState === 'forced_open' ? 'var(--color-warning-bg)' : '#FFFFFF'),
                                  color: forcedState === 'forced_closed' ? '#EF4444' : (forcedState === 'forced_open' ? 'var(--color-warning-text)' : 'var(--color-text-primary)'),
                                  cursor: 'pointer',
                                  outline: 'none',
                                  width: '100%'
                                }}
                              >
                                <option value="auto">Auto (Normal Relief)</option>
                                <option value="forced_closed">Forced Closed</option>
                                <option value="forced_open">Forced Open</option>
                              </select>
                              <ReliefDeviceResult
                                result={c.telemetry?.relief?.devices?.[dev.id]}
                                hasResults={Boolean(c.telemetry?.relief)}
                                formatPressure={caseFormatPressure(c)}
                                unit={labels.pressureAbs}
                                formatPressureGauge={formatPressureGauge}
                                formatFlow={formatFlow}
                                flowUnit={labels.flow}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}

                  {/* Summary Section Header */}
                  <tr style={{ background: 'var(--color-border-hover)', borderTop: '2px solid var(--color-border)', borderBottom: '2px solid var(--color-border)', color: 'var(--color-brand-dark)', fontWeight: '700', height: '36px' }}>
                    <td colSpan={3} style={{ padding: '6px 12px', fontWeight: '800', verticalAlign: 'middle' }}>
                      Overpressure & Relief Telemetry Summary
                    </td>
                    {displayCases.map(c => (
                      <td key={c.id || c.case_id} style={{ padding: '6px 12px', fontWeight: '700', background: (c.id || c.case_id) === activeCaseId ? '#fff7ed' : 'inherit', borderLeft: '1px solid var(--color-border)', verticalAlign: 'middle' }}>
                        {c.name || c.case_name}
                      </td>
                    ))}
                  </tr>

                  {/*
                    RELIEF CONTINGENCY PRESSURE METRICS (steady states, bar(a)):
                    1. Relieved: relief devices in their final state.
                    2. Peak: highest of the relief opening snapshots (each device exactly at its set pressure,
                       found on a ramp of the pumps and sources) and the relieved state.
                    3. Unmitigated: all relief devices held closed.
                  */}
                   {/* Relieved System Pressure */}
                   <tr style={{ borderBottom: '1px solid var(--color-border-hover)', height: '36px', background: telemetryMode === 'mitigated' ? '#ECFDF5' : '#ffffff' }}>
                     <td colSpan={3} title="Steady-state maximum pressure with the relief devices in their final state" style={{ padding: '6px 12px', fontWeight: '700', color: '#047857', verticalAlign: 'middle' }}>
                       Relieved system pressure ({labels.pressureAbs})
                     </td>
                     {displayCases.map(c => {
                       const pRelieved = c.kpis?.relieved_pressure_bara ?? c.kpis?.max_pressure_bar ?? calculateMaxPressureBar(c.telemetry);
                       return (
                         <td key={c.id || c.case_id} style={{ padding: '6px 12px', fontWeight: '700', color: '#047857', borderLeft: '1px solid var(--color-border)', verticalAlign: 'middle' }}>
                           {pRelieved !== undefined ? `${caseFormatPressure(c)(pRelieved)} ${labels.pressureAbs}` : '—'}
                         </td>
                       );
                     })}
                   </tr>

                   {/* Peak System Pressure */}
                   <tr style={{ borderBottom: '1px solid var(--color-border-hover)', height: '36px', background: telemetryMode === 'peak' ? 'var(--color-warning-bg)' : '#ffffff' }}>
                     <td colSpan={3} title="Highest steady-state pressure at the moment a relief device reaches its set pressure (pumps and sources ramped up), or the relieved pressure if higher" style={{ padding: '6px 12px', fontWeight: '700', color: '#B45309', verticalAlign: 'middle' }}>
                       Peak system pressure ({labels.pressureAbs})
                     </td>
                     {displayCases.map(c => {
                       const caseId = c.id || c.case_id;
                       const peak = c.telemetry?.relief?.peak;
                       let value = '—';
                       let note = c.telemetry ? 'Re-run the simulation' : null;
                       let title;
                       if (peak && !peak.available) {
                         note = 'Not available';
                         title = peak.reason;
                       } else if (peak) {
                         value = `${caseFormatPressure(c)(peak.pressure_bara)} ${labels.pressureAbs}`;
                         note = peak.source === 'opening'
                           ? `At opening of ${peak.device_ids.map(reliefDeviceLabel).join(', ')} · ${peak.ramp_pct} % load`
                           : 'Equals the relieved state';
                       }
                       return (
                         <td key={caseId} title={title} style={{ padding: '6px 12px', borderLeft: '1px solid var(--color-border)', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                           <div style={{ fontWeight: '700', color: '#B45309' }}>{value}</div>
                           {note && <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)' }}>{note}</div>}
                         </td>
                       );
                     })}
                   </tr>

                   {/* Unmitigated Peak Pressure */}
                   <tr style={{ borderBottom: '1px solid var(--color-border-hover)', height: '36px', background: telemetryMode === 'unmitigated_global' ? '#FEF2F2' : '#ffffff' }}>
                     <td colSpan={3} title="Steady-state maximum pressure with all relief devices held closed" style={{ padding: '6px 12px', fontWeight: '700', color: '#DC2626', verticalAlign: 'middle' }}>
                       Unmitigated peak pressure ({labels.pressureAbs})
                     </td>
                     {displayCases.map(c => {
                       const caseId = c.id || c.case_id;
                       const unmit = caseId === activeCaseId ? (telemetryUnmitigated || c.telemetry_unmitigated) : c.telemetry_unmitigated;
                       const pMaxUnmit = c.kpis?.unmitigated_peak_pressure_bara ?? calculateMaxPressureBar(unmit);
                       return (
                         <td key={caseId} style={{ padding: '6px 12px', fontWeight: '700', color: '#DC2626', borderLeft: '1px solid var(--color-border)', verticalAlign: 'middle' }}>
                           {pMaxUnmit !== undefined ? `${caseFormatPressure(c)(pMaxUnmit)} ${labels.pressureAbs}` : '—'}
                         </td>
                       );
                     })}
                   </tr>

                  {/* First Relief Opening */}
                  <tr style={{ borderBottom: '1px solid var(--color-border-hover)', height: '36px' }}>
                    <td colSpan={3} title="Relief device that reaches its set pressure first, and the driver load (pumps and sources, % of their case value) at which it does" style={{ padding: '6px 12px', fontWeight: '700', color: 'var(--color-text-primary)', verticalAlign: 'middle' }}>
                      First relief opening
                    </td>
                    {displayCases.map(c => {
                      const devices = c.telemetry?.relief?.devices;
                      const first = devices ? Object.entries(devices).filter(([, d]) => d.opening_order === 1) : [];
                      let text = '—';
                      if (c.telemetry?.relief?.peak?.available === false) {
                        text = 'Not available';
                      } else if (devices) {
                        text = first.length
                          ? `${first.map(([id]) => reliefDeviceLabel(id)).join(', ')} · ${first[0][1].opening_ramp_pct} % load`
                          : 'None (no device reaches its set pressure)';
                      }
                      return (
                        <td key={c.id || c.case_id} style={{ padding: '6px 12px', fontWeight: '600', color: 'var(--color-text-primary)', borderLeft: '1px solid var(--color-border)', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                          {text}
                        </td>
                      );
                    })}
                  </tr>

                  {/* Total Relief Flow */}
                  <tr style={{ borderBottom: '1px solid var(--color-border-hover)', background: '#F8FAFA', height: '36px' }}>
                    <td colSpan={3} style={{ padding: '6px 12px', fontWeight: '700', color: 'var(--color-text-primary)', verticalAlign: 'middle' }}>Total Relief Flow ({labels.flow})</td>
                    {displayCases.map(c => {
                      const totalReliefFlow = reliefDevices.reduce((sum, dev) => {
                        const devTel = c.telemetry?.nodes?.[dev.id];
                        const qOut = devTel?.outlets?.[0]?.flow_rate || 0;
                        return sum + Math.abs(qOut);
                      }, 0) * 60000;
                      return (
                        <td key={c.id || c.case_id} style={{ padding: '6px 12px', fontWeight: '600', color: 'var(--color-text-primary)', borderLeft: '1px solid var(--color-border)', verticalAlign: 'middle' }}>
                          {c.telemetry ? `${formatFlow(totalReliefFlow)} ${labels.flow}` : '—'}
                        </td>
                      );
                    })}
                  </tr>

                </tbody>
              </table>
            )}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-xs)', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'var(--color-border-hover)', borderBottom: '2px solid var(--color-border)', color: 'var(--color-brand-dark)', fontWeight: '700', position: 'sticky', top: 0, zIndex: 1 }}>

              <th style={{ padding: '8px', width: '40px' }}></th>
              <SortHeader label="Type" sortKey="displayType" sortConfig={sortConfig} requestSort={requestSort} />
              <SortHeader label="Name" sortKey="label" sortConfig={sortConfig} requestSort={requestSort} />
              <SortHeader label={`Flow (${labels.flow})`} sortKey="flow" align="right" sortConfig={sortConfig} requestSort={requestSort} />
              <SortHeader label={`Velocity (${labels.velocity})`} sortKey="velocity" align="right" sortConfig={sortConfig} requestSort={requestSort} />

              <SortHeader label={`ΔP (${labels.pressureDiff})`} sortKey="dp" align="right" sortConfig={sortConfig} requestSort={requestSort} />
              <SortHeader label={`P Start (${labels.pressureAbs})`} sortKey="pStart" align="right" sortConfig={sortConfig} requestSort={requestSort} />
              <SortHeader label={`P End (${labels.pressureAbs})`} sortKey="pEnd" align="right" sortConfig={sortConfig} requestSort={requestSort} />
              <SortHeader label={`Temp (${labels.temperature})`} sortKey="temp" align="right" sortConfig={sortConfig} requestSort={requestSort} />
              {activeTab === 'pipes' && <th style={{ padding: '8px' }}>NPS / Size</th>}
              {activeTab === 'pipes' && <th style={{ padding: '8px' }}>Schedule</th>}
              {activeTab === 'pipes' && <th style={{ padding: '8px' }}>Pipe Class</th>}
              {activeTab === 'pipes' && <SortHeader label={`Length (${labels.length})`} sortKey="length" align="right" sortConfig={sortConfig} requestSort={requestSort} />}
            </tr>
          </thead>
          <tbody>
            {processedItems.map((entry, idx) => {
              const isNode = entry.type === 'node';
              const item = entry.item;
              const diaValue = isNode ? (item.data.orifice_diameter_m || item.data.pipe_diameter_m || 0) : (item.data.diameter_m || 0);
              // Pipes without a class reference (older files) show as Manual; display never rewrites data
              const pipeSel = isNode ? null : resolvePipeSelection(item.data, scheduleOptions);
              const scheduleStd = pipeSel?.scheduleStandard;
              const match = isNode && diaValue > 0
                ? (matchScheduleByInnerDiameter(diaValue, DEFAULT_SCHEDULE_STANDARD, scheduleOptions)
                  || { dn: nearestDnByInnerDiameter(diaValue, DEFAULT_SCHEDULE_STANDARD, scheduleOptions) })
                : null;

              const currentClassId = isNode ? (item.data.pipe_class_id || 'manual') : pipeSel.classId;
              const selectedClass = isNode ? classList.find(c => c.id === currentClassId) : findPipeClass(classList, currentClassId);
              const supportedSizes = selectedClass?.sizes || [];

              const currentDn = isNode ? Number(item.data.standardDn || (match ? match.dn : 50)) : pipeSel.dn;
              const isCustomId = !isNode && pipeSel.isCustomId;
              const currentSch = isNode ? (item.data.standardSch || 'STD') : (pipeSel.sch || '');
              const customIdLabel = diaValue > 0
                ? `Custom ID ${isImperial ? `${(diaValue * 39.37007874).toFixed(3)} in` : `${(diaValue * 1000).toFixed(2)} mm`}`
                : 'Custom ID (not set)';
              const pipeInfo = getScheduleDataset(scheduleStd || DEFAULT_SCHEDULE_STANDARD, scheduleOptions).find(p => Number(p.dn) === currentDn);
              const npsDisplay = pipeInfo && !String(pipeInfo.nps).toUpperCase().startsWith('DN') ? `${pipeInfo.nps}"` : `DN${currentDn}`;

              // Same pipe data changes as the inspector's PipeSelector (utils/pipeDefaults.js)
              const handleClassChange = (newClassId) => {
                const patch = newClassId === 'manual'
                  ? manualSelectionPatch(currentDn, currentSch, scheduleStd, scheduleOptions)
                  : classSelectionPatch(findPipeClass(classList, newClassId), currentDn);
                if (patch) onUpdateEdge(item.id, patch);
              };

              const handleDnChange = (newDn) => {
                const dnInt = parseInt(newDn, 10);
                const patch = classSizePatch(selectedClass, dnInt)
                  || (!isNode ? schedulePatch(dnInt, currentSch || 'STD', scheduleStd, scheduleOptions) : null);
                if (patch) onUpdateEdge(item.id, patch);
              };

              // The schedule follows the pipe class; it is free only for manual / custom dimensions
              const scheduleLocked = currentClassId !== 'manual';

              const handleScheduleChange = (newSch) => {
                if (isNode || scheduleLocked) return;
                const patch = schedulePatch(currentDn, newSch, scheduleStd, scheduleOptions);
                if (patch) onUpdateEdge(item.id, patch);
              };

              const rowLabel = item.data.label || item.id;

              const handleNameChange = (newName) => {
                if (isNode) { if (onUpdateNode) onUpdateNode(item.id, { label: newName }); }
                else { if (onUpdateEdge) onUpdateEdge(item.id, { label: newName }); }
              };

              const handleLengthCommit = (text) => {
                const raw = parseFloat(text);
                if (isNode || !onUpdateEdge || isNaN(raw) || raw <= 0) return; // reverts to the stored length
                onUpdateEdge(item.id, { length_m: isImperial ? raw / 3.280839895 : raw });
              };

              const baseBg = item.selected ? '#FFF4E5' : (idx % 2 === 0 ? '#ffffff' : '#F8FAFA');
              const hoverBg = item.selected ? '#FFEAD1' : '#F0F4F4';

              return (
                <tr {...clickableRowProps} key={item.id} draggable={!sortConfig.key && !isEditing} onDragStart={(e) => onDragStart(e, entry.originalIndex)}
                  onDragOver={(e) => onDragOver(e, entry.originalIndex)} onDrop={(e) => onDrop(e, entry.originalIndex)}
                  onClick={() => handleRowClick(entry)}
                  style={{ 
                    borderBottom: '1px solid var(--color-border-hover)', cursor: sortConfig.key ? 'pointer' : (isEditing ? 'text' : 'grab'), transition: 'background 0.15s ease',
                    backgroundColor: draggedIdx === entry.originalIndex ? 'var(--color-border-hover)' : baseBg,
                    borderTop: dragOverIdx === entry.originalIndex ? '2px solid var(--color-primary)' : 'none', opacity: draggedIdx === entry.originalIndex ? 0.5 : 1
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = hoverBg}
                  onMouseLeave={(e) => e.currentTarget.style.background = baseBg}
                >
                  <td style={{ padding: '8px', color: '#849A9B', fontSize: 'var(--fs-xs)' }} title={sortConfig.key ? 'Clear sorting to reorder rows' : 'Drag to reorder'}>{sortConfig.key ? "—" : <DragHandleIcon size={12} />}</td>
                  <td style={{ padding: '8px', color: 'var(--color-text-secondary)', fontWeight: '600' }}>{entry.displayType}</td>
                  <td style={{ padding: '8px' }}>
                    <input 
                      aria-label={`${rowLabel} name`}
                      style={{ width: '110px', fontSize: 'var(--fs-xs)', border: '1px solid var(--color-border)', padding: '3px 6px', borderRadius: '5px', fontWeight: '700', color: 'var(--color-text-primary)', outline: 'none' }}
                      value={item.data.label || item.id} 
                      onChange={(e) => handleNameChange(e.target.value)} 
                      onFocus={() => { handleRowClick(entry); setIsEditing(true); }}
                      onBlur={() => setIsEditing(false)}
                      onPointerDown={(e) => e.stopPropagation()} 
                      onMouseDown={(e) => e.stopPropagation()}
                      onDragStart={(e) => e.stopPropagation()}
                      draggable={false}
                    />
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right', fontWeight: '600' }}>{formatFlowM3s(entry.flow)}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>
                    {formatVelocity(entry.velocity)}
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{formatDiffPressure(entry.dp, 3)}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{formatPressure(entry.pStart)}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{formatPressure(entry.pEnd)}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{formatTemperatureK(entry.temp)}</td>
                  {activeTab === 'pipes' && (
                    <td style={{ padding: '8px' }} onClick={(e) => e.stopPropagation()}>
                      {!isNode ? (
                        <select 
                          className="form-select"
                          aria-label={`${rowLabel} nominal size`}
                          style={{ fontSize: 'var(--fs-xs)', padding: '2px 6px', height: '26px' }}
                          value={isCustomId ? '' : currentDn}
                          disabled={currentClassId !== 'manual' && !selectedClass}
                          title={currentClassId !== 'manual' && !selectedClass ? 'Pipe class not available: choose another pipe class to change the size.' : undefined}
                          onChange={(e) => { handleDnChange(e.target.value); }}
                          onFocus={() => { handleRowClick(entry); setIsEditing(true); }}
                          onBlur={() => setIsEditing(false)}
                          onPointerDown={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          {isCustomId && <option value="" disabled>{customIdLabel}</option>}
                          {supportedSizes.length > 0 ? (
                            supportedSizes.map(s => (
                              <option key={s.dn} value={s.dn}>
                                {formatDnOption(s.dn, s.nps)}
                              </option>
                            ))
                          ) : (
                            getScheduleDataset(scheduleStd, scheduleOptions).map(p => <option key={p.dn} value={p.dn}>{formatDnOption(p.dn, p.nps)}</option>)
                          )}
                        </select>
                      ) : npsDisplay}
                    </td>
                  )}
                  {activeTab === 'pipes' && (
                    <td style={{ padding: '8px' }} onClick={(e) => e.stopPropagation()}>
                      {!isNode ? (
                        <select 
                          className="form-select"
                          aria-label={`${rowLabel} schedule`}
                          style={{ fontSize: 'var(--fs-xs)', padding: '2px 6px', height: '26px' }}
                          value={currentSch}
                          disabled={scheduleLocked}
                          title={scheduleLocked ? 'Schedule is defined by the pipe class. Select Custom / Manual to change it.' : undefined}
                          onChange={(e) => handleScheduleChange(e.target.value)}
                          onFocus={() => { handleRowClick(entry); setIsEditing(true); }}
                          onBlur={() => setIsEditing(false)}
                          onPointerDown={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          {isCustomId && <option value="" disabled>—</option>}
                          {(() => {
                            const listed = listSchedules(currentDn, scheduleStd, scheduleOptions);
                            // Keep a value the catalogue does not list for this size (e.g. an imported file) visible
                            const options = currentSch && !listed.includes(currentSch) ? [...listed, currentSch] : listed;
                            return options.map(s => (
                              <option key={s} value={s} disabled={!listed.includes(s)}>{scheduleLabel(s)}</option>
                            ));
                          })()}
                        </select>
                      ) : '—'}
                    </td>
                  )}
                  {activeTab === 'pipes' && (
                    <td style={{ padding: '8px' }} onClick={(e) => e.stopPropagation()}>
                      {!isNode ? (
                        <select 
                          className="form-select"
                          aria-label={`${rowLabel} pipe class`}
                          style={{ fontSize: 'var(--fs-xs)', padding: '2px 6px', height: '26px', minWidth: '160px' }}
                          value={selectedClass ? selectedClass.id : currentClassId}
                          onChange={(e) => handleClassChange(e.target.value)} 
                          onFocus={() => { handleRowClick(entry); setIsEditing(true); }}
                          onBlur={() => setIsEditing(false)}
                          onPointerDown={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          {classList.map(c => (
                            <option key={c.id} value={c.id}>
                              [{c.code}] {c.name}
                            </option>
                          ))}
                          {!isNode && currentClassId !== 'manual' && !selectedClass && (
                            <option value={currentClassId} disabled>
                              [{item.data.pipe_class_code || currentClassId}] not in catalogue
                            </option>
                          )}
                          {(allowCustomPipes || currentClassId === 'manual') && (
                            <option value="manual" disabled={!allowCustomPipes}>
                              Custom / Manual{allowCustomPipes ? '' : ' (not allowed)'}
                            </option>
                          )}
                        </select>
                      ) : (item.data.pipe_class_code || '—')}
                    </td>
                  )}
                  {activeTab === 'pipes' && (
                    <td style={{ padding: '8px', textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                      {!isNode && (
                        <DraftNumberInput
                          aria-label={`${rowLabel} length`}
                          step="0.1"
                          style={{ width: '55px', fontSize: 'var(--fs-xs)', border: '1px solid var(--color-border)', padding: '3px 6px', borderRadius: '5px', textAlign: 'right', fontWeight: '600', color: 'var(--color-brand-dark)', outline: 'none' }}
                          displayValue={isImperial ? ((item.data.length_m ?? 25) * 3.280839895).toFixed(1) : (item.data.length_m ?? 25)}
                          onCommit={handleLengthCommit}
                          onFocus={() => { handleRowClick(entry); setIsEditing(true); }}
                          onBlur={() => setIsEditing(false)}
                          onPointerDown={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          onDragStart={(e) => e.stopPropagation()}
                          draggable={false}
                        />
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>

        </table>
        )}
      </div>
    </div>
  );
}
