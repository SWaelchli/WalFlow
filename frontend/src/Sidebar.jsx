import React, { useState } from 'react';
import walflowLogo from './assets/Logo_WalFlow.svg';

const categorizedEquipment = [
  {
    name: 'Fluid Sources',
    items: [
      { type: 'tank', label: 'Tank', description: 'Atmospheric Reservoir' },
    ]
  },
  {
    name: 'Power & Drive',
    items: [
      { type: 'centrifugal_pump', label: 'Centrifugal Pump', description: 'Quadratic Performance Curve' },
      { type: 'volumetric_pump', label: 'Volumetric Pump', description: 'Positive Displacement' },
    ]
  },
  {
    name: 'Pressure & Flow Control',
    items: [
      { type: 'linear_control_valve', label: 'Control Valve', description: 'Linear Cv Trim' },
      { type: 'remote_control_valve', label: 'Remote Valve', description: 'Remote Signal Control' },
      { type: 'linear_regulator', label: 'Pressure Regulator', description: 'Auto PRV / BPR' },
      { type: 'orifice', label: 'Orifice', description: 'Fixed Restriction' },
    ]
  },
  {
    name: 'Distribution',
    items: [
      { type: 'splitter', label: 'Splitter', description: 'Supply Manifold' },
      { type: 'mixer', label: 'Mixer', description: 'Return Manifold' },
    ]
  },
  {
    name: 'Auxiliary',
    items: [
      { type: 'filter', label: 'Filter', description: 'Duplex Lube Filter' },
      { type: 'heat_exchanger', label: 'Cooler', description: 'Heat Exchanger' },
    ]
  }
];

const theme = {
  primary: '#2563eb',
  primaryHover: '#1d4ed8',
  slate50: '#f8fafc',
  slate100: '#f1f5f9',
  slate200: '#e2e8f0',
  slate500: '#64748b',
  slate800: '#1e293b',
  white: '#ffffff',
  shadow: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)'
};

function DiagnosticsContent({ stats }) {
  if (!stats) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px', color: theme.slate500 }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>📊</div>
        <p style={{ fontSize: '13px', margin: 0 }}>No simulation data yet.</p>
        <p style={{ fontSize: '11px', marginTop: '4px' }}>Run a simulation to see engine performance.</p>
      </div>
    );
  }

  const { success, time_ms, outer_iterations, total_inner_iterations, fallback_used, system_size, bottleneck, error } = stats;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ 
        padding: '16px', 
        borderRadius: '8px', 
        background: success ? '#f0fdf4' : '#fef2f2',
        border: `1px solid ${success ? '#bbf7d0' : '#fecaca'}`,
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
        <div style={{ fontSize: '20px' }}>{success ? '✅' : '❌'}</div>
        <div>
          <div style={{ fontSize: '14px', fontWeight: '700', color: success ? '#166534' : '#991b1b' }}>
            {success ? 'SOLVER CONVERGED' : 'SOLVER FAILED'}
          </div>
          <div style={{ fontSize: '11px', color: success ? '#15803d' : '#b91c1c' }}>
            {success ? 'System is balanced.' : error || 'Non-physical results found.'}
          </div>
        </div>
      </div>

      {bottleneck && (
        <div style={{ 
          padding: '16px', 
          borderRadius: '8px', 
          background: theme.slate800,
          color: theme.white,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <div style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', color: '#94a3b8' }}>Critical Bottleneck</div>
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
        <StatCard label="System Size" value={`${system_size} Eq.`} />
        <StatCard label="Control Steps" value={outer_iterations} hint="Outer Loop" />
        <StatCard label="Math Steps" value={total_inner_iterations} hint="Total Inner" />
      </div>

      {fallback_used && (
        <div style={{ fontSize: '11px', color: '#854d0e', background: '#fefce8', padding: '10px', borderRadius: '6px', border: '1px solid #fef08a' }}>
          <strong>Note:</strong> Robust fallback (LM) was used to ensure convergence.
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

  return (
    <div style={{ marginBottom: '4px' }}>
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          padding: '10px 8px', 
          cursor: 'pointer',
          userSelect: 'none',
          borderRadius: '6px',
          backgroundColor: isExpanded ? theme.slate50 : 'transparent',
          transition: 'background-color 0.2s'
        }}
      >
        <h3 style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: theme.slate500, margin: 0, letterSpacing: '0.05em' }}>{name}</h3>
        <span style={{ fontSize: '10px', color: theme.slate500, transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s' }}>▼</span>
      </div>
      
      {isExpanded && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px', padding: '8px 4px 16px 4px' }}>
          {items.map((item) => (
            <div
              key={item.type}
              onDragStart={(event) => onDragStart(event, item.type)}
              draggable
              style={{
                padding: '12px', background: theme.white, border: `1px solid ${theme.slate200}`,
                borderRadius: '8px', cursor: 'grab', display: 'flex', flexDirection: 'column',
                gap: '2px', transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = theme.primary;
                e.currentTarget.style.boxShadow = '0 4px 6px -1px rgb(0 0 0 / 0.1)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = theme.slate200;
                e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: '600', color: theme.slate800 }}>{item.label}</div>
              <div style={{ fontSize: '11px', color: theme.slate500, lineHeight: '1.4' }}>{item.description}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CollapsibleScenarios({ templates, onLoad }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div style={{ marginBottom: '16px', borderRadius: '8px', overflow: 'hidden', border: `1px solid ${theme.slate200}` }}>
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          padding: '12px 16px', 
          cursor: 'pointer',
          background: theme.slate100,
          userSelect: 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '16px' }}>📁</span>
          <h3 style={{ fontSize: '12px', fontWeight: '600', color: theme.slate800, margin: 0 }}>Library & Examples</h3>
        </div>
        <span style={{ fontSize: '10px', color: theme.slate500, transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s' }}>▼</span>
      </div>
      
      {isExpanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '12px', background: theme.white }}>
          {Object.entries(templates || {}).map(([name, data]) => (
            <button 
              key={name}
              onClick={() => { if(window.confirm(`Load "${name}"?`)) onLoad(data); }}
              style={{
                padding: '10px 12px', background: 'transparent', border: 'none',
                borderRadius: '6px', fontSize: '12px', textAlign: 'left', cursor: 'pointer',
                color: theme.slate800, transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = theme.slate50;
                e.currentTarget.style.color = theme.primary;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = theme.slate800;
              }}
            >
              • {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Sidebar({ onSave, onLoad, onClear, onCalculate, isSimulating, globalSettings, onUpdateGlobalSettings, templates, lastStats }) {
  const [activeTab, setActiveTab] = useState('library');

  const onDragStart = (event, nodeType) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const btnStyle = {
    padding: '10px 16px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px'
  };

  const labelStyle = { display: 'block', fontSize: '12px', fontWeight: '600', color: theme.slate800, marginBottom: '6px' };
  const inputStyle = { width: '100%', padding: '10px', borderRadius: '6px', border: `1px solid ${theme.slate200}`, fontSize: '13px', background: theme.white };
  const hintStyle = { fontSize: '10px', color: theme.slate500, marginTop: '4px' };

  return (
    <aside style={{
      width: '300px', background: theme.white, borderRight: `1px solid ${theme.slate200}`,
      padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px',
      overflowY: 'auto', zIndex: 10, position: 'relative'
    }}>
      <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <img src={walflowLogo} alt="Logo" style={{ height: '32px' }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <button 
          onClick={onCalculate}
          disabled={isSimulating}
          style={{
            ...btnStyle,
            padding: '14px',
            background: isSimulating ? theme.slate200 : theme.primary,
            color: theme.white,
            fontSize: '14px',
            boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.2)'
          }}
          onMouseEnter={(e) => !isSimulating && (e.currentTarget.style.background = theme.primaryHover)}
          onMouseLeave={(e) => !isSimulating && (e.currentTarget.style.background = theme.primary)}
        >
          {isSimulating ? '⌛ Simulating...' : '▶ Run Simulation'}
        </button>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <button onClick={onSave} style={{ ...btnStyle, background: theme.slate800, color: theme.white }}>💾 Save</button>
          <button onClick={() => document.getElementById('file-upload').click()} style={{ ...btnStyle, background: theme.slate100, color: theme.slate800, border: `1px solid ${theme.slate200}` }}>📂 Load</button>
        </div>
        
        <button onClick={onClear} style={{ ...btnStyle, background: 'transparent', color: '#ef4444', border: '1px solid #fee2e2' }} onMouseEnter={(e) => e.currentTarget.style.background = '#fef2f2'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>🗑 Clear Workspace</button>
        
        <input id="file-upload" type="file" style={{ display: 'none' }} accept=".json" onChange={(e) => {
          const file = e.target.files[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = (event) => onLoad(JSON.parse(event.target.result));
            reader.readAsText(file);
          }
        }} />
      </div>

      <div style={{ display: 'flex', background: theme.slate100, padding: '4px', borderRadius: '8px' }}>
        {['library', 'settings', 'diagnostics'].map((tab) => (
          <button 
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1, padding: '8px', border: 'none', borderRadius: '6px',
              fontSize: '11px', fontWeight: '600', cursor: 'pointer',
              textTransform: 'capitalize',
              background: activeTab === tab ? theme.white : 'transparent',
              color: activeTab === tab ? theme.primary : theme.slate500,
              boxShadow: activeTab === tab ? theme.shadow : 'none',
              transition: 'all 0.2s'
            }}
          >
            {tab === 'diagnostics' ? '📈 Stats' : tab}
          </button>
        ))}
      </div>

      <div style={{ flexGrow: 1 }}>
        {activeTab === 'library' && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <CollapsibleScenarios templates={templates} onLoad={onLoad} />
            {categorizedEquipment.map((category) => (
              <CollapsibleCategory key={category.name} name={category.name} items={category.items} onDragStart={onDragStart} />
            ))}
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
                  style={inputStyle}
                >
                  <option value="water">Water (Standard)</option>
                  <option value="iso_vg_32">ISO VG 32 Oil</option>
                  <option value="iso_vg_46">ISO VG 46 Oil</option>
                </select>
              </div>

              <div>
                <label style={labelStyle}>Ambient Temp (°C)</label>
                <input 
                  type="number"
                  value={(globalSettings.ambient_temperature - 273.15).toFixed(1)}
                  onChange={(e) => onUpdateGlobalSettings({ ...globalSettings, ambient_temperature: parseFloat(e.target.value) + 273.15 })}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Atmospheric Pressure (Pa)</label>
                <input 
                  type="number"
                  value={globalSettings.atmospheric_pressure}
                  onChange={(e) => onUpdateGlobalSettings({ ...globalSettings, atmospheric_pressure: parseFloat(e.target.value) })}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Global Pipe Roughness (m)</label>
                <input 
                  type="number"
                  step="0.000001"
                  value={globalSettings.global_roughness}
                  onChange={(e) => onUpdateGlobalSettings({ ...globalSettings, global_roughness: parseFloat(e.target.value) })}
                  style={inputStyle}
                />
                <p style={hintStyle}>Steel ≈ 0.000045m</p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderTop: `1px solid ${theme.slate100}`, paddingTop: '20px' }}>
              <h4 style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: theme.slate500, margin: 0, letterSpacing: '0.05em' }}>Numerical Solver</h4>
              
              <div>
                <label style={labelStyle}>Solver Method</label>
                <select 
                  value={globalSettings.solver_method || 'hybr'}
                  onChange={(e) => onUpdateGlobalSettings({ ...globalSettings, solver_method: e.target.value })}
                  style={inputStyle}
                >
                  <option value="hybr">HYBR (Powell Hybrid)</option>
                  <option value="lm">LM (Least-Squares)</option>
                </select>
                <p style={hintStyle}>HYBR is faster; LM is more robust.</p>
              </div>

              <div>
                <label style={labelStyle}>Control Iterations</label>
                <input 
                  type="number"
                  value={globalSettings.control_iterations || 100}
                  onChange={(e) => onUpdateGlobalSettings({ ...globalSettings, control_iterations: parseInt(e.target.value) })}
                  style={inputStyle}
                />
                <p style={hintStyle}>Outer loop for Regulator setpoints.</p>
              </div>

              <div>
                <label style={labelStyle}>Property Iterations</label>
                <input 
                  type="number"
                  value={globalSettings.property_iterations}
                  onChange={(e) => onUpdateGlobalSettings({ ...globalSettings, property_iterations: parseInt(e.target.value) })}
                  style={inputStyle}
                />
                <p style={hintStyle}>Thermal propagation loops.</p>
              </div>

              <div>
                <label style={labelStyle}>Convergence Tolerance</label>
                <input 
                  type="number"
                  step="0.000001"
                  value={globalSettings.tolerance}
                  onChange={(e) => onUpdateGlobalSettings({ ...globalSettings, tolerance: parseFloat(e.target.value) })}
                  style={inputStyle}
                />
                <p style={hintStyle}>Target precision for balance.</p>
              </div>

              <div>
                <label style={labelStyle}>Inner Solver Iterations</label>
                <input 
                  type="number"
                  value={globalSettings.inner_iterations || 1000}
                  onChange={(e) => onUpdateGlobalSettings({ ...globalSettings, inner_iterations: parseInt(e.target.value) })}
                  style={inputStyle}
                />
                <p style={hintStyle}>Max steps for the math engine.</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'diagnostics' && (
          <DiagnosticsContent stats={lastStats} />
        )}
      </div>
    </aside>
  );
}
