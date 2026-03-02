import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { paToBar, m3sToLmin, kToC, mToMm } from './utils/converters';
import { findClosestPipeMatch, ASME_PIPE_STANDARDS, calculatePipeId } from './utils/standards_library';

export default function DataList({ nodes, edges, onUpdateEdge, onUpdateNode, onSelectNode, onSelectEdge }) {
  const [activeTab, setActiveTab] = useState('pipes');
  const [manualOrder, setManualOrder] = useState([]);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [filterText, setFilterText] = useState("");
  
  const [draggedIdx, setDraggedIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);

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
  }, [nodes.length, edges.length]); 

  /**
   * autoSortLogic: Refined Engineering Sequence Algorithm
   * 
   * This algorithm organizes the equipment and pipe list in a logical process flow order:
   * 1. IDENTIFY SOURCES: Finds all nodes with no incoming pipes (typically supply tanks).
   * 2. DOWNSTREAM DFS: Traverses the graph from each source following pipe connections.
   * 3. SPLITTER BRANCHING: At splitters, it prioritizes 'outlet-0' (Outlet 1) and follows that 
   *    branch to its end before returning to follow 'outlet-1' (Outlet 2).
   * 4. MIXER CONVERGENCE (The "Wait" Rule): If a node has multiple inlets (like a Mixer), 
   *    the algorithm pauses that branch and does NOT add the Mixer to the list until 
   *    ALL incoming branches have been fully explored and reached the Mixer.
   * 5. LOOP/ORPHAN HANDLING: Ensures any recycle loops or disconnected islands are 
   *    appended to the end so no component is missed.
   */
  const autoSortLogic = (nodes, edges) => {
    const ordered = [];
    const visitedNodes = new Set();
    const visitedEdges = new Set();
    
    // 1. Calculate In-Degrees (how many pipes enter each node)
    const inDegree = {};
    nodes.forEach(n => {
      inDegree[n.id] = edges.filter(e => e.target === n.id).length;
    });

    // 2. Track how many incoming paths have reached a node during traversal
    const reachedCount = {};
    nodes.forEach(n => reachedCount[n.id] = 0);

    const sources = nodes.filter(n => !edges.some(e => e.target === n.id));
    sources.sort((a, b) => a.position.y - b.position.y);

    const traverse = (nodeId) => {
      const node = nodes.find(n => n.id === nodeId);
      if (!node) return;

      // Increment reached count for this node
      reachedCount[nodeId]++;

      // If it's a Mixer (In-degree > 1), wait until all paths arrive
      if (inDegree[nodeId] > 1 && reachedCount[nodeId] < inDegree[nodeId]) {
        return; // Pause this branch
      }

      if (visitedNodes.has(nodeId)) return;
      visitedNodes.add(nodeId);
      ordered.push({ type: 'node', id: nodeId });

      // Get outgoing pipes, prioritizing outlet-0 then outlet-1
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

    // Start from all sources
    sources.forEach(s => traverse(s.id));

    // Fallback for loops or disconnected islands
    nodes.forEach(n => { if (!visitedNodes.has(n.id)) traverse(n.id); });
    edges.forEach(e => {
      if (!visitedEdges.has(e.id)) {
        ordered.push({ type: 'edge', id: e.id });
        visitedEdges.add(e.id);
      }
    });

    return ordered;
  };

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
    let items = manualOrder.map((ref, index) => {
      if (ref.type === 'node') {
        const node = nodes.find(n => n.id === ref.id);
        if (!node) return null;
        const telemetry = node.data?.telemetry;
        const pStart = telemetry?.inlets?.[0]?.pressure || 0;
        const pEnd = telemetry?.outlets?.[0]?.pressure || 0;
        return {
          ...ref, originalIndex: index, item: node, label: node.data.label || node.id,
          displayType: node.type.replace('_',' ').toUpperCase(),
          flow: telemetry?.outlets?.[0]?.flow_rate || 0,
          dp: Math.abs(pStart - pEnd) / 100000,
          pStart: pStart / 100000, pEnd: pEnd / 100000,
          temp: (telemetry?.outlets?.[0]?.temperature || telemetry?.inlets?.[0]?.temperature) || 293.15
        };
      } else {
        const edge = edges.find(e => e.id === ref.id);
        if (!edge) return null;
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
          velocity: area > 0 ? flow / area : 0
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
    const headers = ["Type", "Name", "Flow (L/min)", "dP (bar)", "P Start (bar)", "P End (bar)", "Temp (C)"];
    const rows = processedItems.map(i => [i.displayType, i.label, m3sToLmin(i.flow), i.dp.toFixed(3), i.pStart.toFixed(2), i.pEnd.toFixed(2), kToC(i.temp)].join(","));
    const blob = new Blob([[headers.join(","), ...rows].join("\n")], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url); link.setAttribute("download", `walflow_export_${activeTab}.csv`); link.click();
  }, [processedItems, activeTab]);

  const SortHeader = ({ label, sortKey, align = 'left' }) => {
    const isSorted = sortConfig.key === sortKey;
    return (
      <th onClick={() => requestSort(sortKey)} style={{ padding: '8px', cursor: 'pointer', textAlign: align, userSelect: 'none', backgroundColor: isSorted ? '#e2e8f0' : 'inherit', transition: 'background 0.2s' }}>
        {label} {isSorted ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
      </th>
    );
  };

  return (
    <div style={{ height: '350px', background: '#fff', borderTop: '2px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', justifyContent: 'space-between', alignItems: 'center', padding: '0 15px' }}>
        <div style={{ display: 'flex' }}>
          <button onClick={() => { setActiveTab('pipes'); setSortConfig({key:null, direction:'asc'}); }}
            style={{ padding: '12px 20px', border: 'none', background: activeTab === 'pipes' ? '#fff' : 'transparent', borderBottom: activeTab === 'pipes' ? '2px solid #3b82f6' : 'none', fontWeight: activeTab === 'pipes' ? 'bold' : 'normal', cursor: 'pointer', fontSize: '12px', color: activeTab === 'pipes' ? '#3b82f6' : '#64748b' }}>
            Pipe List
          </button>
          <button onClick={() => { setActiveTab('all'); setSortConfig({key:null, direction:'asc'}); }}
            style={{ padding: '12px 20px', border: 'none', background: activeTab === 'all' ? '#fff' : 'transparent', borderBottom: activeTab === 'all' ? '2px solid #3b82f6' : 'none', fontWeight: activeTab === 'all' ? 'bold' : 'normal', cursor: 'pointer', fontSize: '12px', color: activeTab === 'all' ? '#3b82f6' : '#64748b' }}>
            Pipe & Equipment List
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ position: 'relative' }}>
            <input type="text" placeholder="🔍 Filter list..." value={filterText} onChange={(e) => setFilterText(e.target.value)}
              style={{ padding: '4px 8px', fontSize: '11px', border: '1px solid #cbd5e1', borderRadius: '4px', width: '150px' }} />
            {filterText && <button onClick={() => setFilterText("")} style={{ position:'absolute', right:5, top:'50%', transform:'translateY(-50%)', border:'none', background:'none', cursor:'pointer', color:'#94a3b8' }}>×</button>}
          </div>
          <button onClick={handleAutoSortClick} style={{ padding: '6px 12px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>
            🪄 Auto Sort
          </button>
          <button onClick={exportCSV} style={{ padding: '6px 12px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>
            ⬇ Export CSV
          </button>
        </div>
      </div>

      <div style={{ flexGrow: 1, overflowY: 'auto', overflowX: 'auto', maxWidth: '100%' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #e2e8f0', color: '#475569', position: 'sticky', top: 0, zIndex: 1 }}>
              <th style={{ padding: '8px', width: '40px' }}></th>
              <SortHeader label="Type" sortKey="displayType" />
              <SortHeader label="Name" sortKey="label" />
              <SortHeader label="Flow (L/min)" sortKey="flow" align="right" />
              <SortHeader label="dP (bar)" sortKey="dp" align="right" />
              {activeTab === 'pipes' && <SortHeader label="Velocity (m/s)" sortKey="velocity" align="right" />}
              <SortHeader label="P Start" sortKey="pStart" align="right" />
              <SortHeader label="P End" sortKey="pEnd" align="right" />
              <SortHeader label="Temp (°C)" sortKey="temp" align="right" />
              {activeTab === 'pipes' && <th style={{ padding: '8px' }}>NPS</th>}
              {activeTab === 'pipes' && <th style={{ padding: '8px' }}>Sch</th>}
            </tr>
          </thead>
          <tbody>
            {processedItems.map((entry) => {
              const isNode = entry.type === 'node';
              const item = entry.item;
              const diaValue = isNode ? (item.data.orifice_diameter || item.data.pipe_diameter || 0) : (item.data.diameter || 0.1);
              const match = findClosestPipeMatch(diaValue);
              let npsDisplay = "-", schDisplay = "-", currentDn = 50, currentSch = "40";
              if (match) {
                currentDn = match.dn; currentSch = match.sch;
                const pipeInfo = ASME_PIPE_STANDARDS.find(p => p.dn === match.dn);
                npsDisplay = pipeInfo ? `${pipeInfo.nps}"` : `${match.dn}mm`; schDisplay = match.sch;
              }
              const handleDnChange = (newDn) => {
                const pipe = ASME_PIPE_STANDARDS.find(p => p.dn === parseInt(newDn));
                if (pipe) {
                  const sch = pipe.schedules[currentSch] ? currentSch : Object.keys(pipe.schedules)[0];
                  const newId = calculatePipeId(pipe.od, pipe.schedules[sch]);
                  if (onUpdateEdge && !isNode) onUpdateEdge(item.id, { diameter: newId });
                }
              };
              const handleSchChange = (newSch) => {
                const pipe = ASME_PIPE_STANDARDS.find(p => p.dn === currentDn);
                if (pipe && pipe.schedules[newSch]) {
                  const newId = calculatePipeId(pipe.od, pipe.schedules[newSch]);
                  if (onUpdateEdge && !isNode) onUpdateEdge(item.id, { diameter: newId });
                }
              };
              const handleNameChange = (newName) => {
                if (isNode) { if (onUpdateNode) onUpdateNode(item.id, { label: newName }); }
                else { if (onUpdateEdge) onUpdateEdge(item.id, { label: newName }); }
              };
              const isDragging = draggedIdx === entry.originalIndex;
              const isDragOver = dragOverIdx === entry.originalIndex;

              return (
                <tr key={item.id} draggable={!sortConfig.key} onDragStart={(e) => onDragStart(e, entry.originalIndex)}
                  onDragOver={(e) => onDragOver(e, entry.originalIndex)} onDrop={(e) => onDrop(e, entry.originalIndex)}
                  onClick={() => handleRowClick(entry)}
                  style={{ 
                    borderBottom: '1px solid #f1f5f9', cursor: sortConfig.key ? 'pointer' : 'grab', transition: 'background 0.1s',
                    backgroundColor: item.selected ? '#f0f9ff' : (isDragging ? '#f8fafc' : 'transparent'),
                    borderTop: isDragOver ? '2px solid #000' : 'none', opacity: isDragging ? 0.5 : 1
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = item.selected ? '#e0f2fe' : '#f8fafc'}
                  onMouseLeave={(e) => e.currentTarget.style.background = item.selected ? '#f0f9ff' : 'transparent'}
                >
                  <td style={{ padding: '8px', color: '#94a3b8', fontSize: '10px' }}>{sortConfig.key ? "—" : "☰"}</td>
                  <td style={{ padding: '8px', color: '#94a3b8' }}>{entry.displayType}</td>
                  <td style={{ padding: '8px' }}>
                    <input style={{ width: '100px', fontSize: '11px', border: '1px solid #e2e8f0', padding: '2px 4px', borderRadius: '3px', fontWeight: 'bold' }}
                      value={item.data.label || item.id} onChange={(e) => handleNameChange(e.target.value)} onFocus={() => handleRowClick(entry)} />
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{m3sToLmin(entry.flow)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold', color: '#0284c7' }}>{entry.dp.toFixed(3)}</td>
                  {activeTab === 'pipes' && <td style={{ padding: '8px', textAlign: 'right' }}>{entry.velocity?.toFixed(2)}</td>}
                  <td style={{ padding: '8px', textAlign: 'right' }}>{entry.pStart.toFixed(2)}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{entry.pEnd.toFixed(2)}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{kToC(entry.temp)}</td>
                  {activeTab === 'pipes' && (
                    <td style={{ padding: '8px' }} onClick={(e) => e.stopPropagation()}>
                      {!isNode ? (
                        <select style={{ fontSize: '10px', padding: '2px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                          value={match ? currentDn : "custom"} onChange={(e) => { if (e.target.value !== 'custom') handleDnChange(e.target.value); }} onFocus={() => handleRowClick(entry)}>
                          {!match && <option value="custom">Custom</option>}
                          {ASME_PIPE_STANDARDS.map(p => <option key={p.dn} value={p.dn}>DN {p.dn} ({p.nps}")</option>)}
                        </select>
                      ) : npsDisplay}
                    </td>
                  )}
                  {activeTab === 'pipes' && (
                    <td style={{ padding: '8px' }} onClick={(e) => e.stopPropagation()}>
                      {!isNode ? (
                        <select style={{ fontSize: '10px', padding: '2px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                          value={match ? currentSch : ""} onChange={(e) => handleSchChange(e.target.value)} disabled={!match} onFocus={() => handleRowClick(entry)}>
                          {!match && <option value="">-</option>}
                          {match && Object.keys(ASME_PIPE_STANDARDS.find(p => p.dn === currentDn).schedules).map(sch => <option key={sch} value={sch}>{sch}</option>)}
                        </select>
                      ) : schDisplay}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
