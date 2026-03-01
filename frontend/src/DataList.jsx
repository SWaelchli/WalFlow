import React, { useState, useEffect } from 'react';
import { paToBar, m3sToLmin, kToC, mToMm } from './utils/converters';
import { findClosestPipeMatch, ASME_PIPE_STANDARDS, calculatePipeId } from './utils/standards_library';

export default function DataList({ nodes, edges, onUpdateEdge }) {
  const [activeTab, setActiveTab] = useState('pipes');
  const [manualOrder, setManualOrder] = useState([]);

  // Calculate initial topological order
  useEffect(() => {
    const ordered = [];
    const incomingCounts = {};
    nodes.forEach(n => incomingCounts[n.id] = 0);
    edges.forEach(e => incomingCounts[e.target] = (incomingCounts[e.target] || 0) + 1);

    const queue = nodes.filter(n => incomingCounts[n.id] === 0);
    if (queue.length === 0 && nodes.length > 0) queue.push(nodes[0]);

    const processedNodes = new Set();
    const processedEdges = new Set();

    while (queue.length > 0) {
      const node = queue.shift();
      if (!node || processedNodes.has(node.id)) continue;
      
      processedNodes.add(node.id);
      ordered.push({ type: 'node', id: node.id });

      const outgoingEdges = edges.filter(e => e.source === node.id);
      outgoingEdges.forEach(edge => {
        if (!processedEdges.has(edge.id)) {
          processedEdges.add(edge.id);
          ordered.push({ type: 'edge', id: edge.id });
          
          const targetNode = nodes.find(n => n.id === edge.target);
          if (targetNode) queue.push(targetNode);
        }
      });
    }

    // Add orphans
    nodes.forEach(n => { if (!processedNodes.has(n.id)) ordered.push({ type: 'node', id: n.id }); });
    edges.forEach(e => { if (!processedEdges.has(e.id)) ordered.push({ type: 'edge', id: e.id }); });

    setManualOrder(ordered);
  }, [nodes.length, edges.length]); 

  const moveItem = (index, direction) => {
    const newOrder = [...manualOrder];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= newOrder.length) return;
    
    const [moved] = newOrder.splice(index, 1);
    newOrder.splice(targetIndex, 0, moved);
    setManualOrder(newOrder);
  };

  const renderTable = (filterType) => {
    const isPipeOnly = filterType === 'edge';
    const items = manualOrder
      .map(ref => {
        if (ref.type === 'node') {
          const node = nodes.find(n => n.id === ref.id);
          return node ? { type: 'node', item: node } : null;
        } else {
          const edge = edges.find(e => e.id === ref.id);
          return edge ? { type: 'edge', item: edge } : null;
        }
      })
      .filter(i => i !== null && (filterType === 'all' || i.type === filterType));

    return (
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'left' }}>
        <thead>
          <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
            <th style={{ padding: '6px' }}>Move</th>
            <th style={{ padding: '6px' }}>Type</th>
            <th style={{ padding: '6px' }}>Name</th>
            <th style={{ padding: '6px' }}>Flow (L/min)</th>
            {isPipeOnly && <th style={{ padding: '6px' }}>Velocity (m/s)</th>}
            <th style={{ padding: '6px' }}>P Start (bar)</th>
            <th style={{ padding: '6px' }}>P End (bar)</th>
            <th style={{ padding: '6px' }}>Temp (°C)</th>
            {isPipeOnly && <th style={{ padding: '6px' }}>NPS (inch)</th>}
            {isPipeOnly && <th style={{ padding: '6px' }}>Sch</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((entry) => {
            const isNode = entry.type === 'node';
            const item = entry.item;
            const telemetry = item.data?.telemetry;
            
            const pStart = telemetry?.inlets?.[0]?.pressure || 0;
            const pEnd = telemetry?.outlets?.[0]?.pressure || 0;
            const flow = telemetry?.outlets?.[0]?.flow_rate || 0;
            const temp = (telemetry?.outlets?.[0]?.temperature || telemetry?.inlets?.[0]?.temperature) || 293.15;
            
            const diaValue = isNode ? (item.data.orifice_diameter || item.data.pipe_diameter || 0) : (item.data.diameter || 0.1);
            
            // Calculate Velocity: v = Q / A
            let velocity = 0;
            if (diaValue > 0) {
              const area = Math.PI * Math.pow(diaValue, 2) / 4;
              velocity = flow / area;
            }

            const match = findClosestPipeMatch(diaValue);
            let npsDisplay = "-";
            let schDisplay = "-";
            let currentDn = 50;
            let currentSch = "40";
            
            if (match) {
              currentDn = match.dn;
              currentSch = match.sch;
              const pipeInfo = ASME_PIPE_STANDARDS.find(p => p.dn === match.dn);
              npsDisplay = pipeInfo ? `${pipeInfo.nps}"` : `${match.dn}mm`;
              schDisplay = match.sch;
            } else if (diaValue > 0) {
              npsDisplay = `Custom (${mToMm(diaValue)}mm)`;
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

            const masterIdx = manualOrder.findIndex(ref => ref.id === item.id);

            return (
              <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '4px' }}>
                  <div style={{ display: 'flex', gap: '2px' }}>
                    <button onClick={() => moveItem(masterIdx, -1)} style={{ padding: '1px 4px', fontSize: '9px', cursor: 'pointer' }}>▲</button>
                    <button onClick={() => moveItem(masterIdx, 1)} style={{ padding: '1px 4px', fontSize: '9px', cursor: 'pointer' }}>▼</button>
                  </div>
                </td>
                <td style={{ padding: '6px', color: '#94a3b8' }}>{isNode ? item.type.toUpperCase() : 'PIPE'}</td>
                <td style={{ padding: '6px', fontWeight: 'bold' }}>{item.data.label || item.id}</td>
                <td style={{ padding: '6px' }}>{m3sToLmin(flow)}</td>
                {isPipeOnly && <td style={{ padding: '6px' }}>{velocity.toFixed(2)}</td>}
                <td style={{ padding: '6px' }}>{paToBar(pStart)}</td>
                <td style={{ padding: '6px' }}>{paToBar(pEnd)}</td>
                <td style={{ padding: '6px' }}>{kToC(temp)}</td>
                {isPipeOnly && (
                  <td style={{ padding: '6px' }}>
                    {!isNode ? (
                      <select 
                        style={{ fontSize: '10px', padding: '2px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                        value={match ? currentDn : "custom"}
                        onChange={(e) => {
                          if (e.target.value !== 'custom') handleDnChange(e.target.value);
                        }}
                      >
                        {!match && <option value="custom">{npsDisplay}</option>}
                        {ASME_PIPE_STANDARDS.map(p => (
                          <option key={p.dn} value={p.dn}>DN {p.dn} ({p.nps}")</option>
                        ))}
                      </select>
                    ) : npsDisplay}
                  </td>
                )}
                {isPipeOnly && (
                  <td style={{ padding: '6px' }}>
                    {!isNode ? (
                      <select 
                        style={{ fontSize: '10px', padding: '2px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                        value={match ? currentSch : ""}
                        onChange={(e) => handleSchChange(e.target.value)}
                        disabled={!match}
                      >
                        {!match && <option value="">-</option>}
                        {match && Object.keys(ASME_PIPE_STANDARDS.find(p => p.dn === currentDn).schedules).map(sch => (
                          <option key={sch} value={sch}>{sch}</option>
                        ))}
                      </select>
                    ) : schDisplay}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  };

  return (
    <div style={{
      height: '350px', background: '#fff', borderTop: '2px solid #e2e8f0',
      display: 'flex', flexDirection: 'column', overflow: 'hidden'
    }}>
      <div style={{ display: 'flex', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
        <button 
          onClick={() => setActiveTab('pipes')}
          style={{
            padding: '10px 20px', border: 'none', background: activeTab === 'pipes' ? '#fff' : 'transparent',
            borderBottom: activeTab === 'pipes' ? '2px solid #3b82f6' : 'none',
            fontWeight: activeTab === 'pipes' ? 'bold' : 'normal', cursor: 'pointer', fontSize: '12px'
          }}
        >
          Pipe List
        </button>
        <button 
          onClick={() => setActiveTab('all')}
          style={{
            padding: '10px 20px', border: 'none', background: activeTab === 'all' ? '#fff' : 'transparent',
            borderBottom: activeTab === 'all' ? '2px solid #3b82f6' : 'none',
            fontWeight: activeTab === 'all' ? 'bold' : 'normal', cursor: 'pointer', fontSize: '12px'
          }}
        >
          Pipe & Equipment List
        </button>
      </div>
      <div style={{ flexGrow: 1, overflowY: 'auto', padding: '0 10px' }}>
        {activeTab === 'pipes' ? renderTable('edge') : renderTable('all')}
      </div>
    </div>
  );
}
