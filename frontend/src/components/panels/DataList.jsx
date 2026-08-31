import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { PlusIcon, PlayIcon, ExportIcon, CaseIcon, TrashIcon, SpinnerIcon } from '../symbols/IconLibrary';
import { findClosestPipeMatch, ASME_PIPE_STANDARDS } from '../../utils/standards_library';
import { getPipeScheduleDetails } from '../../constants/asme_b16_9_data';

import { updateCaseOverride } from '../../utils/case_resolver';
import { useUnits } from '../../context/UnitContext';


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
    <th onClick={() => requestSort(sortKey)} style={{ padding: '8px', cursor: 'pointer', textAlign: align, userSelect: 'none', backgroundColor: isSorted ? '#e2e8f0' : 'inherit', transition: 'background 0.2s' }}>
      {label} {isSorted ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
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
  onSetCaseOverride,
  runSimulation,
  showCaseManager = true,
  onToggleCaseManager,
  availablePipeClasses = [],
  allowCustomPipes = true
}) {
  const { labels, isImperial, formatPressure, formatFlow, formatFlowM3s, formatPower, formatTemperatureK, formatVelocity } = useUnits();

  const classList = availablePipeClasses || [];



  const [activeTab, setActiveTab] = useState('pipes');

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

  const fetchBatchSimulations = useCallback(async () => {
    setIsBatchLoading(true);
    setBatchError(null);
    try {
      const baseNodes = rawNodes || nodes;
      const baseEdges = rawEdges || edges;
      const payload = {
        nodes: baseNodes.map(n => ({ id: n.id, type: n.type, position: n.position, data: n.data })),
        edges: baseEdges.map(e => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle, data: e.data })),
        global_settings: globalSettings,
        cases: cases,
        active_case_id: activeCaseId
      };
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
        onBatchResults(resList);
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

    fetchBatchSimulations(nextCases, nextNodes);

    if (caseId === activeCaseId && runSimulation) {
      setTimeout(() => runSimulation(), 50);
    }
  }, [displayCases, cases, nodes, rawNodes, onUpdateNode, onSetCaseOverride, fetchBatchSimulations, activeCaseId, runSimulation]);

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
        const telemetry = node.data?.telemetry;
        const pStart = telemetry?.inlets?.[0]?.pressure || 0;
        const pEnd = telemetry?.outlets?.[0]?.pressure || 0;
        return {
          ...ref, originalIndex: index, item: node, label: node.data.label || node.id,
          displayType: node.type.replace('_',' ').toUpperCase(),
          flow: telemetry?.outlets?.[0]?.flow_rate || 0,
          dp: Math.abs(pStart - pEnd) / 100000,
          pStart: pStart / 100000,
          pEnd: pEnd / 100000,
          temp: (telemetry?.outlets?.[0]?.temperature || telemetry?.inlets?.[0]?.temperature) || 293.15,
          length: 0,
          velocity: 0
        };
      } else {
        const edge = edges.find(e => e.id === ref.id);
        if (!edge) return null;
        
        // EXCLUDE SIGNALS
        if (edge.data?.type === 'SIGNAL') return null;

        const telemetry = edge.data?.telemetry;
        const pStart = telemetry?.inlets?.[0]?.pressure || 0;
        const pEnd = telemetry?.outlets?.[0]?.pressure || 0;
        const flow = telemetry?.outlets?.[0]?.flow_rate || 0;
        const diaValue = edge.data.diameter || 0.1;
        const area = Math.PI * Math.pow(diaValue, 2) / 4;
        return {
          ...ref, originalIndex: index, item: edge, label: edge.data.label || edge.id, displayType: 'PIPE',
          flow: flow, dp: Math.abs(pStart - pEnd) / 100000,
          pStart: pStart / 100000, pEnd: pEnd / 100000,
          temp: (telemetry?.outlets?.[0]?.temperature || telemetry?.inlets?.[0]?.temperature) || 293.15,
          velocity: area > 0 ? flow / area : 0,
          length: edge.data.length || 0
        };
      }
    }).filter(i => i !== null && (filterType === 'all' || i.type === filterType));

    if (filterText) {
      const lower = filterText.toLowerCase();
      items = items.filter(i => i.label.toLowerCase().includes(lower) || i.displayType.toLowerCase().includes(lower));
    }
    if (sortConfig.key) {
      items.sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
        if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return items;
  }, [manualOrder, nodes, edges, activeTab, filterText, sortConfig]);

  const exportCSV = useCallback(() => {
    const headers = ["Type", "Name", `Flow (${labels.flow})`, `Velocity (${labels.velocity})`, `dP (${labels.pressureDiff})`, `P Start (${labels.pressureAbs})`, `P End (${labels.pressureAbs})`, `Temp (${labels.temperature})`];
    if (activeTab === 'pipes') headers.push(`Length (${labels.length})`);
    const rows = processedItems.map(i => {
      const lenDisplay = isImperial ? (i.length * 3.280839895).toFixed(2) : i.length;
      const row = [i.displayType, i.label, formatFlowM3s(i.flow), formatVelocity(i.velocity), formatPressure(i.dp, 3), formatPressure(i.pStart), formatPressure(i.pEnd), formatTemperatureK(i.temp)];
      if (activeTab === 'pipes') row.push(lenDisplay);
      return row.join(",");
    });
    const blob = new Blob([[headers.join(","), ...rows].join("\n")], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url); link.setAttribute("download", `walflow_export_${activeTab}.csv`); link.click();
  }, [processedItems, activeTab, labels, isImperial, formatFlowM3s, formatVelocity, formatPressure, formatTemperatureK]);

  return (
    <div style={{ height: '350px', background: '#ffffff', borderTop: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 -4px 16px rgba(57, 82, 83, 0.05)' }}>
      <div style={{ display: 'flex', background: 'var(--color-surface-hover)', borderBottom: '1px solid var(--color-border)', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px' }}>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button onClick={() => { setActiveTab('pipes'); setSortConfig({key:null, direction:'asc'}); }}
            className={`datalist-tab ${activeTab === 'pipes' ? 'active' : ''}`}
          >
            Pipe Network List
          </button>
          <button onClick={() => { setActiveTab('all'); setSortConfig({key:null, direction:'asc'}); }}
            className={`datalist-tab ${activeTab === 'all' ? 'active' : ''}`}
          >
            Full Equipment & Pipeline Data
          </button>
          <button onClick={() => { setActiveTab('cases'); setSortConfig({key:null, direction:'asc'}); }}
            className={`datalist-tab ${activeTab === 'cases' ? 'active' : ''}`}
          >
            Operating Cases Matrix
          </button>
          <button onClick={() => { setActiveTab('relief'); setSortConfig({key:null, direction:'asc'}); }}
            className={`datalist-tab ${activeTab === 'relief' ? 'active' : ''}`}
          >
            Relief Analysis Matrix
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {activeTab === 'cases' ? (
            <div style={{ display: 'flex', gap: '8px' }}>
              {onAddCase && (
                <button
                  onClick={onAddCase}
                  className="btn-primary btn-compact"
                >
                  <PlusIcon size={14} style={{ marginRight: '6px' }} /> New Case
                </button>
              )}
              <button
                onClick={onToggleCaseManager}
                className={showCaseManager ? "btn-primary btn-compact" : "btn-secondary btn-compact"}
              >
                <CaseIcon size={14} style={{ marginRight: '6px' }} /> {showCaseManager ? 'Hide Case Manager' : 'Show Case Manager'}
              </button>
              <button
                onClick={fetchBatchSimulations}
                disabled={isBatchLoading}
                className="btn-primary btn-compact"
              >
                <PlayIcon size={14} style={{ marginRight: '6px' }} /> {isBatchLoading ? 'Solving Cases...' : 'Batch Solve Matrix'}
              </button>
            </div>
          ) : activeTab === 'relief' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '6px 0' }}>
              <button
                onClick={onToggleCaseManager}
                className={showCaseManager ? "btn-primary btn-compact" : "btn-secondary btn-compact"}
              >
                <CaseIcon size={14} style={{ marginRight: '6px' }} /> {showCaseManager ? 'Hide Case Manager' : 'Show Case Manager'}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input 
                  type="text" 
                  placeholder="Filter list..." 
                  value={filterText} 
                  onChange={(e) => setFilterText(e.target.value)}
                  className="form-input"
                  style={{ width: '160px' }} 
                />
                {filterText && <button onClick={() => setFilterText("")} style={{ position:'absolute', right:5, top:'50%', transform:'translateY(-50%)', border:'none', background:'none', cursor:'pointer', color:'var(--color-text-secondary)' }}>×</button>}
              </div>
              <button 
                onClick={handleAutoSortClick} 
                className="btn-secondary btn-compact"
              >
                Auto Sort
              </button>
              <button 
                onClick={exportCSV} 
                className="btn-primary btn-compact"
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
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-text-secondary)', fontSize: '13px', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <SpinnerIcon size={14} color="var(--color-text-secondary)" /> Running batch simulations across all operating cases...
              </div>
            ) : batchError ? (
              <div style={{ padding: '16px', color: 'var(--color-danger)', background: '#fef2f2', borderRadius: '8px', border: '1px solid #fee2e2' }}>
                <strong>Batch Simulation Error:</strong> {batchError}
              </div>
            ) : (
              <table style={{ width: '100%', height: 'max-content', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'left', tableLayout: 'auto' }}>
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
                              <span style={{ fontSize: '11px', color: '#94a3b8', cursor: 'grab', userSelect: 'none' }} title="Drag column to reorder">
                                ⋮⋮
                              </span>
                            )}
                            <input 
                              style={{ 
                                width: `${inputWidth}px`, 
                                fontSize: '11px', 
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
                            {isBase && <span style={{ fontSize: '10px', fontWeight: '800', color: 'var(--color-brand-dark)' }}>(Base)</span>}
                            {!isActive && onSelectCase && (
                              <button
                                onClick={() => onSelectCase(caseId)}
                                style={{ padding: '2px 6px', fontSize: '10px', borderRadius: '4px', border: '1px solid var(--color-border)', background: '#ffffff', cursor: 'pointer', color: 'var(--color-brand-dark)', fontWeight: '600', whiteSpace: 'nowrap' }}
                              >
                                Switch
                              </button>
                            )}
                            {!isBase && onDeleteCase && (
                              <button
                                onClick={() => {
                                  if (confirm(`Delete case "${caseName}"?`)) {
                                    onDeleteCase(caseId);
                                  }
                                }}
                                title="Delete this operating case"
                                style={{ padding: '2px 6px', fontSize: '10px', borderRadius: '4px', border: '1px solid #fee2e2', background: '#fef2f2', cursor: 'pointer', color: 'var(--color-danger)', fontWeight: '600', whiteSpace: 'nowrap' }}
                              >
                                <TrashIcon size={12} style={{ color: 'var(--color-danger)' }} />
                              </button>
                            )}
                            {isActive && <span style={{ fontSize: '10px', color: 'var(--color-primary)', fontWeight: 'bold' }}>Active</span>}
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
                      const deltaStr = !c.is_base && baseKpis ? formatDelta(isImperial ? val * 14.5037738 : val, isImperial ? baseKpis.max_pressure_bar * 14.5037738 : baseKpis.max_pressure_bar, labels.pressureAbs) : null;
                      return (
                        <td key={c.case_id || c.id} style={{ padding: '6px 12px', borderLeft: caseDragOverIdx === colIdx ? '3px solid var(--color-primary)' : '1px solid var(--color-border)', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                          <span style={{ fontWeight: '700', color: 'var(--color-text-primary)' }}>{val !== undefined ? `${formatPressure(val)} ${labels.pressureAbs}` : '—'}</span>
                          {deltaStr && <span style={{ fontSize: '10px', color: '#d97706', marginLeft: '8px' }}>{deltaStr}</span>}
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
                      const deltaStr = !c.is_base && baseKpis ? formatDelta(isImperial ? val * 14.5037738 : val, isImperial ? baseKpis.min_pressure_bar * 14.5037738 : baseKpis.min_pressure_bar, labels.pressureAbs) : null;
                      return (
                        <td key={c.case_id || c.id} style={{ padding: '6px 12px', borderLeft: caseDragOverIdx === colIdx ? '3px solid var(--color-primary)' : '1px solid var(--color-border)', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                          <span style={{ fontWeight: '700', color: 'var(--color-text-primary)' }}>{val !== undefined ? `${formatPressure(val)} ${labels.pressureAbs}` : '—'}</span>
                          {deltaStr && <span style={{ fontSize: '10px', color: '#d97706', marginLeft: '8px' }}>{deltaStr}</span>}
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
                      const deltaStr = !c.is_base && baseKpis ? formatDelta(isImperial ? val * 0.264172052 : val, isImperial ? baseKpis.total_flow_lmin * 0.264172052 : baseKpis.total_flow_lmin, labels.flow) : null;
                      return (
                        <td key={c.case_id || c.id} style={{ padding: '6px 12px', borderLeft: caseDragOverIdx === colIdx ? '3px solid var(--color-primary)' : '1px solid var(--color-border)', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                          <span style={{ fontWeight: '700', color: 'var(--color-text-primary)' }}>{val !== undefined ? `${formatFlow(val)} ${labels.flow}` : '—'}</span>
                          {deltaStr && <span style={{ fontSize: '10px', color: '#d97706', marginLeft: '8px' }}>{deltaStr}</span>}
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
                          {deltaStr && <span style={{ fontSize: '10px', color: '#d97706', marginLeft: '8px' }}>{deltaStr}</span>}
                        </td>
                      );
                    })}
                  </tr>
                  {/* Cavitation Warning */}
                  <tr style={{ borderBottom: '1px solid var(--color-border-hover)', height: '36px' }}>
                    <td style={{ padding: '6px 12px', fontWeight: '700', color: 'var(--color-text-primary)', verticalAlign: 'middle', width: '200px', minWidth: '200px', maxWidth: '200px', whiteSpace: 'nowrap' }}>Cavitation Risk Status</td>
                    {displayCases.map((c, colIdx) => {
                      const kpis = c.kpis || {};
                      const hasCav = kpis.has_cavitation_warning;
                      return (
                        <td key={c.case_id || c.id} style={{ padding: '6px 12px', borderLeft: caseDragOverIdx === colIdx ? '3px solid var(--color-primary)' : '1px solid var(--color-border)', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                          {hasCav ? (
                            <span style={{ fontSize: '10px', fontWeight: '700', color: 'var(--color-danger)', background: '#fef2f2', padding: '2px 8px', borderRadius: '10px', border: '1px solid #fee2e2' }}>
                              ⚠️ Cavitation Risk
                            </span>
                          ) : (
                            <span style={{ fontSize: '10px', fontWeight: '700', color: '#16a34a', background: '#f0fdf4', padding: '2px 8px', borderRadius: '10px', border: '1px solid #dcfce7' }}>
                              ✓ Normal
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
        ) : activeTab === 'relief' ? (
          <div style={{ display: 'inline-block', minWidth: '100%', boxSizing: 'border-box', verticalAlign: 'top' }}>
            {reliefDevices.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-text-secondary)', fontSize: '13px', fontWeight: '600' }}>
                ℹ No Pressure Safety Valves or Rupture Discs in the current diagram. Drag a PSV or Rupture Disc from the sidebar onto the canvas to enable relief contingency analysis.
              </div>
            ) : (
              <table style={{ width: '100%', height: 'max-content', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'left', tableLayout: 'auto' }}>
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
                                style={{ padding: '2px 6px', fontSize: '10px', borderRadius: '4px', border: '1px solid var(--color-border)', background: '#ffffff', cursor: 'pointer', color: 'var(--color-brand-dark)', fontWeight: '600', whiteSpace: 'nowrap' }}
                              >
                                Switch
                              </button>
                            )}
                            {isActive && <span style={{ fontSize: '10px', color: 'var(--color-primary)', fontWeight: 'bold' }}>Active</span>}
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
                    const ratingLabel = dev.type === 'rupture_disc'
                      ? `${dev.data?.burst_pressure_bar || 30.0} bar(a)`
                      : `${dev.data?.set_pressure_bar || 20.0} bar(a)`;

                    return (
                      <tr key={dev.id} style={{ borderBottom: '1px solid var(--color-border-hover)', background: idx % 2 === 0 ? '#FFFFFF' : '#F8FAFA', height: '36px' }}>
                        <td 
                          onClick={() => onSelectNode && onSelectNode(dev.id)} 
                          style={{ padding: '6px 12px', fontWeight: '700', color: 'var(--color-primary)', cursor: 'pointer', verticalAlign: 'middle' }}
                          title="Click to locate on canvas"
                        >
                          {dev.data?.label || dev.id}
                        </td>
                        <td style={{ padding: '6px 12px', color: 'var(--color-text-secondary)', verticalAlign: 'middle' }}>{devTypeLabel}</td>
                        <td style={{ padding: '6px 12px', fontWeight: '600', color: 'var(--color-text-primary)', verticalAlign: 'middle' }}>{ratingLabel}</td>
                        
                        {displayCases.map(c => {
                          const caseId = c.id || c.case_id;
                          const caseOverride = !c.is_base && c.overrides?.nodes?.[dev.id]?.forced_state;
                          const effectiveForcedState = caseOverride || dev.data?.forced_state || 'auto';

                          return (
                            <td key={caseId} style={{ padding: '4px 12px', background: caseId === activeCaseId ? '#fff7ed' : 'inherit', borderLeft: '1px solid var(--color-border)', verticalAlign: 'middle' }}>
                              <select
                                value={effectiveForcedState}
                                onChange={(e) => handleMatrixForcedStateChange(caseId, dev.id, e.target.value)}
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '11px',
                                  fontWeight: '700',
                                  borderRadius: '6px',
                                  border: `1px solid ${
                                    effectiveForcedState === 'forced_closed' ? '#FEE2E2' : (effectiveForcedState === 'forced_open' ? '#FEF3C7' : 'var(--color-border)')
                                  }`,
                                  background: effectiveForcedState === 'forced_closed' ? '#FEF2F2' : (effectiveForcedState === 'forced_open' ? '#FFFBEB' : '#FFFFFF'),
                                  color: effectiveForcedState === 'forced_closed' ? '#EF4444' : (effectiveForcedState === 'forced_open' ? '#D97706' : 'var(--color-text-primary)'),
                                  cursor: 'pointer',
                                  outline: 'none',
                                  width: '100%'
                                }}
                              >
                                <option value="auto">Auto (Normal Relief)</option>
                                <option value="forced_closed">Forced Closed</option>
                                <option value="forced_open">Forced Open</option>
                              </select>
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
                    RELIEF CONTINGENCY PRESSURE METRICS (ALL DISPLAYED IN BARA):
                    1. Relieved system pressure: Steady-state max system pressure after relief devices open.
                    2. Peak system pressure: Maximum pressure occurring during overpressure build-up at relief activation.
                    3. Unmitigated peak pressure: Maximum baseline pressure if all relief devices remain closed.
                  */}
                   {/* Relieved System Pressure */}
                   <tr style={{ borderBottom: '1px solid var(--color-border-hover)', height: '36px', background: telemetryMode === 'mitigated' ? '#ECFDF5' : '#ffffff' }}>
                     <td colSpan={3} style={{ padding: '6px 12px', fontWeight: '700', color: '#10B981', verticalAlign: 'middle' }}>
                       Relieved system pressure (bar(a))
                     </td>
                     {displayCases.map(c => {
                       const pRelieved = c.kpis?.relieved_pressure_bara ?? c.kpis?.max_pressure_bar ?? calculateMaxPressureBar(c.telemetry);
                       return (
                         <td key={c.id || c.case_id} style={{ padding: '6px 12px', fontWeight: '700', color: '#10B981', borderLeft: '1px solid var(--color-border)', verticalAlign: 'middle' }}>
                           {pRelieved !== undefined ? `${pRelieved.toFixed(2)} bar(a)` : '—'}
                         </td>
                       );
                     })}
                   </tr>
 
                   {/* Peak System Pressure */}
                   <tr style={{ borderBottom: '1px solid var(--color-border-hover)', height: '36px', background: telemetryMode === 'peak' ? '#FFFBEB' : '#ffffff' }}>
                     <td colSpan={3} style={{ padding: '6px 12px', fontWeight: '700', color: '#D97706', verticalAlign: 'middle' }}>
                       Peak system pressure (bar(a))
                     </td>
                     {displayCases.map(c => {
                       const caseId = c.id || c.case_id;
                       const unmit = caseId === activeCaseId ? (telemetryUnmitigated || c.telemetry_unmitigated) : c.telemetry_unmitigated;
                       const pUnmit = calculateMaxPressureBar(unmit);
                       const pPeak = c.kpis?.peak_pressure_bara ?? pUnmit ?? calculateMaxPressureBar(c.telemetry);
                       return (
                         <td key={caseId} style={{ padding: '6px 12px', fontWeight: '700', color: '#D97706', borderLeft: '1px solid var(--color-border)', verticalAlign: 'middle' }}>
                           {pPeak !== undefined ? `${pPeak.toFixed(2)} bar(a)` : '—'}
                         </td>
                       );
                     })}
                   </tr>
 
                   {/* Unmitigated Peak Pressure */}
                   <tr style={{ borderBottom: '1px solid var(--color-border-hover)', height: '36px', background: telemetryMode === 'unmitigated_global' ? '#FEF2F2' : '#ffffff' }}>
                     <td colSpan={3} style={{ padding: '6px 12px', fontWeight: '700', color: '#DC2626', verticalAlign: 'middle' }}>
                       Unmitigated peak pressure ({labels.pressureAbs})
                     </td>
                     {displayCases.map(c => {
                       const caseId = c.id || c.case_id;
                       const unmit = caseId === activeCaseId ? (telemetryUnmitigated || c.telemetry_unmitigated) : c.telemetry_unmitigated;
                       const pMaxUnmit = c.kpis?.unmitigated_peak_pressure_bara ?? calculateMaxPressureBar(unmit);
                       return (
                         <td key={caseId} style={{ padding: '6px 12px', fontWeight: '700', color: '#DC2626', borderLeft: '1px solid var(--color-border)', verticalAlign: 'middle' }}>
                           {pMaxUnmit !== undefined ? `${formatPressure(pMaxUnmit)} ${labels.pressureAbs}` : '—'}
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
                          {formatFlow(totalReliefFlow)} {labels.flow}
                        </td>
                      );
                    })}
                  </tr>

                </tbody>
              </table>
            )}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'var(--color-border-hover)', borderBottom: '2px solid var(--color-border)', color: 'var(--color-brand-dark)', fontWeight: '700', position: 'sticky', top: 0, zIndex: 1 }}>

              <th style={{ padding: '8px', width: '40px' }}></th>
              <SortHeader label="Type" sortKey="displayType" sortConfig={sortConfig} requestSort={requestSort} />
              <SortHeader label={`Flow (${labels.flow})`} sortKey="flow" align="right" sortConfig={sortConfig} requestSort={requestSort} />
              <SortHeader label={`Velocity (${labels.velocity})`} sortKey="velocity" align="right" sortConfig={sortConfig} requestSort={requestSort} />

              <SortHeader label={`dP (${labels.pressureDiff})`} sortKey="dp" align="right" sortConfig={sortConfig} requestSort={requestSort} />
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
              const diaValue = isNode ? (item.data.orifice_diameter || item.data.pipe_diameter || 0) : (item.data.diameter || 0.05248);
              const match = findClosestPipeMatch(diaValue);
              
              const currentClassId = item.data.pipe_class_id || (classList.length > 0 ? classList[0].id : 'manual');
              const selectedClass = classList.find(c => c.id === currentClassId);
              const supportedSizes = selectedClass?.sizes || [];

              const currentDn = Number(item.data.standardDn || (supportedSizes.length > 0 ? supportedSizes[0].dn : (match ? match.dn : 50)));
              const currentSch = item.data.standardSch || (selectedClass?.sizes?.find(s => s.dn === currentDn)?.sch || 'STD');
              const pipeInfo = ASME_PIPE_STANDARDS.find(p => p.dn === currentDn);
              const npsDisplay = pipeInfo ? `${pipeInfo.nps}"` : `${currentDn}mm`;

              const handleClassChange = (newClassId) => {
                if (newClassId === 'manual') {
                  const schDetails = getPipeScheduleDetails(currentDn, currentSch) || getPipeScheduleDetails(50, 'STD');
                  onUpdateEdge(item.id, {
                    pipe_class_id: 'manual',
                    pipe_class_code: 'CUSTOM',
                    standardDn: schDetails.dn,
                    standardSch: schDetails.sch,
                    diameter: schDetails.id_mm / 1000.0,
                    outer_diameter_mm: schDetails.od_mm,
                    wall_thickness_mm: schDetails.wt_mm
                  });
                  return;
                }
                const pc = classList.find(c => c.id === newClassId);
                if (!pc) return;
                const sizes = pc.sizes || [];
                const matchedSize = sizes.find(s => s.dn === currentDn) || sizes[0];
                if (matchedSize) {
                  const calcId = (matchedSize.od_mm - 2.0 * matchedSize.wt_mm) / 1000.0;
                  onUpdateEdge(item.id, {
                    pipe_class_id: pc.id,
                    pipe_class_code: pc.code,
                    diameter: calcId,
                    standardDn: matchedSize.dn,
                    standardSch: matchedSize.sch || 'STD',
                    roughness_mm: pc.roughness_mm,
                    roughness: pc.roughness_mm / 1000.0,
                    outer_diameter_mm: matchedSize.od_mm,
                    wall_thickness_mm: matchedSize.wt_mm
                  });
                }
              };

              const handleDnChange = (newDn) => {
                const dnInt = parseInt(newDn, 10);
                if (selectedClass && selectedClass.sizes) {
                  const sizeObj = selectedClass.sizes.find(s => s.dn === dnInt);
                  if (sizeObj) {
                    const calcId = (sizeObj.od_mm - 2.0 * sizeObj.wt_mm) / 1000.0;
                    onUpdateEdge(item.id, {
                      diameter: calcId,
                      standardDn: dnInt,
                      standardSch: sizeObj.sch || 'STD',
                      outer_diameter_mm: sizeObj.od_mm,
                      wall_thickness_mm: sizeObj.wt_mm
                    });
                    return;
                  }
                }
                const schDetails = getPipeScheduleDetails(dnInt, currentSch) || getPipeScheduleDetails(dnInt, 'STD');
                if (schDetails && !isNode) {
                  onUpdateEdge(item.id, {
                    diameter: schDetails.id_mm / 1000.0,
                    standardDn: dnInt,
                    standardSch: schDetails.sch,
                    outer_diameter_mm: schDetails.od_mm,
                    wall_thickness_mm: schDetails.wt_mm
                  });
                }
              };

              const handleScheduleChange = (newSch) => {
                if (isNode) return;
                const schDetails = getPipeScheduleDetails(currentDn, newSch);
                if (schDetails) {
                  onUpdateEdge(item.id, {
                    standardSch: newSch,
                    diameter: schDetails.id_mm / 1000.0,
                    outer_diameter_mm: schDetails.od_mm,
                    wall_thickness_mm: schDetails.wt_mm
                  });
                }
              };

              const handleNameChange = (newName) => {
                if (isNode) { if (onUpdateNode) onUpdateNode(item.id, { label: newName }); }
                else { if (onUpdateEdge) onUpdateEdge(item.id, { label: newName }); }
              };

              const handleLengthChange = (newLen) => {
                if (!isNode && onUpdateEdge) {
                  onUpdateEdge(item.id, { length: parseFloat(newLen) || 0 });
                }
              };

              const baseBg = item.selected ? '#FFF4E5' : (idx % 2 === 0 ? '#ffffff' : '#F8FAFA');
              const hoverBg = item.selected ? '#FFEAD1' : '#F0F4F4';

              const vel = Math.abs(entry.velocity || 0);
              const velColor = vel > 4.0 ? '#DC2626' : (vel > 2.5 ? '#D97706' : 'inherit');
              const velWeight = vel > 2.5 ? '700' : 'normal';

              return (
                <tr key={item.id} draggable={!sortConfig.key && !isEditing} onDragStart={(e) => onDragStart(e, entry.originalIndex)}
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
                  <td style={{ padding: '8px', color: '#849A9B', fontSize: '10px' }}>{sortConfig.key ? "—" : "☰"}</td>
                  <td style={{ padding: '8px', color: 'var(--color-text-secondary)', fontWeight: '600' }}>{entry.displayType}</td>
                  <td style={{ padding: '8px' }}>
                    <input 
                      style={{ width: '110px', fontSize: '11px', border: '1px solid var(--color-border)', padding: '3px 6px', borderRadius: '5px', fontWeight: '700', color: 'var(--color-text-primary)', outline: 'none' }}
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
                  <td style={{ padding: '8px', textAlign: 'right', color: velColor, fontWeight: velWeight }}>
                    {formatVelocity(entry.velocity)}
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{formatPressure(entry.dp, 3)}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{formatPressure(entry.pStart)}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{formatPressure(entry.pEnd)}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{formatTemperatureK(entry.temp)}</td>
                  {activeTab === 'pipes' && (
                    <td style={{ padding: '8px' }} onClick={(e) => e.stopPropagation()}>
                      {!isNode ? (
                        <select 
                          className="form-select"
                          style={{ fontSize: '11px', padding: '2px 6px', height: '26px' }}
                          value={currentDn} 
                          onChange={(e) => { handleDnChange(e.target.value); }} 
                          onFocus={() => { handleRowClick(entry); setIsEditing(true); }}
                          onBlur={() => setIsEditing(false)}
                          onPointerDown={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          {supportedSizes.length > 0 ? (
                            supportedSizes.map(s => (
                              <option key={s.dn} value={s.dn}>
                                DN {s.dn} ({s.nps}")
                              </option>
                            ))
                          ) : (
                            ASME_PIPE_STANDARDS.map(p => <option key={p.dn} value={p.dn}>DN {p.dn} ({p.nps}")</option>)
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
                          style={{ fontSize: '11px', padding: '2px 6px', height: '26px' }}
                          value={currentSch}
                          onChange={(e) => handleScheduleChange(e.target.value)}
                          onFocus={() => { handleRowClick(entry); setIsEditing(true); }}
                          onBlur={() => setIsEditing(false)}
                          onPointerDown={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          {['STD', '40', '80', 'XS', '160'].map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      ) : '—'}
                    </td>
                  )}
                  {activeTab === 'pipes' && (
                    <td style={{ padding: '8px' }} onClick={(e) => e.stopPropagation()}>
                      {!isNode ? (
                        <select 
                          className="form-select"
                          style={{ fontSize: '11px', padding: '2px 6px', height: '26px', minWidth: '160px' }}
                          value={currentClassId} 
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
                          {allowCustomPipes && (
                            <option value="manual">Custom / Manual</option>
                          )}
                        </select>
                      ) : (item.data.pipe_class_code || '—')}
                    </td>
                  )}
                  {activeTab === 'pipes' && (
                    <td style={{ padding: '8px', textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                      {!isNode && (
                        <input 
                          type="number" step="0.1"
                          style={{ width: '55px', fontSize: '11px', border: '1px solid var(--color-border)', padding: '3px 6px', borderRadius: '5px', textAlign: 'right', fontWeight: '600', color: 'var(--color-brand-dark)', outline: 'none' }}
                          value={isImperial ? (item.data.length * 3.280839895).toFixed(1) : item.data.length}
                          onChange={(e) => handleLengthChange(isImperial ? (parseFloat(e.target.value) || 0) / 3.280839895 : (parseFloat(e.target.value) || 0))}

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
