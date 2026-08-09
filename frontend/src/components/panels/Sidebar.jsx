import React, { useState, useMemo } from 'react';
import { EquipmentSymbol } from '../symbols/SymbolLibrary';
import { InfoIcon, CheckIcon, CrossIcon, FolderIcon, SearchIcon } from '../symbols/IconLibrary';


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
  if (method === 'hybr') return 'Powell HYBR';
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

export default function Sidebar({ onLoad, globalSettings, onUpdateGlobalSettings, templates, lastStats, batchStats, onSelectComponent }) {
  const [activeTab, setActiveTab] = useState('library');
  const [searchQuery, setSearchQuery] = useState('');

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
        {['library', 'settings', 'diagnostics'].map((tab) => (
          <button 
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1, padding: '8px', border: 'none', borderRadius: '7px',
              fontSize: '11px', fontWeight: '700', cursor: 'pointer',
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
                  <option value="hybr">HYBR (Powell Hybrid)</option>
                  <option value="lm">LM (Least-Squares)</option>
                </select>
                <p style={hintStyle}>Sparse Newton is fast and scalable; HYBR/LM are legacy dense solvers.</p>
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
      </div>
    </aside>
  );
}
