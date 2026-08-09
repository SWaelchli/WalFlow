import React, { useState } from 'react';
import SetupPanel from './SetupPanel';
import ResultsPanel from '../details/ResultsPanel';
import { TrashIcon, CaseIcon } from '../symbols/IconLibrary';

export default function InspectorPanel({
  node,
  edge,
  effectiveNode,
  effectiveEdge,
  onUpdate,
  onUpdateEdge,
  onDelete,
  onDeleteEdge,
  heatmapActive,
  cases,
  activeCaseId,
  onResetCaseOverride,
  allNodes,
  allEdges,
  unmitigatedTelemetry,
  activeTab = 'setup',
  setActiveTab
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const isNode = !!node;
  const item = node || edge;
  if (!item) return null;

  const id = item.id;
  const type = item.type;
  const data = item.data || {};

  const label = isNode 
    ? (data.label || type.toUpperCase().replace('_', ' ')) 
    : `PIPE (${id.replace('reactflow__edge-', '')})`;

  const handleDelete = () => {
    const itemLabel = isNode ? `node ${type}` : 'connection';
    if (window.confirm(`Are you sure you want to delete this ${itemLabel}?`)) {
      if (isNode) onDelete(id);
      else onDeleteEdge(id);
    }
  };

  return (
    <div 
      style={{
        display: 'flex',
        height: '100%',
        position: 'relative',
        zIndex: 10,
        backgroundColor: '#ffffff',
        borderLeft: '1px solid #D8E2E1',
        width: isCollapsed ? '0px' : '320px',
        minWidth: isCollapsed ? '0px' : '320px',
        transition: 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: isCollapsed ? 'none' : '-2px 0 10px rgba(57, 82, 83, 0.05)',
      }}
    >
      {/* Collapse Handle Button on the Left Border */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        title={isCollapsed ? "Expand Inspector" : "Collapse Inspector"}
        style={{
          position: 'absolute',
          left: '-24px',
          top: '20px',
          width: '24px',
          height: '40px',
          border: '1px solid #D8E2E1',
          borderRight: 'none',
          backgroundColor: '#ffffff',
          borderRadius: '8px 0 0 8px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '-2px 2px 5px rgba(57, 82, 83, 0.05)',
          color: '#587071',
          zIndex: 11,
          outline: 'none'
        }}
      >
        <span style={{ fontSize: '11px', transition: 'transform 0.2s', transform: isCollapsed ? 'rotate(180deg)' : 'none', display: 'inline-block', lineHeight: 1 }}>
          ▶
        </span>
      </button>

      {/* Main Content Area */}
      {!isCollapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ padding: '16px', borderBottom: '1px solid #EBF0EF', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F4F7F6' }}>
            <div style={{ overflow: 'hidden', marginRight: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '13px', fontWeight: '700', color: '#1C2B2C', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }} title={label}>
                {label}
              </h3>
              <span style={{ fontSize: '10px', color: '#587071', textTransform: 'uppercase', fontWeight: '600' }}>
                {isNode ? type.replace('_', ' ') : 'Connection'}
              </span>
            </div>
            <button 
              onClick={handleDelete}
              className="btn-danger-ghost"
              style={{ height: '28px', padding: '0 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              <TrashIcon size={12} />
              Delete
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface-hover)', padding: '0 8px' }}>
            <button
               onClick={() => setActiveTab('setup')}
               style={{
                 flex: 1,
                 padding: '10px 0',
                 border: 'none',
                 background: 'none',
                 fontSize: '12px',
                 fontWeight: '600',
                 cursor: 'pointer',
                 color: activeTab === 'setup' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                 borderBottom: activeTab === 'setup' ? '2px solid var(--color-primary)' : '2px solid transparent',
                 transition: 'all 0.15s ease',
                 display: 'inline-flex',
                 alignItems: 'center',
                 justifyContent: 'center',
                 gap: '4px'
               }}
            >
              <CaseIcon size={12} />
              Setup
            </button>
            <button
               onClick={() => setActiveTab('results')}
               style={{
                 flex: 1,
                 padding: '10px 0',
                 border: 'none',
                 background: 'none',
                 fontSize: '12px',
                 fontWeight: '600',
                 cursor: 'pointer',
                 color: activeTab === 'results' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                 borderBottom: activeTab === 'results' ? '2px solid var(--color-primary)' : '2px solid transparent',
                 transition: 'all 0.15s ease',
                 display: 'inline-flex',
                 alignItems: 'center',
                 justifyContent: 'center',
                 gap: '4px'
               }}
            >
              Results
            </button>
          </div>

          {/* Tab Content Box */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
            {activeTab === 'setup' ? (
              <SetupPanel
                node={node}
                edge={edge}
                onUpdate={onUpdate}
                onUpdateEdge={onUpdateEdge}
                onDelete={onDelete}
                onDeleteEdge={onDeleteEdge}
                heatmapActive={heatmapActive}
                cases={cases}
                activeCaseId={activeCaseId}
                onResetCaseOverride={onResetCaseOverride}
                inline={true}
              />
            ) : (
              <ResultsPanel
                selectedNode={effectiveNode}
                selectedEdge={effectiveEdge}
                allNodes={allNodes}
                allEdges={allEdges}
                unmitigatedTelemetry={unmitigatedTelemetry}
                inline={true}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
