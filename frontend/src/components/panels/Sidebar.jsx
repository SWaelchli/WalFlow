import React, { useState, useMemo, useEffect, useCallback } from 'react';
import axios from 'axios';
import { EquipmentSymbol } from '../symbols/SymbolLibrary';
import { InfoIcon, CheckIcon, CrossIcon, FolderIcon, SearchIcon, TrashIcon } from '../symbols/IconLibrary';


const categorizedEquipment = [
  {
    name: 'Fluid Sources',
    items: [
      { type: 'tank', label: 'Tank', description: '' },
    ]
  },
  {
    name: 'Power & Drive',
    items: [
      { type: 'centrifugal_pump', label: 'Centrifugal Pump', description: '' },
      { type: 'volumetric_pump', label: 'Volumetric Pump', description: 'Positive Displacement' },
    ]
  },
  {
    name: 'Pressure & Flow Control',
    items: [
      { type: 'linear_control_valve', label: 'Control Valve', description: '' },
      { type: 'check_valve', label: 'Check Valve', description: '' },
      { type: 'check_valve_orifice', label: 'Check Valve w/ Orifice', description: 'With Bypass' },
      { type: 'pressure_safety_valve', label: 'Safety Relief Valve', description: 'PSV / PRV Overpressure' },
      { type: 'rupture_disc', label: 'Rupture Disc', description: 'Burst Diaphragm' },
      { type: 'remote_control_valve', label: 'Remote Valve', description: 'Pilot Signal Control' },
      { type: 'linear_regulator', label: 'Pressure Regulator', description: '' },
      { type: 'three_way_tcv', label: '3-Way Temp Valve', description: 'Thermal Mixing' },
      { type: 'orifice', label: 'Orifice', description: '' },
      { type: 'calibrated_restriction', label: 'Calibrated Restriction', description: 'Flow/dP-calibrated clearance' },
    ]
  },
  {
    name: 'Distribution',
    items: [
      { type: 'splitter', label: 'Splitter', description: '' },
      { type: 'mixer', label: 'Mixer', description: '' },
    ]
  },
  {
    name: 'Auxiliary',
    items: [
      { type: 'filter', label: 'Filter', description: '' },
      { type: 'heat_exchanger', label: 'Cooler', description: '' },
    ]
  },
  {
    name: 'Documentation & Notes',
    items: [
      { type: 'text_bubble', label: 'Note', description: '' },
    ]
  }
];

const theme = {
  primary: 'var(--color-primary)',
  primaryHover: 'var(--color-primary-hover)',
  brandDark: 'var(--color-brand-dark)',
  brandDarker: 'var(--color-brand-darker)',
  slate50: 'var(--color-surface-hover)',
  slate100: '#EBF0EF',
  slate200: 'var(--color-border)',
  slate500: 'var(--color-text-secondary)',
  slate800: 'var(--color-text-primary)',
  white: 'var(--color-surface)',
  shadow: 'var(--shadow-md)'
};


function formatSolverName(method, fallbackUsed = false) {
  if (fallbackUsed) {
    return 'Levenberg-Marq (fallback)';
  }
  if (!method) return 'N/A';
  if (method === 'sparse_newton') return 'Sparse Newton';
  if (method === 'lm') return 'Levenberg-Marq';
  return method;
}

function DiagnosticsContent({ stats, batchStats, onSelectComponent }) {
  const [statsSource, setStatsSource] = useState('single');
  const [selectedBatchCaseId, setSelectedBatchCaseId] = useState('');

  const [prevStats, setPrevStats] = useState(stats);
  const [prevBatchStats, setPrevBatchStats] = useState(batchStats);

  if (stats !== prevStats) {
    setPrevStats(stats);
    setStatsSource('single');
  }

  if (batchStats !== prevBatchStats) {
    setPrevBatchStats(batchStats);
    setStatsSource('batch');
    if (batchStats && batchStats.length > 0) {
      setSelectedBatchCaseId(batchStats[0].case_id);
    }
  }

  if (!stats && (!batchStats || batchStats.length === 0)) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px', color: theme.slate500 }}>
        <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'center' }}>
          <InfoIcon size={32} color="var(--color-text-muted)" />
        </div>
        <p style={{ fontSize: '13px', margin: 0 }}>No simulation data yet.</p>
        <p style={{ fontSize: '11px', marginTop: '4px' }}>Run a simulation or batch solve to see performance.</p>
      </div>
    );
  }

  const hasSingle = !!stats;
  const hasBatch = batchStats && batchStats.length > 0;
  const activeSource = (statsSource === 'batch' && hasBatch) ? 'batch' : (hasSingle ? 'single' : 'batch');

  // Single Case Stats
  const { success, time_ms, outer_iterations, total_inner_iterations, fallback_used, system_size, bottleneck, error } = stats || {};

  // Selected Batch Case Stats
  const selectedCase = hasBatch ? (batchStats.find(c => c.case_id === selectedBatchCaseId) || batchStats[0]) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {hasSingle && hasBatch && (
        <div style={{ display: 'flex', gap: '4px', background: theme.slate55 || '#F4F7F6', padding: '3px', borderRadius: '8px', border: `1px solid ${theme.slate200}` }}>
          <button
            onClick={() => setStatsSource('single')}
            style={{
              flex: 1, padding: '6px', border: 'none', borderRadius: '6px',
              fontSize: '11px', fontWeight: '700', cursor: 'pointer',
              background: statsSource === 'single' ? theme.brandDark : 'transparent',
              color: statsSource === 'single' ? theme.white : theme.slate500,
              transition: 'all 0.15s ease'
            }}
          >
            Single Run
          </button>
          <button
            onClick={() => setStatsSource('batch')}
            style={{
              flex: 1, padding: '6px', border: 'none', borderRadius: '6px',
              fontSize: '11px', fontWeight: '700', cursor: 'pointer',
              background: statsSource === 'batch' ? theme.brandDark : 'transparent',
              color: statsSource === 'batch' ? theme.white : theme.slate500,
              transition: 'all 0.15s ease'
            }}
          >
            Batch Solve ({batchStats.length})
          </button>
        </div>
      )}

      {activeSource === 'single' && stats && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ 
            padding: '16px', 
            borderRadius: '8px', 
            background: success ? '#f0fdf4' : '#fef2f2',
            border: `1px solid ${success ? '#bbf7d0' : '#fecaca'}`,
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>{success ? <CheckIcon size={20} color="#166534" /> : <CrossIcon size={20} color="#991b1b" />}</div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: '700', color: success ? '#166534' : '#991b1b' }}>
                {success ? 'SOLVER CONVERGED' : 'SOLVER FAILED'}
              </div>
              <div style={{ fontSize: '11px', color: success ? '#15803d' : '#b91c1c' }}>
                {success ? 'System is balanced.' : error || 'Non-physical results found.'}
              </div>
            </div>
          </div>

          {bottleneck && !success && (
            <div 
              onClick={() => bottleneck.id && onSelectComponent && onSelectComponent(bottleneck.id, bottleneck.type)}
              className="sidebar-bottleneck-card"
              style={{ cursor: bottleneck.id ? 'pointer' : 'default' }}
            >
              <div style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', color: '#94a3b8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Critical Bottleneck</span>
                {bottleneck.id && <span style={{ fontSize: '9px', color: theme.primary, fontWeight: '700' }}>Click to locate</span>}
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: '700' }}>{bottleneck.name}</div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>{bottleneck.error_type}</div>
              </div>
              <div style={{ fontSize: '10px', color: '#64748b', borderTop: '1px solid #334155', paddingTop: '8px', marginTop: '4px' }}>
                This component has the largest mathematical error. Check its sizing or connections.
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <StatCard label="Total Time" value={`${time_ms.toFixed(1)} ms`} />
            <StatCard label="System Size" value={`${system_size} Eq.`} hint={stats.num_nodes !== undefined ? `${stats.num_nodes} Nodes / ${stats.num_edges} Pipes` : null} />
            <StatCard label="Control Steps" value={outer_iterations} hint="Outer Loop" />
            <StatCard label="Math Steps" value={total_inner_iterations} hint="Total Inner" />
            <StatCard label="Prop Steps" value={stats.property_iterations || 0} hint="Property Loops" />
            <StatCard label="Max Residual" value={stats.max_residual !== undefined ? stats.max_residual.toExponential(2) : 'N/A'} hint="Balance Error" />
            <StatCard label="Solver Method" value={formatSolverName(stats.solver_method, fallback_used)} />
            <StatCard label="Warm-Start" value={stats.warm_start_status || 'N/A'} />
          </div>
        </div>
      )}

      {activeSource === 'batch' && hasBatch && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ 
            padding: '12px', 
            borderRadius: '8px', 
            background: theme.slate50, 
            border: `1px solid ${theme.slate200}`,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '9px', color: theme.slate500, fontWeight: '600', textTransform: 'uppercase' }}>Total Batch Time</span>
              <span style={{ fontSize: '14px', fontWeight: '700', color: theme.slate800 }}>
                {batchStats.reduce((sum, c) => sum + (c.time_ms || 0), 0).toFixed(1)} ms
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '9px', color: theme.slate500, fontWeight: '600', textTransform: 'uppercase' }}>Success Rate</span>
              <span style={{ fontSize: '14px', fontWeight: '700', color: theme.slate800 }}>
                {((batchStats.filter(c => c.status === 'success' && !c.error_message).length / batchStats.length) * 100).toFixed(0)}%
              </span>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', color: theme.slate500, marginBottom: '6px' }}>
              Select Operating Case
            </label>
            <select
              value={selectedBatchCaseId}
              onChange={(e) => setSelectedBatchCaseId(e.target.value)}
              className="form-select"
              style={{ width: '100%' }}
            >
              {batchStats.map(c => {
                const caseSuccess = c.status === 'success' && !c.error_message;
                return (
                  <option key={c.case_id} value={c.case_id}>
                    {c.case_name} ({caseSuccess ? 'Success' : 'Failed'})
                  </option>
                );
              })}
            </select>
          </div>

          {selectedCase && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {(() => {
                const caseSuccess = selectedCase.status === 'success' && !selectedCase.error_message;
                const caseErr = selectedCase.error_message || selectedCase.error;
                return (
                  <>
                    <div style={{ 
                      padding: '16px', 
                      borderRadius: '8px', 
                      background: caseSuccess ? '#f0fdf4' : '#fef2f2',
                      border: `1px solid ${caseSuccess ? '#bbf7d0' : '#fecaca'}`,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center' }}>{caseSuccess ? <CheckIcon size={20} color="#166534" /> : <CrossIcon size={20} color="#991b1b" />}</div>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: '700', color: caseSuccess ? '#166534' : '#991b1b' }}>
                          {caseSuccess ? 'CASE CONVERGED' : 'CASE FAILED'}
                        </div>
                        <div style={{ fontSize: '11px', color: caseSuccess ? '#15803d' : '#b91c1c' }}>
                          {caseSuccess ? 'System is balanced.' : caseErr || 'Non-physical results found.'}
                        </div>
                      </div>
                    </div>

                    {selectedCase.bottleneck && !caseSuccess && (
                      <div 
                        onClick={() => selectedCase.bottleneck.id && onSelectComponent && onSelectComponent(selectedCase.bottleneck.id, selectedCase.bottleneck.type)}
                        className="sidebar-bottleneck-card"
                        style={{ cursor: selectedCase.bottleneck.id ? 'pointer' : 'default' }}
                      >
                        <div style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', color: '#94a3b8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>Critical Bottleneck</span>
                          {selectedCase.bottleneck.id && <span style={{ fontSize: '9px', color: theme.primary, fontWeight: '700' }}>Click to locate</span>}
                        </div>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: '700' }}>{selectedCase.bottleneck.name}</div>
                          <div style={{ fontSize: '11px', color: '#94a3b8' }}>{selectedCase.bottleneck.error_type}</div>
                        </div>
                        <div style={{ fontSize: '10px', color: '#64748b', borderTop: '1px solid #334155', paddingTop: '8px', marginTop: '4px' }}>
                          This component has the largest mathematical error. Check its sizing or connections.
                        </div>
                      </div>
                    )}

                    {caseSuccess && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <StatCard label="Solve Time" value={`${(selectedCase.time_ms || 0).toFixed(1)} ms`} />
                        <StatCard label="System Size" value={`${selectedCase.system_size || 0} Eq.`} hint={selectedCase.num_nodes !== undefined ? `${selectedCase.num_nodes} Nodes / ${selectedCase.num_edges} Pipes` : null} />
                        <StatCard label="Control Steps" value={selectedCase.outer_iterations || 0} hint="Outer Loop" />
                        <StatCard label="Math Steps" value={selectedCase.total_inner_iterations || 0} hint="Total Inner" />
                        <StatCard label="Prop Steps" value={selectedCase.property_iterations || 0} hint="Property Loops" />
                        <StatCard label="Max Residual" value={selectedCase.max_residual !== undefined ? selectedCase.max_residual.toExponential(2) : 'N/A'} hint="Balance Error" />
                        <StatCard label="Solver Method" value={formatSolverName(selectedCase.solver_method, selectedCase.fallback_used)} />
                        <StatCard label="Warm-Start" value={selectedCase.warm_start_status || 'N/A'} />
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, hint }) {
  return (
    <div style={{ background: theme.white, padding: '12px', borderRadius: '8px', border: `1px solid ${theme.slate200}` }}>
      <div style={{ fontSize: '10px', fontWeight: '600', color: theme.slate500, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: '16px', fontWeight: '700', color: theme.slate800, margin: '2px 0' }}>{value}</div>
      {hint && <div style={{ fontSize: '9px', color: theme.slate500 }}>{hint}</div>}
    </div>
  );
}

function CollapsibleCategory({ name, items, onDragStart }) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (items.length === 0) return null;

  return (
    <div style={{ marginBottom: '4px' }}>
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsExpanded(!isExpanded);
          }
        }}
        tabIndex="0"
        role="button"
        aria-expanded={isExpanded}
        style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          padding: '10px 8px', 
          cursor: 'pointer',
          userSelect: 'none',
          borderRadius: '6px',
          backgroundColor: isExpanded ? theme.slate50 : 'transparent',
          transition: 'background-color 0.2s',
          outline: 'none'
        }}
      >
        <h3 style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: theme.slate500, margin: 0, letterSpacing: '0.05em' }}>{name}</h3>
        <span style={{ fontSize: '10px', color: theme.slate500, transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s' }}>▼</span>
      </div>
      
      {isExpanded && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '8px 4px 16px 4px' }}>
          {items.map((item) => (
            <div
              key={item.type}
              onDragStart={(event) => onDragStart(event, item.type)}
              draggable
              className="sidebar-drag-card"
            >
              <div style={{ height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '4px' }}>
                <EquipmentSymbol type={item.type} size={36} />
              </div>
              <div style={{ fontSize: '11px', fontWeight: '700', color: theme.slate800, lineHeight: '1.2' }}>{item.label}</div>
              {item.description ? (
                <div style={{ fontSize: '9px', color: theme.slate500, lineHeight: '1.3', marginTop: '2px' }}>{item.description}</div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CollapsibleScenarios({ templates, onLoad }) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Check if templates has categories (nested objects)
  const isCategorized = templates && Object.values(templates).some(v => v && typeof v === 'object' && !v.format && !v.nodes);

  return (
    <div style={{ marginBottom: '16px', borderRadius: '8px', overflow: 'hidden', border: `1px solid ${theme.slate200}` }}>
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsExpanded(!isExpanded);
          }
        }}
        tabIndex="0"
        role="button"
        aria-expanded={isExpanded}
        style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          padding: '12px 16px', 
          cursor: 'pointer',
          background: theme.slate100,
          userSelect: 'none',
          outline: 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <FolderIcon size={16} color="var(--color-brand-dark)" />
          <h3 style={{ fontSize: '12px', fontWeight: '600', color: theme.slate800, margin: 0 }}>Library & Examples</h3>
        </div>
        <span style={{ fontSize: '10px', color: theme.slate500, transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s' }}>▼</span>
      </div>
      
      {isExpanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', background: theme.white, maxHeight: '400px', overflowY: 'auto' }}>
          {isCategorized ? (
            Object.entries(templates || {}).map(([category, items]) => (
              <div key={category} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div style={{ fontSize: '10px', fontWeight: '700', color: theme.slate500, textTransform: 'uppercase', letterSpacing: '0.5px', padding: '4px 8px 2px 8px' }}>
                  {category}
                </div>
                {Object.entries(items || {}).map(([name, data]) => (
                  <button 
                    key={name}
                    onClick={() => onLoad(data, name, { isTemplate: true })}
                    className="sidebar-list-item"
                  >
                    <span style={{ fontSize: '10px', color: theme.primary }}>•</span>
                    <span>{name}</span>
                  </button>
                ))}
              </div>
            ))
          ) : (
            Object.entries(templates || {}).map(([name, data]) => (
              <button 
                key={name}
                onClick={() => onLoad(data, name, { isTemplate: true })}
                className="sidebar-list-item"
              >
                <span style={{ fontSize: '10px', color: theme.primary }}>•</span>
                <span>{name}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ProjectFolderRow({ project, isExpanded, onToggle, onManage }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div 
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 8px',
        borderRadius: '6px',
        cursor: 'pointer',
        backgroundColor: hovered ? '#EBF0EF' : 'transparent',
        transition: 'background-color 0.15s ease',
        fontSize: '12px',
        fontWeight: '600',
        color: '#1C2B2C'
      }}
    >
      <div onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: '6px', flexGrow: 1, overflow: 'hidden' }}>
        <span style={{ fontSize: '9px', color: '#587071', width: '10px' }}>{isExpanded ? '▼' : '▶'}</span>
        <span style={{ color: '#FA8507' }}>📁</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.title}</span>
      </div>
      {hovered && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onManage(project.id);
          }}
          title="Manage project members and sharing"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#395253',
            cursor: 'pointer',
            padding: '2px 4px',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            borderRadius: '4px'
          }}
        >
          ⚙️
        </button>
      )}
    </div>
  );
}

function DiagramRow({ diagram, isActive, onLoad, onDelete }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '5px 8px',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '11px',
        backgroundColor: isActive ? '#395253' : hovered ? '#F4F7F6' : 'transparent',
        color: isActive ? '#ffffff' : '#1C2B2C',
        fontWeight: isActive ? '700' : '500',
        transition: 'all 0.15s ease'
      }}
    >
      <div onClick={onLoad} style={{ display: 'flex', alignItems: 'center', gap: '6px', flexGrow: 1, overflow: 'hidden' }}>
        <span style={{ color: isActive ? '#ffffff' : '#FA8507' }}>📄</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{diagram.title}</span>
      </div>
      {hovered && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(e);
          }}
          title="Delete drawing"
          style={{
            background: 'transparent',
            border: 'none',
            color: isActive ? '#ffffff' : '#EF4444',
            cursor: 'pointer',
            padding: '2px 4px',
            display: 'flex',
            alignItems: 'center',
            borderRadius: '4px'
          }}
        >
          <TrashIcon size={12} color={isActive ? '#ffffff' : '#EF4444'} />
        </button>
      )}
    </div>
  );
}

export default function Sidebar({
  onLoad,
  globalSettings,
  onUpdateGlobalSettings,
  templates,
  lastStats,
  batchStats,
  onSelectComponent,
  isAuthenticated,
  activeProject,
  setActiveProject,
  activeDiagram,
  setActiveDiagram,
  saveStatus,
  lastSavedTimestamp,
  hasLock,
  isLockedByOther,
  lockInfo,
  onCheckout,
  onCheckin,
  onSaveAsClick,
  onNewDrawingClick,
  onImportClick,
  onExportClick,
  onOpenProjectsModal
}) {
  const [activeTab, setActiveTab] = useState('library');
  const [searchQuery, setSearchQuery] = useState('');

  const [projectsList, setProjectsList] = useState([]);
  const [standaloneList, setStandaloneList] = useState([]);
  const [expandedProjects, setExpandedProjects] = useState({});
  const [projectDiagrams, setProjectDiagrams] = useState({});
  const [loadingFiles, setLoadingFiles] = useState(false);

  const fetchWorkspaceFiles = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoadingFiles(true);
    try {
      const projRes = await axios.get('/api/projects');
      setProjectsList(projRes.data);
      const diagRes = await axios.get('/api/diagrams');
      setStandaloneList(diagRes.data);
    } catch {
      console.warn("Failed to load workspace files");
    } finally {
      setLoadingFiles(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (activeTab === 'workspace' && isAuthenticated) {
      fetchWorkspaceFiles();
    }
  }, [activeTab, isAuthenticated, fetchWorkspaceFiles, activeDiagram]);

  const toggleProjectExpand = async (projectId) => {
    const isExpanded = !!expandedProjects[projectId];
    setExpandedProjects(prev => ({ ...prev, [projectId]: !isExpanded }));

    if (!isExpanded && !projectDiagrams[projectId]) {
      try {
        const res = await axios.get(`/api/diagrams?project_id=${projectId}`);
        setProjectDiagrams(prev => ({ ...prev, [projectId]: res.data }));
      } catch {
        console.warn("Failed to fetch project diagrams");
      }
    }
  };

  const handleLoadCloudDiagram = async (diagramId, project) => {
    try {
      const response = await axios.get(`/api/diagrams/${diagramId}`);
      const parsedData = JSON.parse(response.data.diagram_data);
      
      if (parsedData.version !== '0.2') {
        alert(`Cannot load: File format version '${parsedData.version}' is incompatible with version '0.2'.`);
        return;
      }

      if (setActiveProject) {
        setActiveProject(project ? {
          id: project.id,
          title: project.title,
          description: project.description
        } : null);
      }
      if (setActiveDiagram) {
        setActiveDiagram({
          id: response.data.id,
          title: response.data.title,
          description: response.data.description
        });
      }
      onLoad(parsedData);
    } catch {
      alert("Failed to load drawing from cloud.");
    }
  };

  const handleDeleteDiagram = async (e, diagramId, title) => {
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to delete drawing '${title}'? This action cannot be undone.`)) return;
    try {
      await axios.delete(`/api/diagrams/${diagramId}`);
      alert(`Drawing '${title}' deleted successfully.`);
      
      if (activeDiagram && activeDiagram.id === diagramId) {
        if (setActiveDiagram) setActiveDiagram(null);
        if (setActiveProject) setActiveProject(null);
        onLoad({
          version: '0.2',
          app_version: '0.2.1',
          format: 'walflow',
          created_at: new Date().toISOString(),
          nodes: [],
          edges: [],
          globalSettings: {
            fluid_type: 'water',
            ambient_temperature: 293.15,
            atmospheric_pressure: 101325.0,
            global_roughness: 0.000045,
            tolerance: 0.000001,
            inner_iterations: 1000,
            control_iterations: 100,
            solver_method: 'sparse_newton',
            warm_start: true,
            damping_factor: 0.25
          },
          cases: [
            {
              id: 'case_base',
              name: 'Base Case',
              is_base: true,
              variable_properties: {}
            }
          ],
          active_case_id: 'case_base'
        });
      }
      
      fetchWorkspaceFiles();
      
      setProjectDiagrams(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(pid => {
          next[pid] = next[pid].filter(d => d.id !== diagramId);
        });
        return next;
      });
    } catch {
      alert("Failed to delete drawing. You must be the owner of the project or drawing creator.");
    }
  };

  const filteredEquipment = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return categorizedEquipment.map(category => ({
      ...category,
      items: category.items.filter(item => 
        item.label.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query) ||
        item.type.toLowerCase().includes(query)
      )
    })).filter(category => category.items.length > 0);
  }, [searchQuery]);

  const onDragStart = (event, nodeType) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const labelStyle = { display: 'block', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: theme.slate500, marginBottom: '6px', letterSpacing: '0.04em' };
  const inputStyle = { width: '100%' };
  const hintStyle = { fontSize: '10px', color: theme.slate500, marginTop: '4px' };

  return (
    <aside style={{
      width: '320px', minWidth: '320px', background: theme.white, borderRight: `1px solid ${theme.slate200}`,
      padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px',
      overflowY: 'auto', zIndex: 10, position: 'relative', boxShadow: '2px 0 12px rgba(57,82,83,0.03)'
    }}>
      <div style={{ display: 'flex', background: theme.slate50, padding: '4px', borderRadius: '10px', border: `1px solid ${theme.slate200}` }}>
        {['library', 'settings', 'diagnostics', 'workspace'].map((tab) => (
          <button 
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1, padding: '6px 2px', border: 'none', borderRadius: '7px',
              fontSize: '10px', fontWeight: '700', cursor: 'pointer',
              textTransform: 'capitalize',
              background: activeTab === tab ? theme.brandDark : 'transparent',
              color: activeTab === tab ? theme.white : theme.slate500,
              boxShadow: activeTab === tab ? theme.shadow : 'none',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
          >
            {tab === 'diagnostics' ? 'stats' : tab}
          </button>
        ))}
      </div>



      <div style={{ flexGrow: 1 }}>
        {activeTab === 'library' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <CollapsibleScenarios templates={templates} onLoad={onLoad} />

            <div style={{ 
              position: 'sticky', 
              top: '-16px', 
              marginTop: '-16px',
              marginLeft: '-16px',
              marginRight: '-16px',
              paddingTop: '16px',
              paddingLeft: '16px',
              paddingRight: '16px',
              paddingBottom: '8px', 
              background: theme.white, 
              zIndex: 5
            }}>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center' }}>
                  <SearchIcon size={14} />
                </span>
                <input 
                  type="text" 
                  placeholder="Search equipment..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="form-input"
                  style={{ ...inputStyle, paddingLeft: '36px' }}
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: theme.slate500, cursor: 'pointer', fontSize: '16px' }}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
            
            {filteredEquipment.length > 0 ? (
              filteredEquipment.map((category) => (
                <CollapsibleCategory key={category.name} name={category.name} items={category.items} onDragStart={onDragStart} />
              ))
            ) : (
              <div style={{ textAlign: 'center', padding: '20px', color: theme.slate500, fontSize: '12px' }}>
                No components match "{searchQuery}"
              </div>
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h4 style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: theme.slate500, margin: 0, letterSpacing: '0.05em' }}>Fluid Dynamics</h4>
              
              <div>
                <label style={labelStyle}>System Fluid</label>
                <select 
                  value={globalSettings.fluid_type}
                  onChange={(e) => onUpdateGlobalSettings({ ...globalSettings, fluid_type: e.target.value })}
                  className="form-select"
                  style={inputStyle}
                >
                  <option value="water">Water (Standard)</option>
                  <option value="iso_vg_32">ISO VG 32 Oil</option>
                  <option value="iso_vg_46">ISO VG 46 Oil</option>
                </select>
                <p style={hintStyle}>Sets fluid properties (density, viscosity, thermal capacity) circulating through the network.</p>
              </div>

              <div>
                <label style={labelStyle}>Ambient Temp (°C)</label>
                <input 
                  type="number"
                  value={(globalSettings.ambient_temperature - 273.15).toFixed(1)}
                  onChange={(e) => onUpdateGlobalSettings({ ...globalSettings, ambient_temperature: parseFloat(e.target.value) + 273.15 })}
                  className="form-input"
                  style={inputStyle}
                />
                <p style={hintStyle}>Baseline environment temperature affecting heat losses and fluid properties.</p>
              </div>

              <div>
                <label style={labelStyle}>Atmospheric Pressure (Pa)</label>
                <input 
                  type="number"
                  value={globalSettings.atmospheric_pressure}
                  onChange={(e) => onUpdateGlobalSettings({ ...globalSettings, atmospheric_pressure: parseFloat(e.target.value) })}
                  className="form-input"
                  style={inputStyle}
                />
                <p style={hintStyle}>Reference atmospheric pressure used for open reservoirs and absolute calculations.</p>
              </div>

              <div>
                <label style={labelStyle}>Global Pipe Roughness (m)</label>
                <input 
                  type="number"
                  step="0.000001"
                  value={globalSettings.global_roughness}
                  onChange={(e) => onUpdateGlobalSettings({ ...globalSettings, global_roughness: parseFloat(e.target.value) })}
                  className="form-input"
                  style={inputStyle}
                />
                <p style={hintStyle}>Friction roughness inside pipes. Steel is typically 0.000045m (45 µm).</p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderTop: `1px solid ${theme.slate100}`, paddingTop: '20px' }}>
              <h4 style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: theme.slate500, margin: 0, letterSpacing: '0.05em' }}>Numerical Solver</h4>
              
              <div>
                <label style={labelStyle}>Solver Method</label>
                <select 
                  value={globalSettings.solver_method || 'sparse_newton'}
                  onChange={(e) => onUpdateGlobalSettings({ ...globalSettings, solver_method: e.target.value })}
                  className="form-select"
                  style={inputStyle}
                >
                  <option value="sparse_newton">Sparse Newton (Analytical)</option>
                  <option value="lm">LM (Least-Squares)</option>
                </select>
                <p style={hintStyle}>Sparse Newton is fast and scalable; LM is a legacy dense solver.</p>
              </div>

              <div>
                <label style={labelStyle}>Warm-Start Cache</label>
                <select 
                  value={globalSettings.warm_start !== false ? 'true' : 'false'}
                  onChange={(e) => onUpdateGlobalSettings({ ...globalSettings, warm_start: e.target.value === 'true' })}
                  className="form-select"
                  style={inputStyle}
                >
                  <option value="true">Enabled (Recommended)</option>
                  <option value="false">Disabled (Force Cold Starts)</option>
                </select>
                <p style={hintStyle}>Reuses the last solved state as an initial guess. Speeds up real-time slider and operating case updates.</p>
              </div>

              <div>
                <label style={labelStyle}>Damping Factor</label>
                <input 
                  type="number"
                  step="0.05"
                  min="0.05"
                  max="1.0"
                  value={globalSettings.damping_factor !== undefined ? globalSettings.damping_factor : 0.25}
                  onChange={(e) => onUpdateGlobalSettings({ ...globalSettings, damping_factor: parseFloat(e.target.value) })}
                  className="form-input"
                  style={inputStyle}
                />
                <p style={hintStyle}>Damping (0.05 to 1.0) for outer regulator updates. Lower prevents oscillations; higher speeds convergence.</p>
              </div>

              <div>
                <label style={labelStyle}>Control Iterations</label>
                <input 
                  type="number"
                  value={globalSettings.control_iterations || 100}
                  onChange={(e) => onUpdateGlobalSettings({ ...globalSettings, control_iterations: parseInt(e.target.value) })}
                  className="form-input"
                  style={inputStyle}
                />
                <p style={hintStyle}>Max outer loop iterations for regulators and remote control valves to settle on their setpoints.</p>
              </div>

              <div>
                <label style={labelStyle}>Property Iterations</label>
                <input 
                  type="number"
                  value={globalSettings.property_iterations}
                  onChange={(e) => onUpdateGlobalSettings({ ...globalSettings, property_iterations: parseInt(e.target.value) })}
                  className="form-input"
                  style={inputStyle}
                />
                <p style={hintStyle}>Max loops for propagating fluid temperature and thermal property updates across the network.</p>
              </div>

              <div>
                <label style={labelStyle}>Convergence Tolerance</label>
                <input 
                  type="number"
                  step="0.000001"
                  value={globalSettings.tolerance}
                  onChange={(e) => onUpdateGlobalSettings({ ...globalSettings, tolerance: parseFloat(e.target.value) })}
                  className="form-input"
                  style={inputStyle}
                />
                <p style={hintStyle}>Target numerical residual precision (e.g., 1e-6). Lower values increase solve accuracy.</p>
              </div>

              <div>
                <label style={labelStyle}>Inner Solver Iterations</label>
                <input 
                  type="number"
                  value={globalSettings.inner_iterations || 1000}
                  onChange={(e) => onUpdateGlobalSettings({ ...globalSettings, inner_iterations: parseInt(e.target.value) })}
                  className="form-input"
                  style={inputStyle}
                />
                <p style={hintStyle}>Max steps the core matrix solver is allowed to take to resolve hydraulic equations per iteration.</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'diagnostics' && (
          <DiagnosticsContent stats={lastStats} batchStats={batchStats} onSelectComponent={onSelectComponent} />
        )}

        {activeTab === 'workspace' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>
            {/* Active Drawing Card */}
            <div style={{
              backgroundColor: theme.slate50,
              border: `1px solid ${theme.slate200}`,
              borderRadius: '8px',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              <div style={{ display: 'block', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', color: theme.brandDark }}>
                Active Drawing
              </div>
              {activeDiagram ? (
                <>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: theme.slate800, wordBreak: 'break-all' }}>
                    📄 {activeDiagram.title}
                  </div>
                  <div style={{ fontSize: '11px', color: theme.slate500 }}>
                    {activeProject ? `Folder: Project "${activeProject.title}"` : 'Folder: Standalone Drawing'}
                  </div>
                  <div style={{ fontSize: '11px', color: theme.slate500, marginTop: '2px' }}>
                    {saveStatus === 'saving_cloud' ? 'Saving changes...' :
                     saveStatus === 'error' ? 'Sync error!' :
                     lastSavedTimestamp ? `Last saved: ${lastSavedTimestamp}` : 'Saved to Cloud'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                    {isLockedByOther ? (
                      <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '10px', backgroundColor: '#FFFBEB', color: '#D97706', border: '1px solid #FDE68A', fontWeight: '700' }}>
                        🔒 Locked: {lockInfo?.username}
                      </span>
                    ) : hasLock ? (
                      <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '10px', backgroundColor: '#ECFDF5', color: '#10B981', border: '1px solid #A7F3D0', fontWeight: '700' }}>
                        🟢 Checked Out
                      </span>
                    ) : (
                      <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '10px', backgroundColor: '#F4F7F6', color: '#587071', border: '1px solid #D8E2E1', fontWeight: '750' }}>
                        Available (Read-Only)
                      </span>
                    )}
                  </div>
                  <div style={{ marginTop: '6px' }}>
                    {isLockedByOther ? (
                      <p style={{ margin: 0, fontSize: '10px', color: '#D97706' }}>Drawing is read-only. Lock held by another user.</p>
                    ) : hasLock ? (
                      <button onClick={onCheckin} className="btn-secondary" style={{ width: '100%', borderColor: '#10B981', color: '#10B981', fontWeight: '700', backgroundColor: 'transparent' }}>
                        🔓 Release Edit Lock
                      </button>
                    ) : (
                      <button onClick={onCheckout} className="btn-secondary" style={{ width: '100%', color: theme.brandDark, borderColor: theme.brandDark, fontWeight: '700', backgroundColor: 'transparent' }}>
                        📝 Check Out to Edit
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: theme.slate800 }}>
                    📝 Local Draft
                  </div>
                  <div style={{ fontSize: '11px', color: theme.slate500 }}>
                    Cached in browser storage. Log in and save to cloud.
                  </div>
                </>
              )}
            </div>

            {/* Drawings Explorer */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flexGrow: 1, minHeight: '200px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: theme.slate500, letterSpacing: '0.04em' }}>Drawings Explorer</span>
                {isAuthenticated && onOpenProjectsModal && (
                  <button 
                    onClick={() => onOpenProjectsModal(null)} 
                    style={{ background: 'transparent', border: 'none', color: '#395253', fontSize: '11px', fontWeight: '600', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                  >
                    ⚙️ Manage Projects
                  </button>
                )}
              </div>
              
              {!isAuthenticated ? (
                <div style={{ padding: '16px', border: `1px dashed ${theme.slate200}`, borderRadius: '8px', textAlign: 'center', fontSize: '12px', color: theme.slate500, backgroundColor: theme.slate50 }}>
                  Please log in to browse your cloud projects and drawings.
                </div>
              ) : (
                <div className="matrix-scroll-container" style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '300px', overflowY: 'auto', paddingRight: '4px' }}>
                  {/* Project Folders */}
                  {projectsList.map(p => {
                    const isExpanded = !!expandedProjects[p.id];
                    const diags = projectDiagrams[p.id] || [];
                    return (
                      <div key={p.id} style={{ display: 'flex', flexDirection: 'column' }}>
                        <ProjectFolderRow 
                          project={p}
                          isExpanded={isExpanded}
                          onToggle={() => toggleProjectExpand(p.id)}
                          onManage={(projId) => onOpenProjectsModal(projId)}
                        />

                        {isExpanded && (
                          <div style={{ paddingLeft: '14px', borderLeft: `1px solid ${theme.slate200}`, marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {diags.length === 0 ? (
                              <div style={{ padding: '4px 8px', fontSize: '11px', color: theme.slate500 }}>
                                No drawings
                              </div>
                            ) : (
                              diags.map(d => {
                                const isActive = activeDiagram?.id === d.id;
                                return (
                                  <DiagramRow 
                                    key={d.id}
                                    diagram={d}
                                    isActive={isActive}
                                    onLoad={() => handleLoadCloudDiagram(d.id, p)}
                                    onDelete={(e) => handleDeleteDiagram(e, d.id, d.title)}
                                  />
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Standalone Drawings */}
                  {standaloneList.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', marginTop: '10px', gap: '4px' }}>
                      <div style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', color: theme.slate500, marginBottom: '2px', letterSpacing: '0.04em' }}>
                        Standalone Drawings
                      </div>
                      {standaloneList.map(d => {
                        const isActive = activeDiagram?.id === d.id;
                        return (
                          <DiagramRow 
                            key={d.id}
                            diagram={d}
                            isActive={isActive}
                            onLoad={() => handleLoadCloudDiagram(d.id, null)}
                            onDelete={(e) => handleDeleteDiagram(e, d.id, d.title)}
                          />
                        );
                      })}
                    </div>
                  )}

                  {projectsList.length === 0 && standaloneList.length === 0 && !loadingFiles && (
                    <div style={{ padding: '12px', textAlign: 'center', fontSize: '11px', color: theme.slate500 }}>
                      No cloud drawings found.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Quick Actions Panel */}
            <div style={{
              borderTop: `1px solid ${theme.slate200}`,
              paddingTop: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={onNewDrawingClick} className="btn-secondary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                  <span>+</span> New Drawing
                </button>
                <button onClick={onSaveAsClick} className="btn-secondary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                  <span>💾</span> Save As...
                </button>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={onImportClick} className="btn-secondary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                  <span>📥</span> Import File
                </button>
                <button onClick={onExportClick} className="btn-secondary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                  <span>📤</span> Export File
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
