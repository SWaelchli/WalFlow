import React, { useState, useMemo } from 'react';
import { EquipmentSymbol } from '../symbols/SymbolLibrary';


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
      { type: 'remote_control_valve', label: 'Remote Valve', description: 'Pilot Signal Control' },
      { type: 'linear_regulator', label: 'Pressure Regulator', description: '' },
      { type: 'three_way_tcv', label: '3-Way Temp Valve', description: 'Thermal Mixing' },
      { type: 'orifice', label: 'Orifice', description: '' },
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
  primary: '#FA8507',
  primaryHover: '#E07600',
  brandDark: '#395253',
  brandDarker: '#253637',
  slate50: '#F4F7F6',
  slate100: '#EBF0EF',
  slate200: '#D8E2E1',
  slate500: '#587071',
  slate800: '#1C2B2C',
  white: '#ffffff',
  shadow: '0 4px 12px -2px rgba(57, 82, 83, 0.1)'
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

      {bottleneck && !success && (
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
        <StatCard label="Prop Steps" value={stats.property_iterations || 0} hint="Property Loops" />
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

  if (items.length === 0) return null;

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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '8px 4px 16px 4px' }}>
          {items.map((item) => (
            <div
              key={item.type}
              onDragStart={(event) => onDragStart(event, item.type)}
              draggable
              style={{
                padding: '12px 8px', background: theme.white, border: `1px solid ${theme.slate200}`,
                borderRadius: '8px', cursor: 'grab', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: '4px', transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                minHeight: '120px',
                textAlign: 'center'
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
                    style={{
                      padding: '8px 10px', background: 'transparent', border: 'none',
                      borderRadius: '6px', fontSize: '12px', textAlign: 'left', cursor: 'pointer',
                      color: theme.slate800, transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '6px'
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
                style={{
                  padding: '8px 10px', background: 'transparent', border: 'none',
                  borderRadius: '6px', fontSize: '12px', textAlign: 'left', cursor: 'pointer',
                  color: theme.slate800, transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '6px'
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

export default function Sidebar({ onLoad, globalSettings, onUpdateGlobalSettings, templates, lastStats }) {
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
  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.slate200}`, fontSize: '13px', background: theme.white, outline: 'none', transition: 'border-color 0.2s, box-shadow 0.2s' };
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
            {tab === 'diagnostics' ? '📊 Stats' : tab}
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
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: theme.slate500, fontSize: '14px' }}>🔍</span>
                <input 
                  type="text" 
                  placeholder="Search equipment..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
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
