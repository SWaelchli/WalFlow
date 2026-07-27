import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { m3sToLmin, kToC } from '../../utils/converters';
import { findClosestPipeMatch, ASME_PIPE_STANDARDS, calculatePipeId } from '../../utils/standards_library';
import { updateCaseOverride } from '../../utils/case_resolver';

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
  onToggleTelemetryMode,
  telemetryUnmitigated,
  onSetCaseOverride,
  runSimulation
}) {

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
      const response = await fetch('http://localhost:8000/api/simulation/batch', {
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
      if (onSetCaseOverride) {
        onSetCaseOverride(caseId, nodeId, 'forced_state', value);
      }
      nextCases = updateCaseOverride(cases, caseId, nodeId, 'forced_state', value);
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
    const headers = ["Type", "Name", "Flow (L/min)", "Velocity (m/s)", "dP (bar)", "P Start (bara)", "P End (bara)", "Temp (C)"];
    if (activeTab === 'pipes') headers.push("Length (m)");
    const rows = processedItems.map(i => {
      const row = [i.displayType, i.label, m3sToLmin(i.flow), i.velocity.toFixed(2), i.dp.toFixed(3), i.pStart.toFixed(2), i.pEnd.toFixed(2), kToC(i.temp)];
      if (activeTab === 'pipes') row.push(i.length);
      return row.join(",");
    });
    const blob = new Blob([[headers.join(","), ...rows].join("\n")], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url); link.setAttribute("download", `walflow_export_${activeTab}.csv`); link.click();
  }, [processedItems, activeTab]);

  return (
    <div style={{ height: '350px', background: '#ffffff', borderTop: '1px solid #D8E2E1', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 -4px 16px rgba(57, 82, 83, 0.05)' }}>
      <div style={{ display: 'flex', background: '#F4F7F6', borderBottom: '1px solid #D8E2E1', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px' }}>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button onClick={() => { setActiveTab('pipes'); setSortConfig({key:null, direction:'asc'}); }}
            style={{ 
              padding: '12px 20px', border: 'none', 
              background: activeTab === 'pipes' ? '#ffffff' : 'transparent', 
              borderBottom: activeTab === 'pipes' ? '3px solid #FA8507' : '3px solid transparent', 
              fontWeight: '700', cursor: 'pointer', fontSize: '12px', 
              color: activeTab === 'pipes' ? '#FA8507' : '#587071',
              transition: 'all 0.2s'
            }}>
            Pipe Network List
          </button>
          <button onClick={() => { setActiveTab('all'); setSortConfig({key:null, direction:'asc'}); }}
            style={{ 
              padding: '12px 20px', border: 'none', 
              background: activeTab === 'all' ? '#ffffff' : 'transparent', 
              borderBottom: activeTab === 'all' ? '3px solid #FA8507' : '3px solid transparent', 
              fontWeight: '700', cursor: 'pointer', fontSize: '12px', 
              color: activeTab === 'all' ? '#FA8507' : '#587071',
              transition: 'all 0.2s'
            }}>
            Full Equipment & Pipeline Data
          </button>
          <button onClick={() => { setActiveTab('cases'); setSortConfig({key:null, direction:'asc'}); }}
            style={{ 
              padding: '12px 20px', border: 'none', 
              background: activeTab === 'cases' ? '#ffffff' : 'transparent', 
              borderBottom: activeTab === 'cases' ? '3px solid #FA8507' : '3px solid transparent', 
              fontWeight: '700', cursor: 'pointer', fontSize: '12px', 
              color: activeTab === 'cases' ? '#FA8507' : '#587071',
              transition: 'all 0.2s',
              display: 'flex', alignItems: 'center', gap: '6px'
            }}>
            Operating Cases Matrix
          </button>
          <button onClick={() => { setActiveTab('relief'); setSortConfig({key:null, direction:'asc'}); }}
            style={{ 
              padding: '12px 20px', border: 'none', 
              background: activeTab === 'relief' ? '#ffffff' : 'transparent', 
              borderBottom: activeTab === 'relief' ? '3px solid #FA8507' : '3px solid transparent', 
              fontWeight: '700', cursor: 'pointer', fontSize: '12px', 
              color: activeTab === 'relief' ? '#FA8507' : '#587071',
              transition: 'all 0.2s',
              display: 'flex', alignItems: 'center', gap: '6px'
            }}>
            Relief & Contingency
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {activeTab === 'cases' ? (
            <div style={{ display: 'flex', gap: '8px' }}>
              {onAddCase && (
                <button
                  onClick={onAddCase}
                  style={{
                    padding: '6px 12px',
                    background: '#395253',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: '700'
                  }}
                >
                  ➕ Duplicate Case
                </button>
              )}
              <button
                onClick={fetchBatchSimulations}
                disabled={isBatchLoading}
                style={{
                  padding: '6px 14px',
                  background: isBatchLoading ? '#cbd5e1' : '#FA8507',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: isBatchLoading ? 'default' : 'pointer',
                  fontSize: '11px',
                  fontWeight: '700'
                }}
              >
                {isBatchLoading ? '⌛ Solving Cases...' : '▶ Batch Solve Matrix'}
              </button>
            </div>
          ) : activeTab === 'relief' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: '700', color: '#587071', marginRight: '4px' }}>
                Active Case View:
              </span>
              <button
                onClick={() => onToggleTelemetryMode && onToggleTelemetryMode('mitigated')}
                title="Display normal mitigated operating telemetry across canvas and tables"
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  fontFamily: 'inherit',
                  fontSize: '11px',
                  fontWeight: '700',
                  border: 'none',
                  cursor: 'pointer',
                  background: telemetryMode === 'mitigated' ? '#10B981' : '#FFFFFF',
                  color: telemetryMode === 'mitigated' ? '#FFFFFF' : '#395253',
                  boxShadow: telemetryMode === 'mitigated' ? '0 2px 6px rgba(16, 185, 129, 0.3)' : 'inset 0 0 0 1px #D8E2E1',
                  transition: 'all 0.2s'
                }}
              >
                🟢 Normal Relief (Mitigated)
              </button>

              <button
                onClick={() => onToggleTelemetryMode && onToggleTelemetryMode('unmitigated_global')}
                title="Display unmitigated overpressure baseline with all relief devices forced closed"
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  fontFamily: 'inherit',
                  fontSize: '11px',
                  fontWeight: '700',
                  border: 'none',
                  cursor: 'pointer',
                  background: telemetryMode === 'unmitigated_global' ? '#DC2626' : '#FFFFFF',
                  color: telemetryMode === 'unmitigated_global' ? '#FFFFFF' : '#395253',
                  boxShadow: telemetryMode === 'unmitigated_global' ? '0 2px 6px rgba(220, 38, 38, 0.3)' : 'inset 0 0 0 1px #D8E2E1',
                  transition: 'all 0.2s'
                }}
              >
                🔴 All Relief Devices Closed (Unmitigated)
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ position: 'relative' }}>
                <input type="text" placeholder="🔍 Filter list..." value={filterText} onChange={(e) => setFilterText(e.target.value)}
                  style={{ padding: '6px 10px', fontSize: '11px', border: '1px solid #D8E2E1', borderRadius: '6px', width: '160px', outline: 'none' }} />
                {filterText && <button onClick={() => setFilterText("")} style={{ position:'absolute', right:5, top:'50%', transform:'translateY(-50%)', border:'none', background:'none', cursor:'pointer', color:'#587071' }}>×</button>}
              </div>
              <button onClick={handleAutoSortClick} style={{ padding: '6px 14px', background: '#395253', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: '700', transition: 'background 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.background = '#253637'} onMouseLeave={(e) => e.currentTarget.style.background = '#395253'}>
                🪄 Auto Sort
              </button>
              <button onClick={exportCSV} style={{ padding: '6px 14px', background: '#FA8507', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: '700', transition: 'background 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.background = '#E07600'} onMouseLeave={(e) => e.currentTarget.style.background = '#FA8507'}>
                ⬇ Export CSV
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="matrix-scroll-container" style={{ flexGrow: 1, overflowY: 'auto', overflowX: 'auto', maxWidth: '100%', display: 'block' }}>
        {activeTab === 'cases' ? (
          <div style={{ display: 'inline-block', minWidth: '100%', boxSizing: 'border-box', verticalAlign: 'top' }}>
            {isBatchLoading ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#587071', fontSize: '13px', fontWeight: '600' }}>
                ⌛ Running batch simulations across all operating cases...
              </div>
            ) : batchError ? (
              <div style={{ padding: '16px', color: '#ef4444', background: '#fef2f2', borderRadius: '8px', border: '1px solid #fee2e2' }}>
                <strong>Batch Simulation Error:</strong> {batchError}
              </div>
            ) : (
              <table style={{ width: '100%', height: 'max-content', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'left', tableLayout: 'auto' }}>
                <thead>
                  <tr style={{ background: '#EBF0EF', borderBottom: '2px solid #D8E2E1', color: '#395253', fontWeight: '700', height: '40px' }}>
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
                            borderLeft: caseDragOverIdx === colIdx ? '3px solid #FA8507' : '1px solid #D8E2E1',
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
                                border: '1px solid #D8E2E1', 
                                padding: '3px 6px', 
                                borderRadius: '5px', 
                                fontWeight: '700', 
                                color: isActive ? '#FA8507' : '#1C2B2C', 
                                outline: 'none', 
                                background: '#ffffff',
                                transition: 'width 0.15s ease'
                              }}
                              value={caseName} 
                              onChange={(e) => onRenameCase && onRenameCase(caseId, e.target.value)}
                              onPointerDown={(e) => e.stopPropagation()} 
                              onMouseDown={(e) => e.stopPropagation()}
                            />
                            {isBase && <span style={{ fontSize: '10px', fontWeight: '800', color: '#395253' }}>(Base)</span>}
                            {!isActive && onSelectCase && (
                              <button
                                onClick={() => onSelectCase(caseId)}
                                style={{ padding: '2px 6px', fontSize: '10px', borderRadius: '4px', border: '1px solid #D8E2E1', background: '#ffffff', cursor: 'pointer', color: '#395253', fontWeight: '600', whiteSpace: 'nowrap' }}
                              >
                                ⚡ Switch
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
                                style={{ padding: '2px 6px', fontSize: '10px', borderRadius: '4px', border: '1px solid #fee2e2', background: '#fef2f2', cursor: 'pointer', color: '#ef4444', fontWeight: '600', whiteSpace: 'nowrap' }}
                              >
                                🗑️
                              </button>
                            )}
                            {isActive && <span style={{ fontSize: '10px', color: '#FA8507', fontWeight: 'bold' }}>Active</span>}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {/* Max Pressure */}
                  <tr style={{ borderBottom: '1px solid #EBF0EF', height: '36px' }}>
                    <td style={{ padding: '6px 12px', fontWeight: '700', color: '#1C2B2C', verticalAlign: 'middle', width: '200px', minWidth: '200px', maxWidth: '200px', whiteSpace: 'nowrap' }}>System Max Pressure (bar)</td>
                    {displayCases.map((c, colIdx) => {
                      const baseKpis = displayCases.find(b => b.is_base)?.kpis;
                      const kpis = c.kpis || {};
                      const val = kpis.max_pressure_bar;
                      const deltaStr = !c.is_base && baseKpis ? formatDelta(val, baseKpis.max_pressure_bar, 'bar') : null;
                      return (
                        <td key={c.case_id || c.id} style={{ padding: '6px 12px', borderLeft: caseDragOverIdx === colIdx ? '3px solid #FA8507' : '1px solid #D8E2E1', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                          <span style={{ fontWeight: '700', color: '#1C2B2C' }}>{val !== undefined ? `${val} bar` : '—'}</span>
                          {deltaStr && <span style={{ fontSize: '10px', color: '#d97706', marginLeft: '8px' }}>{deltaStr}</span>}
                        </td>
                      );
                    })}
                  </tr>
                  {/* Min Pressure */}
                  <tr style={{ borderBottom: '1px solid #EBF0EF', background: '#F8FAFA', height: '36px' }}>
                    <td style={{ padding: '6px 12px', fontWeight: '700', color: '#1C2B2C', verticalAlign: 'middle', width: '200px', minWidth: '200px', maxWidth: '200px', whiteSpace: 'nowrap' }}>System Min Pressure (bar)</td>
                    {displayCases.map((c, colIdx) => {
                      const baseKpis = displayCases.find(b => b.is_base)?.kpis;
                      const kpis = c.kpis || {};
                      const val = kpis.min_pressure_bar;
                      const deltaStr = !c.is_base && baseKpis ? formatDelta(val, baseKpis.min_pressure_bar, 'bar') : null;
                      return (
                        <td key={c.case_id || c.id} style={{ padding: '6px 12px', borderLeft: caseDragOverIdx === colIdx ? '3px solid #FA8507' : '1px solid #D8E2E1', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                          <span style={{ fontWeight: '700', color: '#1C2B2C' }}>{val !== undefined ? `${val} bar` : '—'}</span>
                          {deltaStr && <span style={{ fontSize: '10px', color: '#d97706', marginLeft: '8px' }}>{deltaStr}</span>}
                        </td>
                      );
                    })}
                  </tr>
                  {/* Total Pump Flow */}
                  <tr style={{ borderBottom: '1px solid #EBF0EF', height: '36px' }}>
                    <td style={{ padding: '6px 12px', fontWeight: '700', color: '#1C2B2C', verticalAlign: 'middle', width: '200px', minWidth: '200px', maxWidth: '200px', whiteSpace: 'nowrap' }}>Total Pump Flow (L/min)</td>
                    {displayCases.map((c, colIdx) => {
                      const baseKpis = displayCases.find(b => b.is_base)?.kpis;
                      const kpis = c.kpis || {};
                      const val = kpis.total_flow_lmin;
                      const deltaStr = !c.is_base && baseKpis ? formatDelta(val, baseKpis.total_flow_lmin, 'L/min') : null;
                      return (
                        <td key={c.case_id || c.id} style={{ padding: '6px 12px', borderLeft: caseDragOverIdx === colIdx ? '3px solid #FA8507' : '1px solid #D8E2E1', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                          <span style={{ fontWeight: '700', color: '#1C2B2C' }}>{val !== undefined ? `${val} L/min` : '—'}</span>
                          {deltaStr && <span style={{ fontSize: '10px', color: '#d97706', marginLeft: '8px' }}>{deltaStr}</span>}
                        </td>
                      );
                    })}
                  </tr>
                  {/* Total Pump Power */}
                  <tr style={{ borderBottom: '1px solid #EBF0EF', background: '#F8FAFA', height: '36px' }}>
                    <td style={{ padding: '6px 12px', fontWeight: '700', color: '#1C2B2C', verticalAlign: 'middle', width: '200px', minWidth: '200px', maxWidth: '200px', whiteSpace: 'nowrap' }}>Total Pump Power (kW)</td>
                    {displayCases.map((c, colIdx) => {
                      const baseKpis = displayCases.find(b => b.is_base)?.kpis;
                      const kpis = c.kpis || {};
                      const val = kpis.total_pump_power_kw;
                      const deltaStr = !c.is_base && baseKpis ? formatDelta(val, baseKpis.total_pump_power_kw, 'kW') : null;
                      return (
                        <td key={c.case_id || c.id} style={{ padding: '6px 12px', borderLeft: caseDragOverIdx === colIdx ? '3px solid #FA8507' : '1px solid #D8E2E1', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                          <span style={{ fontWeight: '700', color: '#1C2B2C' }}>{val !== undefined ? `${val} kW` : '—'}</span>
                          {deltaStr && <span style={{ fontSize: '10px', color: '#d97706', marginLeft: '8px' }}>{deltaStr}</span>}
                        </td>
                      );
                    })}
                  </tr>
                  {/* Cavitation Warning */}
                  <tr style={{ borderBottom: '1px solid #EBF0EF', height: '36px' }}>
                    <td style={{ padding: '6px 12px', fontWeight: '700', color: '#1C2B2C', verticalAlign: 'middle', width: '200px', minWidth: '200px', maxWidth: '200px', whiteSpace: 'nowrap' }}>Cavitation Risk Status</td>
                    {displayCases.map((c, colIdx) => {
                      const kpis = c.kpis || {};
                      const hasCav = kpis.has_cavitation_warning;
                      return (
                        <td key={c.case_id || c.id} style={{ padding: '6px 12px', borderLeft: caseDragOverIdx === colIdx ? '3px solid #FA8507' : '1px solid #D8E2E1', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                          {hasCav ? (
                            <span style={{ fontSize: '10px', fontWeight: '700', color: '#ef4444', background: '#fef2f2', padding: '2px 8px', borderRadius: '10px', border: '1px solid #fee2e2' }}>
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
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#587071', fontSize: '13px', fontWeight: '600' }}>
                ℹ No Pressure Safety Valves or Rupture Discs in the current diagram. Drag a PSV or Rupture Disc from the sidebar onto the canvas to enable relief contingency analysis.
              </div>
            ) : (
              <table style={{ width: '100%', height: 'max-content', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'left', tableLayout: 'auto' }}>
                <thead>
                  <tr style={{ background: '#EBF0EF', borderBottom: '2px solid #D8E2E1', color: '#395253', fontWeight: '700', height: '40px' }}>
                    <th style={{ padding: '6px 12px', verticalAlign: 'middle', width: '180px', minWidth: '180px', whiteSpace: 'nowrap' }}>Relief Equipment Tag</th>
                    <th style={{ padding: '6px 12px', verticalAlign: 'middle', width: '140px', minWidth: '140px', whiteSpace: 'nowrap' }}>Equipment Type</th>
                    <th style={{ padding: '6px 12px', verticalAlign: 'middle', width: '120px', minWidth: '120px', whiteSpace: 'nowrap' }}>Set / Burst Rating</th>
                    {displayCases.map(c => (
                      <th key={c.id || c.case_id} style={{ padding: '6px 12px', verticalAlign: 'middle', minWidth: '160px', background: (c.id || c.case_id) === activeCaseId ? '#fff7ed' : 'inherit', borderLeft: '1px solid #D8E2E1', whiteSpace: 'nowrap' }}>
                        {c.name || c.case_name} {c.is_base ? '(Base)' : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reliefDevices.map((dev, idx) => {
                    const devTypeLabel = dev.type === 'rupture_disc'
                      ? 'Rupture Disc'
                      : (dev.data?.action_mode === 'modulating' ? 'PSV (Modulating)' : 'PSV (Pop Action)');
                    const ratingLabel = dev.type === 'rupture_disc'
                      ? `${dev.data?.burst_pressure_bar || 30.0} bar`
                      : `${dev.data?.set_pressure_bar || 20.0} bar`;

                    return (
                      <tr key={dev.id} style={{ borderBottom: '1px solid #EBF0EF', background: idx % 2 === 0 ? '#FFFFFF' : '#F8FAFA', height: '36px' }}>
                        <td 
                          onClick={() => onSelectNode && onSelectNode(dev.id)} 
                          style={{ padding: '6px 12px', fontWeight: '700', color: '#FA8507', cursor: 'pointer', verticalAlign: 'middle' }}
                          title="Click to locate on canvas"
                        >
                          {dev.data?.label || dev.id}
                        </td>
                        <td style={{ padding: '6px 12px', color: '#587071', verticalAlign: 'middle' }}>{devTypeLabel}</td>
                        <td style={{ padding: '6px 12px', fontWeight: '600', color: '#1C2B2C', verticalAlign: 'middle' }}>{ratingLabel}</td>
                        
                        {displayCases.map(c => {
                          const caseId = c.id || c.case_id;
                          const caseOverride = !c.is_base && c.overrides?.nodes?.[dev.id]?.forced_state;
                          const effectiveForcedState = caseOverride || dev.data?.forced_state || 'auto';

                          return (
                            <td key={caseId} style={{ padding: '4px 12px', background: caseId === activeCaseId ? '#fff7ed' : 'inherit', borderLeft: '1px solid #D8E2E1', verticalAlign: 'middle' }}>
                              <select
                                value={effectiveForcedState}
                                onChange={(e) => handleMatrixForcedStateChange(caseId, dev.id, e.target.value)}
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '11px',
                                  fontWeight: '700',
                                  borderRadius: '6px',
                                  border: `1px solid ${
                                    effectiveForcedState === 'forced_closed' ? '#FEE2E2' : (effectiveForcedState === 'forced_open' ? '#FEF3C7' : '#D8E2E1')
                                  }`,
                                  background: effectiveForcedState === 'forced_closed' ? '#FEF2F2' : (effectiveForcedState === 'forced_open' ? '#FFFBEB' : '#FFFFFF'),
                                  color: effectiveForcedState === 'forced_closed' ? '#EF4444' : (effectiveForcedState === 'forced_open' ? '#D97706' : '#1C2B2C'),
                                  cursor: 'pointer',
                                  outline: 'none',
                                  width: '100%'
                                }}
                              >
                                <option value="auto">Auto (Normal Relief)</option>
                                <option value="forced_closed">🔒 Forced Closed</option>
                                <option value="forced_open">🔓 Forced Open</option>
                              </select>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}

                  {/* Summary Section Header */}
                  <tr style={{ background: '#EBF0EF', borderTop: '2px solid #D8E2E1', borderBottom: '2px solid #D8E2E1', color: '#395253', fontWeight: '700', height: '36px' }}>
                    <td colSpan={3} style={{ padding: '6px 12px', fontWeight: '800', verticalAlign: 'middle' }}>
                      Overpressure & Relief Telemetry Summary
                    </td>
                    {displayCases.map(c => (
                      <td key={c.id || c.case_id} style={{ padding: '6px 12px', fontWeight: '700', background: (c.id || c.case_id) === activeCaseId ? '#fff7ed' : 'inherit', borderLeft: '1px solid #D8E2E1', verticalAlign: 'middle' }}>
                        {c.name || c.case_name}
                      </td>
                    ))}
                  </tr>

                  {/* Max System Pressure */}
                  <tr style={{ borderBottom: '1px solid #EBF0EF', height: '36px' }}>
                    <td colSpan={3} style={{ padding: '6px 12px', fontWeight: '700', color: '#1C2B2C', verticalAlign: 'middle' }}>Max System Pressure (bar)</td>
                    {displayCases.map(c => {
                      const pMax = c.kpis?.max_pressure_bar;
                      return (
                        <td key={c.id || c.case_id} style={{ padding: '6px 12px', fontWeight: '700', color: pMax > 20 ? '#EF4444' : '#10B981', borderLeft: '1px solid #D8E2E1', verticalAlign: 'middle' }}>
                          {pMax !== undefined ? `${pMax.toFixed(2)} bar` : '—'}
                        </td>
                      );
                    })}
                  </tr>

                  {/* Unmitigated Peak Pressure */}
                  <tr style={{ borderBottom: '1px solid #EBF0EF', background: '#FEF2F2', height: '36px' }}>
                    <td colSpan={3} style={{ padding: '6px 12px', fontWeight: '700', color: '#DC2626', verticalAlign: 'middle' }}>Unmitigated Peak Pressure (bara)</td>
                    {displayCases.map(c => {
                      const caseId = c.id || c.case_id;
                      const unmit = caseId === activeCaseId ? (telemetryUnmitigated || c.telemetry_unmitigated) : c.telemetry_unmitigated;
                      const pMaxUnmit = calculateMaxPressureBar(unmit);
                      return (
                        <td key={caseId} style={{ padding: '6px 12px', fontWeight: '700', color: '#DC2626', borderLeft: '1px solid #D8E2E1', verticalAlign: 'middle' }}>
                          {pMaxUnmit !== undefined ? `${pMaxUnmit.toFixed(2)} bara` : '—'}
                        </td>
                      );
                    })}
                  </tr>

                  {/* Total Relief Flow */}
                  <tr style={{ borderBottom: '1px solid #EBF0EF', background: '#F8FAFA', height: '36px' }}>
                    <td colSpan={3} style={{ padding: '6px 12px', fontWeight: '700', color: '#1C2B2C', verticalAlign: 'middle' }}>Total Relief Flow (L/min)</td>
                    {displayCases.map(c => {
                      const totalReliefFlow = reliefDevices.reduce((sum, dev) => {
                        const devTel = c.telemetry?.nodes?.[dev.id];
                        const qOut = devTel?.outlets?.[0]?.flow_rate || 0;
                        return sum + Math.abs(qOut);
                      }, 0) * 60000;
                      return (
                        <td key={c.id || c.case_id} style={{ padding: '6px 12px', fontWeight: '600', color: '#1C2B2C', borderLeft: '1px solid #D8E2E1', verticalAlign: 'middle' }}>
                          {totalReliefFlow.toFixed(1)} L/min
                        </td>
                      );
                    })}
                  </tr>

                  {/* Relief Operating Statuses */}
                  <tr style={{ height: '36px' }}>
                    <td colSpan={3} style={{ padding: '6px 12px', fontWeight: '700', color: '#1C2B2C', verticalAlign: 'middle' }}>Relief Operating Statuses</td>
                    {displayCases.map(c => {
                      const statuses = reliefDevices.map(dev => {
                        const devTel = c.telemetry?.nodes?.[dev.id];
                        const st = devTel?.status || 'N/A';
                        return `${dev.data?.label || dev.id}: ${st}`;
                      });
                      return (
                        <td key={c.id || c.case_id} style={{ padding: '6px 12px', fontSize: '10px', color: '#587071', borderLeft: '1px solid #D8E2E1', verticalAlign: 'middle' }}>
                          {statuses.join(', ')}
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
            <tr style={{ background: '#EBF0EF', borderBottom: '2px solid #D8E2E1', color: '#395253', fontWeight: '700', position: 'sticky', top: 0, zIndex: 1 }}>

              <th style={{ padding: '8px', width: '40px' }}></th>
              <SortHeader label="Type" sortKey="displayType" sortConfig={sortConfig} requestSort={requestSort} />
              <SortHeader label="Name" sortKey="label" sortConfig={sortConfig} requestSort={requestSort} />
              <SortHeader label="Flow (L/min)" sortKey="flow" align="right" sortConfig={sortConfig} requestSort={requestSort} />
              <SortHeader label="Velocity (m/s)" sortKey="velocity" align="right" sortConfig={sortConfig} requestSort={requestSort} />
              <SortHeader label="dP (bar)" sortKey="dp" align="right" sortConfig={sortConfig} requestSort={requestSort} />
              <SortHeader label="P Start (bara)" sortKey="pStart" align="right" sortConfig={sortConfig} requestSort={requestSort} />
              <SortHeader label="P End (bara)" sortKey="pEnd" align="right" sortConfig={sortConfig} requestSort={requestSort} />
              <SortHeader label="Temp (°C)" sortKey="temp" align="right" sortConfig={sortConfig} requestSort={requestSort} />
              {activeTab === 'pipes' && <th style={{ padding: '8px' }}>NPS</th>}
              {activeTab === 'pipes' && <th style={{ padding: '8px' }}>Schedule</th>}
              {activeTab === 'pipes' && <SortHeader label="Length (m)" sortKey="length" align="right" sortConfig={sortConfig} requestSort={requestSort} />}
            </tr>
          </thead>
          <tbody>
            {processedItems.map((entry, idx) => {
              const isNode = entry.type === 'node';
              const item = entry.item;
              const diaValue = isNode ? (item.data.orifice_diameter || item.data.pipe_diameter || 0) : (item.data.diameter || 0.1);
              const match = findClosestPipeMatch(diaValue);
              const currentDn = item.data.standardDn || (match ? match.dn : 50);
              const currentSch = item.data.standardSch || (match ? match.sch : "40");
              const pipeInfo = ASME_PIPE_STANDARDS.find(p => p.dn === currentDn);
              const npsDisplay = pipeInfo ? `${pipeInfo.nps}"` : `${currentDn}mm`;
              const schDisplay = currentSch;

              const handleDnChange = (newDn) => {
                const dnInt = parseInt(newDn);
                const pipe = ASME_PIPE_STANDARDS.find(p => p.dn === dnInt);
                if (pipe && !isNode) {
                  const sch = pipe.schedules[currentSch] ? currentSch : Object.keys(pipe.schedules)[0];
                  const newId = calculatePipeId(pipe.od, pipe.schedules[sch]);
                  onUpdateEdge(item.id, { diameter: newId, standardDn: dnInt, standardSch: sch });
                }
              };

              const handleSchChange = (newSch) => {
                const pipe = ASME_PIPE_STANDARDS.find(p => p.dn === currentDn);
                if (pipe && pipe.schedules[newSch] && !isNode) {
                  const newId = calculatePipeId(pipe.od, pipe.schedules[newSch]);
                  onUpdateEdge(item.id, { diameter: newId, standardSch: newSch });
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

              return (
                <tr key={item.id} draggable={!sortConfig.key && !isEditing} onDragStart={(e) => onDragStart(e, entry.originalIndex)}
                  onDragOver={(e) => onDragOver(e, entry.originalIndex)} onDrop={(e) => onDrop(e, entry.originalIndex)}
                  onClick={() => handleRowClick(entry)}
                  style={{ 
                    borderBottom: '1px solid #EBF0EF', cursor: sortConfig.key ? 'pointer' : (isEditing ? 'text' : 'grab'), transition: 'background 0.15s ease',
                    backgroundColor: draggedIdx === entry.originalIndex ? '#EBF0EF' : baseBg,
                    borderTop: dragOverIdx === entry.originalIndex ? '2px solid #FA8507' : 'none', opacity: draggedIdx === entry.originalIndex ? 0.5 : 1
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = hoverBg}
                  onMouseLeave={(e) => e.currentTarget.style.background = baseBg}
                >
                  <td style={{ padding: '8px', color: '#849A9B', fontSize: '10px' }}>{sortConfig.key ? "—" : "☰"}</td>
                  <td style={{ padding: '8px', color: '#587071', fontWeight: '600' }}>{entry.displayType}</td>
                  <td style={{ padding: '8px' }}>
                    <input 
                      style={{ width: '110px', fontSize: '11px', border: '1px solid #D8E2E1', padding: '3px 6px', borderRadius: '5px', fontWeight: '700', color: '#1C2B2C', outline: 'none' }}
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
                  <td style={{ padding: '8px', textAlign: 'right', fontWeight: '600' }}>{m3sToLmin(entry.flow)}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{entry.velocity?.toFixed(2)}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{entry.dp.toFixed(3)}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{entry.pStart.toFixed(2)}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{entry.pEnd.toFixed(2)}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{kToC(entry.temp)}</td>
                  {activeTab === 'pipes' && (
                    <td style={{ padding: '8px' }} onClick={(e) => e.stopPropagation()}>
                      {!isNode ? (
                        <select 
                          style={{ fontSize: '11px', padding: '3px 6px', border: '1px solid #D8E2E1', borderRadius: '5px', color: '#395253', fontWeight: '600', background: '#ffffff', outline: 'none' }}
                          value={currentDn} 
                          onChange={(e) => { handleDnChange(e.target.value); }} 
                          onFocus={() => { handleRowClick(entry); setIsEditing(true); }}
                          onBlur={() => setIsEditing(false)}
                          onPointerDown={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          {ASME_PIPE_STANDARDS.map(p => <option key={p.dn} value={p.dn}>DN {p.dn} ({p.nps}")</option>)}
                        </select>
                      ) : npsDisplay}
                    </td>
                  )}
                  {activeTab === 'pipes' && (
                    <td style={{ padding: '8px' }} onClick={(e) => e.stopPropagation()}>
                      {!isNode ? (
                        <select 
                          style={{ fontSize: '11px', padding: '3px 6px', border: '1px solid #D8E2E1', borderRadius: '5px', color: '#395253', fontWeight: '600', background: '#ffffff', outline: 'none' }}
                          value={currentSch} 
                          onChange={(e) => handleSchChange(e.target.value)} 
                          onFocus={() => { handleRowClick(entry); setIsEditing(true); }}
                          onBlur={() => setIsEditing(false)}
                          onPointerDown={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          {pipeInfo && Object.keys(pipeInfo.schedules).map(sch => <option key={sch} value={sch}>{sch}</option>)}
                        </select>
                      ) : schDisplay}
                    </td>
                  )}
                  {activeTab === 'pipes' && (
                    <td style={{ padding: '8px', textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                      {!isNode && (
                        <input 
                          type="number" step="0.1"
                          style={{ width: '55px', fontSize: '11px', border: '1px solid #D8E2E1', padding: '3px 6px', borderRadius: '5px', textAlign: 'right', fontWeight: '600', color: '#395253', outline: 'none' }}
                          value={item.data.length}
                          onChange={(e) => handleLengthChange(e.target.value)}
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
