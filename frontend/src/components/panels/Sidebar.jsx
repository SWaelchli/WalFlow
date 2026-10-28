import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { notify, confirmDialog } from '../../utils/dialogs';
import { summarizeStats } from '../../utils/runStatus';
import axios from 'axios';
import { EquipmentSymbol } from '../symbols/SymbolLibrary';
import { InfoIcon, WarningIcon, CheckIcon, CrossIcon, FolderIcon, SearchIcon, TrashIcon, LockIcon, UnlockIcon, FolderOpenIcon, CaretDownIcon, CaretRightIcon, GearIcon, FileIcon, NoteEditIcon, SaveIcon, ImportIcon, ExportIcon, PlusIcon, DotIcon } from '../symbols/IconLibrary';
import { FLUID_CATEGORIES, FLUID_LIBRARY } from '../../constants/fluid_library';
import { useUnits } from '../../context/UnitContext';
import { FILE_FORMAT_VERSION, APP_VERSION } from '../../constants';
import { serializeDiagram } from '../../utils/diagramFile';
import { DEFAULT_BASE_CASE } from '../../constants/case_constants';
import { resolveSolverSettings, SOLVER_KEYS, DEFAULT_DRAWING_SETTINGS } from '../../utils/settingsLevels';
import SolverSettingsGroup from './SolverSettingsGroup';
import DraftNumberInput from '../common/DraftNumberInput';



import { clickableProps } from '../../utils/a11yProps';
const categorizedEquipment = [
  {
    name: 'Boundaries',
    items: [
      { type: 'tank', label: 'Tank', description: '', keywords: ['tk', 'reservoir', 'vessel'] },
      { type: 'pressure_boundary', label: 'Pressure Boundary', description: 'Constant Pressure', keywords: ['pb', 'source', 'sink', 'supply'] },
      { type: 'flow_boundary', label: 'Flow Boundary', description: 'Constant Flow', keywords: ['fb', 'source', 'sink', 'feed'] },
    ]
  },
  {
    name: 'Power & Drive',
    items: [
      { type: 'centrifugal_pump', label: 'Centrifugal Pump', description: 'Dynamic Pump', keywords: ['p', 'pump', 'cp'] },
      { type: 'volumetric_pump', label: 'Volumetric Pump', description: 'Positive Displacement Pump', keywords: ['p', 'pump', 'pd', 'vp'] },
    ]
  },
  {
    name: 'Pressure & Flow Control',
    items: [
      { type: 'linear_control_valve', label: 'Control Valve', description: '', keywords: ['cv', 'fcv', 'lcv', 'pcv', 'control'] },
      { type: 'check_valve', label: 'Check Valve', description: '', keywords: ['nrv', 'non-return', 'nonreturn'] },
      { type: 'check_valve_orifice', label: 'Check Valve w/ Orifice', description: '', keywords: ['nrv', 'non-return', 'nonreturn'] },
      { type: 'pressure_safety_valve', label: 'Safety Relief Valve', description: '', keywords: ['psv', 'prv', 'srv', 'relief', 'safety'] },
      { type: 'rupture_disc', label: 'Rupture Disc', description: '', keywords: ['rd', 'bursting', 'burst'] },
      { type: 'remote_control_valve', label: 'Remote Control Valve', description: '', keywords: ['rcv', 'cv', 'fcv', 'lcv', 'pcv', 'control'] },
      { type: 'linear_regulator', label: 'Pressure Regulator', description: '', keywords: ['pcv', 'prv', 'bpr', 'regulator'] },
      { type: 'three_way_tcv', label: '3-Way Temperature Valve', description: '', keywords: ['tcv', 'temperature', 'mixing', 'diverting'] },
    ]
  },
  {
    name: 'Piping & Fittings',
    items: [
      { type: 'reducer', label: 'Reducer / Expander', description: '', keywords: ['red', 'expander', 'swage'] },
      { type: 'orifice', label: 'Orifice', description: 'Flow Restriction Element', keywords: ['fo', 'ro', 'restriction'] },
      { type: 'calibrated_restriction', label: 'Calibrated Restriction', description: 'Flow/dP-calibrated', keywords: ['cr', 'restriction'] },
    ]
  },
  {
    name: 'Instrumentation',
    items: [
      { type: 'measure_point', label: 'Measurement Tap', description: '', keywords: ['tap', 'mp', 'probe'] },
      { type: 'instrument', label: 'Instrument', description: '', keywords: ['pit', 'tit', 'fit', 'transmitter', 'gauge'] },
    ]
  },
  {
    name: 'Distribution & Manifolds',
    items: [
      { type: 'junction', label: 'Junction', description: 'Branch / Merge, 3 to 8 Ports', keywords: ['tee', 'manifold', 'header', 'branch', 'merge'] },
    ]
  },


  {
    name: 'Auxiliary',
    items: [
      { type: 'filter', label: 'Filter', description: '', keywords: ['f', 'strainer'] },
      { type: 'heat_exchanger', label: 'Cooler', description: '', keywords: ['hx', 'e', 'cooler', 'exchanger'] },
    ]
  },
  {
    name: 'Documentation & Notes',
    items: [
      { type: 'text_bubble', label: 'Note', description: '', keywords: ['note', 'comment', 'annotation'] },
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
        <p style={{ fontSize: 'var(--fs-base)', margin: 0 }}>No simulation data yet.</p>
        <p style={{ fontSize: 'var(--fs-xs)', marginTop: '4px' }}>Run a simulation or batch solve to see performance.</p>
      </div>
    );
  }

  const hasSingle = !!stats;
  const hasBatch = batchStats && batchStats.length > 0;
  const activeSource = (statsSource === 'batch' && hasBatch) ? 'batch' : (hasSingle ? 'single' : 'batch');

  // Single Case Stats
  const { success, time_ms, outer_iterations, total_inner_iterations, fallback_used, system_size, bottleneck } = stats || {};
  const summary = summarizeStats(stats);
  const SUMMARY_TONE = {
    ok: { bg: '#f0fdf4', border: '#bbf7d0', title: '#166534', text: '#15803d' },
    warning: { bg: '#FFF7ED', border: '#FDE3C3', title: '#7A3E00', text: '#7A3E00' },
    nothing: { bg: '#FFF7ED', border: '#FDE3C3', title: '#7A3E00', text: '#7A3E00' },
    failed: { bg: '#fef2f2', border: '#fecaca', title: '#991b1b', text: '#b91c1c' },
  };
  const tone = SUMMARY_TONE[summary?.level] || SUMMARY_TONE.failed;

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
              fontSize: 'var(--fs-xs)', fontWeight: '700', cursor: 'pointer',
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
              fontSize: 'var(--fs-xs)', fontWeight: '700', cursor: 'pointer',
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
            background: tone.bg,
            border: `1px solid ${tone.border}`,
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {summary.level === 'ok' ? <CheckIcon size={20} color={tone.title} />
                : summary.level === 'failed' ? <CrossIcon size={20} color={tone.title} />
                : <WarningIcon size={20} color={tone.title} />}
            </div>
            <div>
              <div style={{ fontSize: 'var(--fs-md)', fontWeight: '700', color: tone.title }}>
                {summary.headline.toUpperCase()}
              </div>
              <div style={{ fontSize: 'var(--fs-xs)', color: tone.text }}>
                {summary.detail}
              </div>
            </div>
          </div>

          {summary.level === 'warning' && summary.notes.length > 1 && (
            <ul style={{ margin: 0, paddingLeft: '18px', fontSize: 'var(--fs-xs)', color: '#7A3E00', lineHeight: 1.5 }}>
              {summary.notes.slice(1).map((n, i) => <li key={i}>{n.text}</li>)}
            </ul>
          )}

          {bottleneck && !success && (
            <div {...clickableProps} 
              onClick={() => bottleneck.id && onSelectComponent && onSelectComponent(bottleneck.id, bottleneck.type)}
              className="sidebar-bottleneck-card"
              style={{ cursor: bottleneck.id ? 'pointer' : 'default' }}
            >
              <div style={{ fontSize: 'var(--fs-xs)', fontWeight: '700', textTransform: 'uppercase', color: 'var(--color-text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Critical Bottleneck</span>
                {bottleneck.id && <span style={{ fontSize: 'var(--fs-xs)', color: theme.primary, fontWeight: '700' }}>Click to locate</span>}
              </div>
              <div>
                <div style={{ fontSize: 'var(--fs-md)', fontWeight: '700' }}>{bottleneck.name}</div>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-muted)' }}>{bottleneck.error_type}</div>
              </div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', borderTop: '1px solid #334155', paddingTop: '8px', marginTop: '4px' }}>
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
              <span style={{ fontSize: 'var(--fs-xs)', color: theme.slate500, fontWeight: '600' }}>Total Batch Time</span>
              <span style={{ fontSize: 'var(--fs-md)', fontWeight: '700', color: theme.slate800 }}>
                {batchStats.reduce((sum, c) => sum + (c.time_ms || 0), 0).toFixed(1)} ms
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 'var(--fs-xs)', color: theme.slate500, fontWeight: '600' }}>Success Rate</span>
              <span style={{ fontSize: 'var(--fs-md)', fontWeight: '700', color: theme.slate800 }}>
                {((batchStats.filter(c => c.status === 'success' && !c.error_message).length / batchStats.length) * 100).toFixed(0)}%
              </span>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 'var(--fs-xs)', fontWeight: '600', color: theme.slate500, marginBottom: '6px' }}>
              Select operating case
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
                        <div style={{ fontSize: 'var(--fs-md)', fontWeight: '700', color: caseSuccess ? '#166534' : '#991b1b' }}>
                          {caseSuccess ? 'CASE CONVERGED' : 'CASE FAILED'}
                        </div>
                        <div style={{ fontSize: 'var(--fs-xs)', color: caseSuccess ? '#15803d' : '#b91c1c' }}>
                          {caseSuccess ? 'System is balanced.' : caseErr || 'Non-physical results found.'}
                        </div>
                      </div>
                    </div>

                    {selectedCase.bottleneck && !caseSuccess && (
                      <div {...clickableProps} 
                        onClick={() => selectedCase.bottleneck.id && onSelectComponent && onSelectComponent(selectedCase.bottleneck.id, selectedCase.bottleneck.type)}
                        className="sidebar-bottleneck-card"
                        style={{ cursor: selectedCase.bottleneck.id ? 'pointer' : 'default' }}
                      >
                        <div style={{ fontSize: 'var(--fs-xs)', fontWeight: '700', textTransform: 'uppercase', color: 'var(--color-text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>Critical Bottleneck</span>
                          {selectedCase.bottleneck.id && <span style={{ fontSize: 'var(--fs-xs)', color: theme.primary, fontWeight: '700' }}>Click to locate</span>}
                        </div>
                        <div>
                          <div style={{ fontSize: 'var(--fs-md)', fontWeight: '700' }}>{selectedCase.bottleneck.name}</div>
                          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-muted)' }}>{selectedCase.bottleneck.error_type}</div>
                        </div>
                        <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', borderTop: '1px solid #334155', paddingTop: '8px', marginTop: '4px' }}>
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
      <div style={{ fontSize: 'var(--fs-xs)', fontWeight: '600', color: theme.slate500 }}>{label}</div>
      <div style={{ fontSize: 'var(--fs-lg)', fontWeight: '700', color: theme.slate800, margin: '2px 0' }}>{value}</div>
      {hint && <div style={{ fontSize: 'var(--fs-xs)', color: theme.slate500 }}>{hint}</div>}
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
        <h3 style={{ fontSize: 'var(--fs-xs)', fontWeight: '700', textTransform: 'uppercase', color: theme.slate500, margin: 0, letterSpacing: '0.05em' }}>{name}</h3>
        <CaretDownIcon size={10} color={theme.slate500} style={{ transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s' }} />
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
              <div style={{ fontSize: 'var(--fs-xs)', fontWeight: '700', color: theme.slate800, lineHeight: '1.2' }}>{item.label}</div>
              {item.description ? (
                <div style={{ fontSize: 'var(--fs-xs)', color: theme.slate500, lineHeight: '1.3', marginTop: '2px' }}>{item.description}</div>
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
          <h3 style={{ fontSize: 'var(--fs-sm)', fontWeight: '600', color: theme.slate800, margin: 0 }}>Library & Examples</h3>
        </div>
        <CaretDownIcon size={10} color={theme.slate500} style={{ transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s' }} />
      </div>
      
      {isExpanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', background: theme.white, maxHeight: '400px', overflowY: 'auto' }}>
          {isCategorized ? (
            Object.entries(templates || {}).map(([category, items]) => (
              <div key={category} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div style={{ fontSize: 'var(--fs-xs)', fontWeight: '700', color: theme.slate500, textTransform: 'uppercase', letterSpacing: '0.5px', padding: '4px 8px 2px 8px' }}>
                  {category}
                </div>
                {Object.entries(items || {}).map(([name, data]) => (
                  <button 
                    key={name}
                    onClick={() => onLoad(data, name, { isTemplate: true })}
                    className="sidebar-list-item"
                  >
                    <span style={{ fontSize: 'var(--fs-xs)', color: theme.primary }}>•</span>
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
                <span style={{ fontSize: 'var(--fs-xs)', color: theme.primary }}>•</span>
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
        fontSize: 'var(--fs-sm)',
        fontWeight: '600',
        color: '#1C2B2C'
      }}
    >
      <div {...clickableProps} onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: '6px', flexGrow: 1, overflow: 'hidden' }}>
        {isExpanded ? <CaretDownIcon size={10} color="#587071" /> : <CaretRightIcon size={10} color="#587071" />}
        <FolderIcon size={14} color="var(--color-brand-dark)" />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.title}</span>
      </div>
      {hovered && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onManage(project.id);
          }}
          title="Manage project members and sharing"
          aria-label="Manage project members and sharing"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#395253',
            cursor: 'pointer',
            padding: '2px 4px',
            display: 'flex',
            alignItems: 'center',
            borderRadius: '4px'
          }}
        >
          <GearIcon size={14} />
        </button>
      )}
    </div>
  );
}

function DiagramRow({ diagram, isActive, isHighlighted, onClick, onOpen, onToggleLock, onDelete, currentUser }) {
  const [hovered, setHovered] = useState(false);

  const lock = diagram.lock_info;
  const isLocked = !!lock;
  const isLockedByMe = lock && currentUser && lock.user_id === currentUser.id;

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
        fontSize: 'var(--fs-xs)',
        backgroundColor: isActive ? '#395253' : isHighlighted ? '#EBF0EF' : hovered ? '#F4F7F6' : 'transparent',
        color: isActive ? '#ffffff' : '#1C2B2C',
        fontWeight: isActive ? '700' : isHighlighted ? '600' : '500',
        transition: 'all 0.15s ease'
      }}
    >
      <div {...clickableProps} 
        onClick={onClick}
        onDoubleClick={onOpen}
        style={{ display: 'flex', alignItems: 'center', gap: '6px', flexGrow: 1, overflow: 'hidden' }}
      >
        <FileIcon size={14} color={isActive ? '#ffffff' : 'var(--color-text-secondary)'} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexGrow: 1 }}>{diagram.title}</span>
      </div>
      {/* Action buttons sit beside the row button, not inside it */}
      <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        {(hovered || isHighlighted) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpen();
              }}
              title="Open drawing"
              aria-label="Open drawing"
              style={{
                background: 'transparent',
                border: 'none',
                color: isActive ? '#ffffff' : '#395253',
                cursor: 'pointer',
                padding: '2px 4px',
                display: 'flex',
                alignItems: 'center',
                borderRadius: '4px'
              }}
            >
              <FolderOpenIcon size={12} color={isActive ? '#ffffff' : '#395253'} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(e);
              }}
              title="Delete drawing"
              aria-label="Delete drawing"
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
          </div>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (isLocked && !isLockedByMe) return;
            onToggleLock();
          }}
          disabled={isLocked && !isLockedByMe}
          title={isLocked ? (isLockedByMe ? 'Release edit lock (check in)' : `Locked by ${lock.username}`) : 'Check out to edit'}
          aria-label={isLocked ? (isLockedByMe ? 'Release edit lock' : `Locked by ${lock.username}`) : 'Check out to edit'}
          style={{
            background: 'transparent',
            border: 'none',
            padding: '2px',
            cursor: (isLocked && !isLockedByMe) ? 'not-allowed' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            marginLeft: '4px',
            borderRadius: '4px',
            transition: 'opacity 0.15s'
          }}
        >
          {isLocked ? (
            <LockIcon 
              size={12} 
              color={isActive ? '#ffffff' : isLockedByMe ? '#10B981' : '#EF4444'} 
            />
          ) : (
            <UnlockIcon 
              size={12} 
              color={isActive ? 'rgba(255,255,255,0.6)' : '#587071'} 
            />
          )}
        </button>
      </div>
    </div>
  );
}

export default function Sidebar({
  onLoad,
  globalSettings,
  onUpdateGlobalSettings,
  userSettings,
  onUpdateUserSolver,
  projectSettings,
  onUpdateProjectSettings,
  templates,
  lastStats,
  batchStats,
  onSelectComponent,
  isAuthenticated,
  currentUser,
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
  const { unitSystem, setUnitSystem, isImperial } = useUnits();
  const [activeTab, setActiveTab] = useState('library');
  const [settingsSubTab, setSettingsSubTab] = useState('drawing'); // 'drawing' | 'project' | 'global'
  const [searchQuery, setSearchQuery] = useState('');

  // Solver settings on the three levels: Drawing > Project > Global
  const solverInForce = resolveSolverSettings({ drawing: globalSettings, project: projectSettings, user: userSettings });
  const solverBelowDrawing = resolveSolverSettings({ drawing: { use_drawing_solver: false }, project: projectSettings, user: userSettings });
  const solverBelowProject = resolveSolverSettings({ user: userSettings });
  const drawingSolverOn = globalSettings.use_drawing_solver === true;
  const projectSolverOn = projectSettings?.use_project_solver === true;
  const drawingSolverValues = Object.fromEntries(SOLVER_KEYS.map(k => [k, globalSettings[k] ?? solverBelowDrawing.values[k]]));

  const toggleDrawingSolver = (on) => {
    // ticking starts from the values in force, so nothing changes until the user edits
    onUpdateGlobalSettings({ ...globalSettings, ...(on ? solverBelowDrawing.values : {}), use_drawing_solver: on });
  };
  const saveProjectSettings = async (next) => {
    try {
      await onUpdateProjectSettings(next);
    } catch (err) {
      notify(err.response?.data?.detail || 'Failed to save the project settings.', 'error');
    }
  };
  const toggleProjectSolver = (on) => saveProjectSettings({
    use_project_solver: on,
    solver: on ? solverBelowProject.values : (projectSettings?.solver || solverBelowProject.values),
  });

  const [projectsList, setProjectsList] = useState([]);
  const [standaloneList, setStandaloneList] = useState([]);
  const [expandedProjects, setExpandedProjects] = useState({});
  const [projectDiagrams, setProjectDiagrams] = useState({});
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [highlightedDiagramId, setHighlightedDiagramId] = useState(null);

  // Pipe classes catalog & Project Settings state
  const [pipeClasses, setPipeClasses] = useState([]);
  const [savingPipeSpecs, setSavingPipeSpecs] = useState(false);
  const [pipeSpecSearch, setPipeSpecSearch] = useState('');

  // Drawing metadata state
  const [drawingTitle, setDrawingTitle] = useState(activeDiagram?.title || 'Local Draft');
  const [drawingDesc, setDrawingDesc] = useState(activeDiagram?.description || '');
  const [isSavingDrawingMeta, setIsSavingDrawingMeta] = useState(false);

  useEffect(() => {
    if (activeDiagram) {
      setDrawingTitle(activeDiagram.title || 'Untitled Drawing');
      setDrawingDesc(activeDiagram.description || '');
    } else {
      setDrawingTitle('Local Draft');
      setDrawingDesc('');
    }
  }, [activeDiagram]);

  const fetchPipeClasses = useCallback(async () => {
    try {
      const res = await axios.get('/api/pipe-classes');
      setPipeClasses(res.data);
    } catch {
      console.warn("Failed to load pipe classes catalog in sidebar.");
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'settings' && settingsSubTab === 'project') {
      fetchPipeClasses();
    }
  }, [activeTab, settingsSubTab, fetchPipeClasses]);

  const isOwnerOfActiveProject = Boolean(
    activeProject?.members
      ? activeProject.members.some(m => m.user_id === currentUser?.id && m.role === 'owner')
      : true
  );

  const handleTogglePipeClass = async (classId) => {
    if (!activeProject) return;
    setSavingPipeSpecs(true);
    try {
      // Allow-lists may hold class codes (older projects); toggle on ids so both forms are handled
      const currentAllowed = activeProject.allowed_pipe_classes
        ? pipeClasses
          .filter(c => activeProject.allowed_pipe_classes.includes(c.id) || activeProject.allowed_pipe_classes.includes(c.code))
          .map(c => c.id)
        : pipeClasses.map(c => c.id);
      let nextAllowed;
      if (currentAllowed.includes(classId)) {
        nextAllowed = currentAllowed.filter(id => id !== classId);
      } else {
        nextAllowed = [...currentAllowed, classId];
      }
      const isAllSelected = pipeClasses.length > 0 && nextAllowed.length === pipeClasses.length;
      const finalAllowed = isAllSelected ? null : nextAllowed;

      const res = await axios.put(`/api/projects/${activeProject.id}`, {
        allowed_pipe_classes: finalAllowed
      });

      if (setActiveProject) {
        setActiveProject(prev => ({
          ...prev,
          allowed_pipe_classes: res.data.allowed_pipe_classes
        }));
      }
    } catch {
      notify("Failed to update the project pipe classes.", 'error');
    } finally {
      setSavingPipeSpecs(false);
    }
  };

  const handleSetAllPipeClasses = async (enableAll) => {
    if (!activeProject) return;
    setSavingPipeSpecs(true);
    try {
      const finalAllowed = enableAll ? null : [];
      const res = await axios.put(`/api/projects/${activeProject.id}`, {
        allowed_pipe_classes: finalAllowed
      });
      if (setActiveProject) {
        setActiveProject(prev => ({
          ...prev,
          allowed_pipe_classes: res.data.allowed_pipe_classes
        }));
      }
    } catch {
      notify("Failed to update the project pipe classes.", 'error');
    } finally {
      setSavingPipeSpecs(false);
    }
  };

  const handleSetAllowCustomPipes = async (allow) => {
    if (!activeProject) return;
    if ((activeProject.allow_custom_pipes !== false) === allow) return;
    setSavingPipeSpecs(true);
    try {
      const res = await axios.put(`/api/projects/${activeProject.id}`, {
        allow_custom_pipes: allow
      });
      if (setActiveProject) {
        setActiveProject(prev => ({
          ...prev,
          allow_custom_pipes: res.data.allow_custom_pipes !== false
        }));
      }
    } catch {
      notify("Failed to update custom dimensions setting.", 'error');
    } finally {
      setSavingPipeSpecs(false);
    }
  };

  const handleSaveDrawingMetadata = async () => {
    if (!activeDiagram || !activeDiagram.id || !isAuthenticated) return;
    if (!drawingTitle.trim()) return;
    setIsSavingDrawingMeta(true);
    try {
      const res = await axios.put(`/api/diagrams/${activeDiagram.id}`, {
        title: drawingTitle.trim(),
        description: drawingDesc.trim()
      });
      if (setActiveDiagram) {
        setActiveDiagram(prev => ({
          ...prev,
          title: res.data.title,
          description: res.data.description,
          updated_at: res.data.updated_at
        }));
      }
      fetchWorkspaceFiles();
    } catch {
      console.warn("Failed to update drawing metadata");
    } finally {
      setIsSavingDrawingMeta(false);
    }
  };

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

  const updateDiagramLockState = useCallback((diagramId, newLock) => {
    setStandaloneList(prev => prev.map(d => {
      if (d.id === diagramId) {
        return { ...d, lock_info: newLock };
      }
      return d;
    }));

    setProjectDiagrams(prev => {
      const updated = { ...prev };
      let changed = false;
      for (const projId in updated) {
        const list = updated[projId];
        if (list && list.some(d => d.id === diagramId)) {
          updated[projId] = list.map(d => {
            if (d.id === diagramId) {
              return { ...d, lock_info: newLock };
            }
            return d;
          });
          changed = true;
        }
      }
      return changed ? updated : prev;
    });
  }, []);

  // Keep explorer tree padlocks instantly synchronized with active drawing lock status changes
  useEffect(() => {
    if (!activeDiagram) return;
    updateDiagramLockState(activeDiagram.id, lockInfo);
  }, [activeDiagram, lockInfo, updateDiagramLockState]);

  const handleToggleLock = useCallback(async (diagram) => {
    if (!isAuthenticated) return;
    const lock = diagram.lock_info;
    const isLocked = !!lock;
    const isLockedByMe = lock && currentUser && lock.user_id === currentUser.id;

    if (isLocked) {
      if (!isLockedByMe) return; // Safeguard: locked by someone else
      try {
        await axios.post(`/api/diagrams/${diagram.id}/checkin`);
        updateDiagramLockState(diagram.id, null);
        if (activeDiagram?.id === diagram.id && onCheckin) {
          onCheckin();
        }
      } catch (err) {
        console.error("Failed to release lock from explorer:", err);
      }
    } else {
      try {
        const res = await axios.post(`/api/diagrams/${diagram.id}/checkout`);
        if (res.data.status === 'success') {
          const newLock = res.data.lock;
          updateDiagramLockState(diagram.id, newLock);
          if (activeDiagram?.id === diagram.id && onCheckout) {
            onCheckout();
          }
        }
      } catch (err) {
        console.error("Failed to acquire lock from explorer:", err);
        if (err.response && err.response.data && err.response.data.detail) {
          notify(err.response.data.detail, 'warning');
        } else {
          notify('Could not check out diagram. It may be locked by another user.', 'error');
        }
      }
    }
  }, [isAuthenticated, currentUser, activeDiagram, onCheckout, onCheckin, updateDiagramLockState]);

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
      
      // Load first; switch project/diagram only if the load was accepted.
      // Cloud diagrams carry their own project, so no "detach cloud sync" prompt.
      const accepted = await onLoad(parsedData, response.data.title, { skipProjectCheck: true });
      if (accepted === false) return;

      if (setActiveDiagram) {
        setActiveDiagram({
          id: response.data.id,
          title: response.data.title,
          description: response.data.description,
          updated_at: response.data.updated_at
        });
      }

      if (setActiveProject) {
        if (project) {
          try {
            const freshProj = await axios.get(`/api/projects/${project.id}`);
            setActiveProject({
              id: freshProj.data.id,
              title: freshProj.data.title,
              description: freshProj.data.description,
              allowed_pipe_classes: freshProj.data.allowed_pipe_classes,
              allow_custom_pipes: freshProj.data.allow_custom_pipes !== false
            });
          } catch {
            setActiveProject({
              id: project.id,
              title: project.title,
              description: project.description,
              allowed_pipe_classes: project.allowed_pipe_classes,
              allow_custom_pipes: project.allow_custom_pipes !== false
            });
          }
        } else {
          setActiveProject(null);
        }
      }
    } catch {
      notify("Failed to load drawing from cloud.", 'error');
    }
  };


  const handleDeleteDiagram = async (e, diagramId, title) => {
    e.stopPropagation();
    const ok = await confirmDialog({
      title: 'Delete drawing?',
      message: `Delete drawing '${title}'? This action cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await axios.delete(`/api/diagrams/${diagramId}`);
      notify(`Drawing '${title}' deleted successfully.`, 'success');
      
      if (activeDiagram && activeDiagram.id === diagramId) {
        if (setActiveDiagram) setActiveDiagram(null);
        if (setActiveProject) setActiveProject(null);
        onLoad(serializeDiagram({
          nodes: [],
          edges: [],
          globalSettings: { ...DEFAULT_DRAWING_SETTINGS },
          cases: [DEFAULT_BASE_CASE],
          activeCaseId: 'case_base'
        }));
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
      notify("Failed to delete drawing. You must be the owner of the project or drawing creator.", 'error');
    }
  };

  const filteredEquipment = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return categorizedEquipment.map(category => ({
      ...category,
      items: category.items.filter(item => 
        item.label.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query) ||
        item.type.toLowerCase().includes(query) ||
        (item.keywords || []).some(k => k.includes(query))
      )
    })).filter(category => category.items.length > 0);
  }, [searchQuery]);

  const onDragStart = (event, nodeType) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const labelStyle = { display: 'block', fontSize: 'var(--fs-xs)', fontWeight: '600', color: theme.slate500, marginBottom: '6px' };
  const inputStyle = { width: '100%' };
  const hintStyle = { fontSize: 'var(--fs-xs)', color: theme.slate500, marginTop: '4px' };

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
              fontSize: 'var(--fs-xs)', fontWeight: '700', cursor: 'pointer',
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
                  <button aria-label="Clear search" title="Clear search" 
                    onClick={() => setSearchQuery('')}
                    style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: theme.slate500, cursor: 'pointer', display: 'inline-flex' }}
                  >
                    <CrossIcon size={14} />
                  </button>
                )}
              </div>
            </div>
            
            {filteredEquipment.length > 0 ? (
              filteredEquipment.map((category) => (
                <CollapsibleCategory key={category.name} name={category.name} items={category.items} onDragStart={onDragStart} />
              ))
            ) : (
              <div style={{ textAlign: 'center', padding: '20px', color: theme.slate500, fontSize: 'var(--fs-sm)' }}>
                No components match "{searchQuery}"
              </div>
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* 3-Tier Segmented Sub-Tab Switcher */}
            <div style={{
              display: 'flex',
              background: '#F4F7F6',
              padding: '3px',
              borderRadius: '8px',
              border: '1px solid #D8E2E1'
            }}>
              {[
                { id: 'drawing', label: 'Drawing' },
                { id: 'project', label: 'Project' },
                { id: 'global', label: 'Global' }
              ].map((sub) => {
                const isActive = settingsSubTab === sub.id;
                return (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => setSettingsSubTab(sub.id)}
                    style={{
                      flex: 1,
                      padding: '5px 8px',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: 'var(--fs-xs)',
                      fontWeight: '700',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      backgroundColor: isActive ? 'var(--color-brand-dark)' : 'transparent',
                      color: isActive ? '#ffffff' : 'var(--color-text-secondary)',
                      boxShadow: isActive ? '0 1px 3px rgba(57, 82, 83, 0.18)' : 'none'
                    }}
                  >
                    {sub.label}
                  </button>
                );
              })}
            </div>

            {/* SUB-TAB 1: DRAWING SETTINGS */}
            {settingsSubTab === 'drawing' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Drawing Info & Metadata Card */}
                <div style={{
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #D8E2E1',
                  borderRadius: '8px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 'var(--fs-xs)', fontWeight: '700', textTransform: 'uppercase', color: 'var(--color-text-secondary)', letterSpacing: '0.04em' }}>
                      Drawing Info
                    </span>
                    <span style={{
                      fontSize: 'var(--fs-xs)',
                      fontWeight: '700',
                      padding: '2px 6px',
                      borderRadius: '10px',
                      backgroundColor: '#F4F7F6',
                      color: 'var(--color-brand-dark)',
                      border: '1px solid #D8E2E1'
                    }}>
                      Format v{FILE_FORMAT_VERSION}
                    </span>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--fs-xs)', fontWeight: '600', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                      Title
                    </label>
                    <input
                      type="text"
                      value={drawingTitle}
                      onChange={(e) => setDrawingTitle(e.target.value)}
                      onBlur={handleSaveDrawingMetadata}
                      disabled={!activeDiagram || isLockedByOther}
                      placeholder="Drawing Title"
                      className="form-input"
                      style={{ width: '100%', height: '32px', fontSize: 'var(--fs-sm)' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--fs-xs)', fontWeight: '600', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                      Description
                    </label>
                    <input
                      type="text"
                      value={drawingDesc}
                      onChange={(e) => setDrawingDesc(e.target.value)}
                      onBlur={handleSaveDrawingMetadata}
                      disabled={!activeDiagram || isLockedByOther}
                      placeholder="Optional notes or system description"
                      className="form-input"
                      style={{ width: '100%', height: '32px', fontSize: 'var(--fs-sm)' }}
                    />
                  </div>

                  {activeDiagram && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
                      <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)' }}>
                        {isLockedByOther ? 'Locked by another user' : hasLock ? 'Checked out (editing)' : 'Available (read-only)'}
                      </span>
                      {hasLock && (
                        <button
                          type="button"
                          onClick={handleSaveDrawingMetadata}
                          disabled={isSavingDrawingMeta}
                          className="btn-secondary"
                          style={{ fontSize: 'var(--fs-xs)', padding: '3px 8px', borderRadius: '4px', height: '24px' }}
                        >
                          {isSavingDrawingMeta ? 'Saving...' : 'Save Info'}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Fluid Dynamics */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <h4 style={{ fontSize: 'var(--fs-xs)', fontWeight: '700', textTransform: 'uppercase', color: theme.slate500, margin: 0, letterSpacing: '0.05em' }}>
                    Fluid Dynamics
                  </h4>
                  
                  <div>
                    <label style={labelStyle}>System fluid</label>
                    <select 
                      value={globalSettings.fluid_type}
                      onChange={(e) => onUpdateGlobalSettings({ ...globalSettings, fluid_type: e.target.value })}
                      className="form-select"
                      style={inputStyle}
                    >
                      {FLUID_CATEGORIES.map((category) => (
                        <optgroup key={category} label={category}>
                          {FLUID_LIBRARY.filter((f) => f.category === category).map((f) => (
                            <option key={f.id} value={f.id}>{f.label}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <p style={hintStyle}>Sets fluid properties (density, viscosity, thermal capacity) circulating through the network.</p>
                  </div>

                  <div>
                    <label style={labelStyle}>Ambient temperature ({isImperial ? '°F' : '°C'})</label>
                    <DraftNumberInput
                      step="0.1"
                      displayValue={
                        isImperial
                          ? ((globalSettings.ambient_temperature - 273.15) * 1.8 + 32).toFixed(1)
                          : (globalSettings.ambient_temperature - 273.15).toFixed(1)
                      }
                      onCommit={(text) => {
                        const rawVal = parseFloat(text);
                        if (isNaN(rawVal)) return;
                        const kelvin = isImperial ? ((rawVal - 32) / 1.8) + 273.15 : rawVal + 273.15;
                        if (kelvin <= 0) return;
                        onUpdateGlobalSettings({ ...globalSettings, ambient_temperature: kelvin });
                      }}
                      className="form-input"
                      style={inputStyle}
                    />
                    <p style={hintStyle}>Baseline environment temperature affecting heat losses and fluid properties.</p>
                  </div>

                  <div>
                    <label style={labelStyle}>Atmospheric pressure ({isImperial ? 'psi(a)' : 'bar(a)'})</label>
                    <DraftNumberInput
                      step={isImperial ? "0.01" : "0.001"}
                      displayValue={
                        isImperial
                          ? (globalSettings.atmospheric_pressure * 0.00014503773773).toFixed(2)
                          : Number((globalSettings.atmospheric_pressure / 100000).toFixed(5))
                      }
                      onCommit={(text) => {
                        const rawVal = parseFloat(text);
                        if (isNaN(rawVal) || rawVal <= 0) return;
                        const pa = isImperial ? rawVal * 6894.757293 : rawVal * 100000;
                        onUpdateGlobalSettings({ ...globalSettings, atmospheric_pressure: pa });
                      }}
                      className="form-input"
                      style={inputStyle}
                    />
                    <p style={hintStyle}>Reference atmospheric pressure used for open reservoirs and absolute calculations.</p>
                  </div>
                </div>

                {/* Numerical Solver Settings */}
                <div style={{ borderTop: `1px solid ${theme.slate100}`, paddingTop: '16px' }}>
                  <SolverSettingsGroup
                    values={drawingSolverOn ? drawingSolverValues : solverBelowDrawing.values}
                    onChange={(patch) => onUpdateGlobalSettings({ ...globalSettings, ...patch })}
                    toggle={{ checked: drawingSolverOn, onChange: toggleDrawingSolver, label: 'Use drawing solver settings (overrides project and global)' }}
                    inheritedFrom={solverBelowDrawing.source}
                    inForce={drawingSolverOn}
                  />
                </div>
              </div>
            )}

            {/* SUB-TAB 2: PROJECT SETTINGS */}
            {settingsSubTab === 'project' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {activeProject ? (
                  <>
                    {/* Active Project Card */}
                    <div style={{
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #D8E2E1',
                      borderRadius: '8px',
                      padding: '12px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <FolderIcon size={16} color="var(--color-brand-dark)" />
                          <span style={{ fontSize: 'var(--fs-base)', fontWeight: '700', color: 'var(--color-text-primary)' }}>
                            {activeProject.title}
                          </span>
                        </div>
                        {onOpenProjectsModal && (
                          <button
                            type="button"
                            onClick={() => onOpenProjectsModal(activeProject.id)}
                            className="btn-secondary"
                            style={{ fontSize: 'var(--fs-xs)', padding: '3px 8px', borderRadius: '4px', height: '24px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            title="Manage project members and sharing"
                          >
                            <GearIcon size={12} /> Team
                          </button>
                        )}
                      </div>
                      {activeProject.description && (
                        <p style={{ margin: 0, fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)' }}>
                          {activeProject.description}
                        </p>
                      )}
                    </div>

                    {/* Available pipe classes */}
                    <div style={{
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #D8E2E1',
                      borderRadius: '8px',
                      padding: '14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h4 style={{ margin: 0, color: 'var(--color-primary-text)', fontSize: 'var(--fs-xs)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Available Pipe Classes
                        </h4>
                        {isOwnerOfActiveProject && (
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                              type="button"
                              onClick={() => handleSetAllPipeClasses(true)}
                              disabled={savingPipeSpecs}
                              className="btn-secondary"
                              style={{ height: '20px', fontSize: 'var(--fs-xs)', padding: '0 6px', borderRadius: '4px', backgroundColor: '#F4F7F6', border: '1px solid #D8E2E1' }}
                            >
                              All
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSetAllPipeClasses(false)}
                              disabled={savingPipeSpecs}
                              className="btn-secondary"
                              style={{ height: '20px', fontSize: 'var(--fs-xs)', padding: '0 6px', borderRadius: '4px', backgroundColor: '#F4F7F6', border: '1px solid #D8E2E1' }}
                            >
                              None
                            </button>
                          </div>
                        )}
                      </div>

                      <p style={{ margin: 0, fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)' }}>
                        {!activeProject.allowed_pipe_classes
                          ? "All pipe classes are active for this project."
                          : `${activeProject.allowed_pipe_classes.length} of ${pipeClasses.length} pipe classes enabled.`}
                      </p>

                      {/* Pipe class search filter */}
                      <div>
                        <input
                          type="text"
                          value={pipeSpecSearch}
                          onChange={(e) => setPipeSpecSearch(e.target.value)}
                          placeholder="Filter pipe classes by code or name..."
                          className="form-input"
                          style={{ width: '100%', height: '28px', fontSize: 'var(--fs-xs)', padding: '0 8px' }}
                        />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto', paddingRight: '4px' }}>
                        {pipeClasses.length === 0 ? (
                          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', textAlign: 'center', padding: '12px' }}>
                            Loading pipe classes...
                          </div>
                        ) : (
                          pipeClasses
                            .filter(pc => {
                              if (!pipeSpecSearch.trim()) return true;
                              const q = pipeSpecSearch.toLowerCase();
                              return (
                                pc.code.toLowerCase().includes(q) ||
                                pc.name.toLowerCase().includes(q) ||
                                (pc.material_grade && pc.material_grade.toLowerCase().includes(q))
                              );
                            })
                            .map(pc => {
                              const isAllowed = !activeProject.allowed_pipe_classes || activeProject.allowed_pipe_classes.includes(pc.id) || activeProject.allowed_pipe_classes.includes(pc.code);
                              return (
                                <label
                                  key={pc.id}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '6px 8px',
                                    borderRadius: '6px',
                                    backgroundColor: isAllowed ? '#F4F7F6' : 'transparent',
                                    border: `1px solid ${isAllowed ? '#D8E2E1' : 'transparent'}`,
                                    fontSize: 'var(--fs-xs)',
                                    color: isAllowed ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                                    cursor: isOwnerOfActiveProject ? 'pointer' : 'default',
                                    opacity: isAllowed ? 1 : 0.6
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isAllowed}
                                    disabled={!isOwnerOfActiveProject || savingPipeSpecs}
                                    onChange={() => handleTogglePipeClass(pc.id)}
                                    style={{ cursor: isOwnerOfActiveProject ? 'pointer' : 'default' }}
                                  />
                                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontWeight: '600' }}>
                                      <span style={{ color: 'var(--color-primary-text)', marginRight: '4px' }}>[{pc.code}]</span>
                                      {pc.name}
                                    </span>
                                    <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)' }}>
                                      {pc.rating_class} • {pc.material_grade} • ε={pc.roughness_mm}mm
                                    </span>
                                  </div>
                                </label>
                              );
                            })
                        )}
                      </div>

                      {/* Allow Manual / Custom Dimensions Toggle */}
                      <div style={{
                        marginTop: '6px',
                        paddingTop: '10px',
                        borderTop: '1px solid #D8E2E1',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}>
                        <div>
                          <span style={{ fontSize: 'var(--fs-xs)', fontWeight: '600', color: 'var(--color-text-primary)', display: 'block' }}>
                            Custom Dimensions
                          </span>
                          <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)' }}>
                            Allow manual pipe diameters
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '4px', backgroundColor: '#F4F7F6', padding: '2px', borderRadius: '6px', border: '1px solid #D8E2E1' }}>
                          <button
                            type="button"
                            onClick={() => handleSetAllowCustomPipes(true)}
                            disabled={!isOwnerOfActiveProject || savingPipeSpecs}
                            style={{
                              padding: '2px 10px',
                              fontSize: 'var(--fs-xs)',
                              fontWeight: '700',
                              borderRadius: '4px',
                              border: 'none',
                              cursor: isOwnerOfActiveProject ? 'pointer' : 'default',
                              backgroundColor: activeProject.allow_custom_pipes !== false ? 'var(--color-brand-dark)' : 'transparent',
                              color: activeProject.allow_custom_pipes !== false ? '#ffffff' : 'var(--color-text-secondary)',
                              boxShadow: activeProject.allow_custom_pipes !== false ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSetAllowCustomPipes(false)}
                            disabled={!isOwnerOfActiveProject || savingPipeSpecs}
                            style={{
                              padding: '2px 10px',
                              fontSize: 'var(--fs-xs)',
                              fontWeight: '700',
                              borderRadius: '4px',
                              border: 'none',
                              cursor: isOwnerOfActiveProject ? 'pointer' : 'default',
                              backgroundColor: activeProject.allow_custom_pipes === false ? 'var(--color-brand-dark)' : 'transparent',
                              color: activeProject.allow_custom_pipes === false ? '#ffffff' : 'var(--color-text-secondary)',
                              boxShadow: activeProject.allow_custom_pipes === false ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            No
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Project solver settings (owner edits) */}
                    <div style={{ borderTop: `1px solid ${theme.slate100}`, paddingTop: '16px' }}>
                      <SolverSettingsGroup
                        values={projectSolverOn ? { ...solverBelowProject.values, ...projectSettings.solver } : solverBelowProject.values}
                        onChange={(patch) => saveProjectSettings({ use_project_solver: true, solver: { ...solverBelowProject.values, ...projectSettings?.solver, ...patch } })}
                        toggle={{
                          checked: projectSolverOn,
                          onChange: toggleProjectSolver,
                          label: 'Use project solver settings (overrides global)',
                          disabled: !isOwnerOfActiveProject,
                          disabledHint: 'Only project owners can change the project solver settings.',
                        }}
                        inheritedFrom={solverBelowProject.source}
                        overriddenBy={projectSolverOn && drawingSolverOn ? 'drawing' : null}
                        inForce={projectSolverOn && !drawingSolverOn}
                        readOnly={!isOwnerOfActiveProject}
                      />
                    </div>
                  </>
                ) : (
                  /* Standalone Mode Banner */
                  <div style={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #D8E2E1',
                    borderRadius: '8px',
                    padding: '20px 16px',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '12px'
                  }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '10px',
                      backgroundColor: '#F4F7F6',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <FolderIcon size={20} color="var(--color-brand-dark)" />
                    </div>
                    <div>
                      <h4 style={{ margin: '0 0 4px 0', fontSize: 'var(--fs-base)', fontWeight: '700', color: 'var(--color-text-primary)' }}>
                        Standalone Drawing
                      </h4>
                      <p style={{ margin: 0, fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', lineHeight: '1.4' }}>
                        This drawing is not part of a cloud project. All pipe classes and manual pipe dimensions are available.
                      </p>
                    </div>
                    {isAuthenticated && onSaveAsClick && (
                      <button
                        type="button"
                        onClick={onSaveAsClick}
                        className="btn-secondary"
                        style={{ height: '30px', padding: '0 14px', fontSize: 'var(--fs-xs)', fontWeight: '600', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      >
                        <FolderIcon size={14} /> Save into cloud project
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* SUB-TAB 3: GLOBAL SETTINGS */}
            {settingsSubTab === 'global' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Engineering Unit System */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <h4 style={{ fontSize: 'var(--fs-xs)', fontWeight: '700', textTransform: 'uppercase', color: theme.slate500, margin: 0, letterSpacing: '0.05em' }}>
                    Unit System
                  </h4>
                  
                  <div>
                    <label style={labelStyle}>Engineering units</label>
                    <div style={{ display: 'flex', gap: '6px', background: '#F4F7F6', padding: '4px', borderRadius: '8px', border: '1px solid #D8E2E1' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setUnitSystem('metric');
                        }}
                        style={{
                          flex: 1,
                          padding: '6px 8px',
                          fontSize: 'var(--fs-sm)',
                          fontWeight: '600',
                          borderRadius: '6px',
                          border: 'none',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          backgroundColor: unitSystem === 'metric' ? 'var(--color-brand-dark)' : 'transparent',
                          color: unitSystem === 'metric' ? '#ffffff' : 'var(--color-text-secondary)',
                          boxShadow: unitSystem === 'metric' ? '0 1px 3px rgba(57, 82, 83, 0.15)' : 'none'
                        }}
                      >
                        Metric (SI)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setUnitSystem('imperial');
                        }}
                        style={{
                          flex: 1,
                          padding: '6px 8px',
                          fontSize: 'var(--fs-sm)',
                          fontWeight: '600',
                          borderRadius: '6px',
                          border: 'none',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          backgroundColor: unitSystem === 'imperial' ? 'var(--color-brand-dark)' : 'transparent',
                          color: unitSystem === 'imperial' ? '#ffffff' : 'var(--color-text-secondary)',
                          boxShadow: unitSystem === 'imperial' ? '0 1px 3px rgba(57, 82, 83, 0.15)' : 'none'
                        }}
                      >
                        Imperial (US)
                      </button>
                    </div>
                    <p style={hintStyle}>
                      {unitSystem === 'metric' 
                        ? 'Displaying pressure in bar, flow in L/min, temp in °C, pipe in m/mm.'
                        : 'Displaying pressure in psi, flow in GPM, temp in °F, pipe in ft/in.'}
                    </p>
                  </div>
                </div>

                {/* Global solver settings: always active unless a project or drawing overrides them */}
                <div style={{ borderTop: `1px solid ${theme.slate100}`, paddingTop: '16px' }}>
                  <SolverSettingsGroup
                    values={userSettings.solver}
                    onChange={onUpdateUserSolver}
                    overriddenBy={null}
                    inForce={solverInForce.source === 'global'}
                  />
                  {solverInForce.source !== 'global' && (
                    <p style={{ ...hintStyle, marginTop: '8px' }}>
                      Not in force for the open drawing: the <strong>{solverInForce.source === 'drawing' ? 'Drawing' : 'Project'}</strong> settings take precedence.
                    </p>
                  )}
                </div>

                {/* System Specs & Version Info */}
                <div style={{
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #D8E2E1',
                  borderRadius: '8px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <h4 style={{ margin: 0, fontSize: 'var(--fs-xs)', fontWeight: '700', textTransform: 'uppercase', color: 'var(--color-text-secondary)', letterSpacing: '0.04em' }}>
                    System Specifications
                  </h4>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-sm)' }}>
                    <span style={{ color: 'var(--color-text-secondary)' }}>App Version:</span>
                    <span style={{ fontWeight: '700', color: 'var(--color-text-primary)' }}>v{APP_VERSION}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-sm)' }}>
                    <span style={{ color: 'var(--color-text-secondary)' }}>File Format:</span>
                    <span style={{ fontWeight: '700', color: 'var(--color-text-primary)' }}>v{FILE_FORMAT_VERSION}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-sm)' }}>
                    <span style={{ color: 'var(--color-text-secondary)' }}>Physics Engine:</span>
                    <span style={{ fontWeight: '700', color: 'var(--color-text-primary)' }}>Steady-State (Δt=0)</span>
                  </div>
                </div>
              </div>
            )}
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
              <div style={{ display: 'block', fontSize: 'var(--fs-xs)', fontWeight: '600', color: theme.brandDark }}>
                Active drawing
              </div>
              {activeDiagram ? (
                <>
                  <div style={{ fontSize: 'var(--fs-base)', fontWeight: '700', color: theme.slate800, wordBreak: 'break-all' }}>
                    <FileIcon size={14} color={theme.slate500} style={{ marginRight: '6px' }} />{activeDiagram.title}
                  </div>
                  <div style={{ fontSize: 'var(--fs-xs)', color: theme.slate500 }}>
                    {activeProject ? `Project: ${activeProject.title}` : 'Standalone drawing'}
                  </div>
                  <div style={{ fontSize: 'var(--fs-xs)', color: theme.slate500, marginTop: '2px' }}>
                    {saveStatus === 'saving_cloud' ? 'Saving changes...' :
                     saveStatus === 'error' ? 'Sync error' :
                     lastSavedTimestamp ? `Last saved: ${lastSavedTimestamp}` : 'Saved to cloud'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                    {isLockedByOther ? (
                      <span style={{ fontSize: 'var(--fs-xs)', padding: '2px 8px', borderRadius: '10px', backgroundColor: 'var(--color-warning-bg)', color: 'var(--color-warning-text)', border: '1px solid var(--color-warning-border)', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <LockIcon size={11} /> Locked by {lockInfo?.username}
                      </span>
                    ) : hasLock ? (
                      <span style={{ fontSize: 'var(--fs-xs)', padding: '2px 8px', borderRadius: '10px', backgroundColor: '#ECFDF5', color: '#047857', border: '1px solid #A7F3D0', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <DotIcon size={8} /> Checked out
                      </span>
                    ) : (
                      <span style={{ fontSize: 'var(--fs-xs)', padding: '2px 8px', borderRadius: '10px', backgroundColor: '#F4F7F6', color: '#587071', border: '1px solid #D8E2E1', fontWeight: '600' }}>
                        Available (read-only)
                      </span>
                    )}
                  </div>
                  <div style={{ marginTop: '6px' }}>
                    {isLockedByOther ? (
                      <p style={{ margin: 0, fontSize: 'var(--fs-xs)', color: 'var(--color-warning-text)' }}>Drawing is read-only while another user has it checked out.</p>
                    ) : hasLock ? (
                      <button onClick={onCheckin} className="btn-secondary" style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                        <UnlockIcon size={14} /> Release edit lock
                      </button>
                    ) : (
                      <button onClick={onCheckout} className="btn-secondary" style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                        <NoteEditIcon size={14} /> Check out to edit
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 'var(--fs-base)', fontWeight: '700', color: theme.slate800 }}>
                    <NoteEditIcon size={14} color={theme.slate500} style={{ marginRight: '6px' }} />Local draft
                  </div>
                  <div style={{ fontSize: 'var(--fs-xs)', color: theme.slate500 }}>
                    {isAuthenticated
                      ? 'Kept in this browser only. Use Save as to store it in the cloud.'
                      : 'Kept in this browser only. Sign in to save it to the cloud.'}
                  </div>
                </>
              )}
            </div>

            {/* Drawings Explorer */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flexGrow: 1, minHeight: '200px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 'var(--fs-xs)', fontWeight: '700', textTransform: 'uppercase', color: theme.slate500, letterSpacing: '0.04em' }}>Drawings</span>
                {isAuthenticated && onOpenProjectsModal && (
                  <button 
                    onClick={() => onOpenProjectsModal(null)} 
                    style={{ background: 'transparent', border: 'none', color: '#395253', fontSize: 'var(--fs-xs)', fontWeight: '600', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    <GearIcon size={12} /> Manage projects
                  </button>
                )}
              </div>
              
              {!isAuthenticated ? (
                <div style={{ padding: '16px', border: `1px dashed ${theme.slate200}`, borderRadius: '8px', textAlign: 'center', fontSize: 'var(--fs-sm)', color: theme.slate500, backgroundColor: theme.slate50 }}>
                  Sign in to browse your cloud projects and drawings.
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
                              <div style={{ padding: '4px 8px', fontSize: 'var(--fs-xs)', color: theme.slate500 }}>
                                No drawings
                              </div>
                            ) : (
                              diags.map(d => {
                                const isActive = activeDiagram?.id === d.id;
                                const isHighlighted = highlightedDiagramId === d.id;
                                return (
                                  <DiagramRow 
                                    key={d.id}
                                    diagram={d}
                                    isActive={isActive}
                                    isHighlighted={isHighlighted}
                                    onClick={() => setHighlightedDiagramId(d.id)}
                                    onOpen={() => handleLoadCloudDiagram(d.id, p)}
                                    onToggleLock={() => handleToggleLock(d)}
                                    onDelete={(e) => handleDeleteDiagram(e, d.id, d.title)}
                                    currentUser={currentUser}
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
                      <div style={{ fontSize: 'var(--fs-xs)', fontWeight: '700', textTransform: 'uppercase', color: theme.slate500, marginBottom: '2px', letterSpacing: '0.04em' }}>
                        Standalone drawings
                      </div>
                      {standaloneList.map(d => {
                        const isActive = activeDiagram?.id === d.id;
                        const isHighlighted = highlightedDiagramId === d.id;
                        return (
                          <DiagramRow 
                            key={d.id}
                            diagram={d}
                            isActive={isActive}
                            isHighlighted={isHighlighted}
                            onClick={() => setHighlightedDiagramId(d.id)}
                            onOpen={() => handleLoadCloudDiagram(d.id, null)}
                            onToggleLock={() => handleToggleLock(d)}
                            onDelete={(e) => handleDeleteDiagram(e, d.id, d.title)}
                            currentUser={currentUser}
                          />
                        );
                      })}
                    </div>
                  )}

                  {projectsList.length === 0 && standaloneList.length === 0 && !loadingFiles && (
                    <div style={{ padding: '12px', textAlign: 'center', fontSize: 'var(--fs-xs)', color: theme.slate500 }}>
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
                  <PlusIcon size={14} /> New
                </button>
                <button onClick={onSaveAsClick} className="btn-secondary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                  <SaveIcon size={14} /> Save as…
                </button>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={onImportClick} className="btn-secondary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                  <ImportIcon size={14} /> Import
                </button>
                <button onClick={onExportClick} className="btn-secondary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                  <ExportIcon size={14} /> Export
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
