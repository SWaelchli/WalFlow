import React from 'react';
import { confirmDialog } from '../../utils/dialogs';
import SetupPanel from './SetupPanel';
import ResultsPanel from '../details/ResultsPanel';
import { TrashIcon, CaseIcon, CaretRightIcon } from '../symbols/IconLibrary';
import { componentLabel } from '../../constants/componentLabels';

export default function InspectorPanel({
  node,
  edge,
  effectiveNode,
  effectiveEdge,
  onUpdate,
  onUpdateEdge,
  onDelete,
  onDeleteEdge,
  onCollapse,
  heatmapActive,
  cases,
  activeCaseId,
  onResetCaseOverride,
  allNodes,
  allEdges,
  unmitigatedTelemetry,
  availablePipeClasses = [],
  allowCustomPipes = true,
  activeTab = 'setup',
  setActiveTab
}) {

  const isNode = !!node;
  const item = node || edge;
  if (!item) return null;

  const id = item.id;
  const type = item.type;
  const data = item.data || {};

  const label = isNode 
    ? (data.label || type.toUpperCase().replace('_', ' ')) 
    : (data.label && !String(data.label).startsWith('reactflow__edge-') ? data.label : 'Pipe');

  const handleDelete = async () => {
    const itemLabel = isNode ? (data.label || `node ${type}`) : (label || 'connection');
    const ok = await confirmDialog({
      title: isNode ? 'Delete component?' : 'Delete pipe?',
      message: `Delete ${itemLabel}?`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    if (isNode) onDelete(id);
    else onDeleteEdge(id);
  };

  return (
    <div className="inspector">
      <div className="inspector-header">
        <div className="inspector-title">
          <h3 className="inspector-name" title={label}>{label}</h3>
          <span className="inspector-type">{componentLabel(type, { isEdge: !isNode })}</span>
        </div>
        <button
          type="button"
          onClick={handleDelete}
          className="btn-danger-ghost btn-compact inspector-delete"
        >
          <TrashIcon size={12} />
          Delete
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Collapse inspector"
          title="Collapse inspector"
          onClick={onCollapse}
        >
          <CaretRightIcon size={14} />
        </button>
      </div>

      <div className="inspector-tabs">
        <button
          type="button"
          onClick={() => setActiveTab('setup')}
          className={`inspector-tab${activeTab === 'setup' ? ' active' : ''}`}
        >
          <CaseIcon size={12} />
          Setup
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('results')}
          className={`inspector-tab${activeTab === 'results' ? ' active' : ''}`}
        >
          Results
        </button>
      </div>

      <div className="inspector-body">
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
            availablePipeClasses={availablePipeClasses}
            allowCustomPipes={allowCustomPipes}
            allNodes={allNodes}
            allEdges={allEdges}
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
  );
}
