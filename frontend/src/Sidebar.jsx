import React, { useState } from 'react';
import walflowLogo from './assets/Logo_WalFlow.svg';

const categorizedEquipment = [
  {
    name: 'Fluid Sources',
    items: [
      { type: 'tank', label: 'Tank', description: 'Fluid Reservoir (Atm Pressure)' },
    ]
  },
  {
    name: 'Power & Drive',
    items: [
      { type: 'centrifugal_pump', label: 'Centrifugal Pump', description: 'Quadratic Curve (A=80, C=-2000)' },
      { type: 'volumetric_pump', label: 'Volumetric Pump', description: 'PD Pump (Fixed Q, Power Limited)' },
    ]
  },
  {
    name: 'Pressure & Flow Control',
    items: [
      { type: 'linear_control_valve', label: 'Linear Control Valve', description: 'Control Valve (Linear Cv Trim)' },
      { type: 'remote_control_valve', label: 'Remote Control Valve', description: 'RCV (Senses via Yellow Handle)' },
      { type: 'linear_regulator', label: 'Pressure Regulator', description: 'Maintains set P (Up/Downstream)' },
      { type: 'orifice', label: 'Orifice', description: 'Fixed Resistance Orifice' },
    ]
  },
  {
    name: 'Distribution & Topology',
    items: [
      { type: 'splitter', label: 'Splitter', description: 'Supply Manifold / T-Piece' },
      { type: 'mixer', label: 'Mixer', description: 'Return Manifold / T-Piece' },
    ]
  },
  {
    name: 'Auxiliary & Thermal',
    items: [
      { type: 'filter', label: 'Filter', description: 'Lube Oil Filter (Duplex)' },
      { type: 'heat_exchanger', label: 'Cooler', description: 'Shell & Tube Heat Exchanger' },
    ]
  }
];

function CollapsibleCategory({ name, items, onDragStart }) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div style={{ marginBottom: '5px' }}>
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          padding: '8px 4px', 
          cursor: 'pointer',
          borderBottom: '1px solid #f1f5f9',
          userSelect: 'none'
        }}
      >
        <h3 style={{ fontSize: '11px', textTransform: 'uppercase', color: '#94a3b8', margin: 0 }}>{name}</h3>
        <span style={{ fontSize: '10px', color: '#94a3b8', transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s' }}>▼</span>
      </div>
      
      {isExpanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px', paddingBottom: '10px' }}>
          {items.map((item) => (
            <div
              key={item.type}
              style={{
                padding: '10px', background: '#f8fafc', border: '1px solid #e2e8f0',
                borderRadius: '6px', cursor: 'grab', display: 'flex', flexDirection: 'column',
                gap: '2px', transition: 'all 0.2s'
              }}
              onDragStart={(event) => onDragStart(event, item.type)}
              draggable
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#3b82f6';
                e.currentTarget.style.background = '#eff6ff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#e2e8f0';
                e.currentTarget.style.background = '#f8fafc';
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#1e293b' }}>{item.label}</div>
              <div style={{ fontSize: '10px', color: '#64748b', lineHeight: '1.2' }}>{item.description}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CollapsibleScenarios({ templates, onLoad }) {
  const [isExpanded, setIsExpanded] = useState(false); // Default collapsed for scenarios

  return (
    <div style={{ marginBottom: '15px', borderRadius: '6px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          padding: '10px 12px', 
          cursor: 'pointer',
          background: '#0f172a',
          color: '#fff',
          userSelect: 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '14px' }}>📂</span>
          <h3 style={{ fontSize: '11px', textTransform: 'uppercase', margin: 0, fontWeight: 'bold', letterSpacing: '0.5px' }}>Example Scenarios</h3>
        </div>
        <span style={{ fontSize: '10px', transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s' }}>▼</span>
      </div>
      
      {isExpanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '8px', background: '#f8fafc' }}>
          {Object.entries(templates || {}).map(([name, data]) => (
            <button 
              key={name}
              onClick={() => { if(window.confirm(`Load "${name}"? Current canvas will be replaced.`)) onLoad(data); }}
              style={{
                padding: '8px 10px', background: '#fff', border: '1px solid #e2e8f0',
                borderRadius: '4px', fontSize: '11px', textAlign: 'left', cursor: 'pointer',
                color: '#1e293b', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '6px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#0284c7';
                e.currentTarget.style.background = '#f0f9ff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#e2e8f0';
                e.currentTarget.style.background = '#fff';
              }}
            >
              <span style={{ color: '#0284c7' }}>•</span> {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Sidebar({ onSave, onLoad, onClear, onCalculate, isSimulating, globalSettings, onUpdateGlobalSettings, templates }) {
  const [activeTab, setActiveTab] = useState('library');

  const onDragStart = (event, nodeType) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <aside style={{
      width: '280px', background: '#fff', borderRight: '1px solid #e2e8f0',
      padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px',
      overflowY: 'auto', zIndex: 10, position: 'relative', boxShadow: '2px 0 5px rgba(0,0,0,0.05)'
    }}>
      <div style={{ marginBottom: '10px', textAlign: 'center' }}>
        <img src={walflowLogo} alt="WalFlow Logo" style={{ width: '100%', maxWidth: '200px', marginBottom: '5px' }} />
        <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>PFD Design & Simulation</p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
        <button 
          onClick={onCalculate}
          disabled={isSimulating}
          style={{
            flex: '1 1 100%', padding: '12px', background: isSimulating ? '#94a3b8' : '#0284c7', 
            color: '#fff', border: 'none', borderRadius: '4px', cursor: isSimulating ? 'not-allowed' : 'pointer', 
            fontSize: '14px', fontWeight: 'bold', marginBottom: '8px', transition: 'all 0.2s',
            boxShadow: '0 2px 4px rgba(2, 132, 199, 0.2)'
          }}
        >
          {isSimulating ? '⌛ Calculating...' : 'Calculate Network'}
        </button>
        <button 
          onClick={onSave}
          style={{
            flex: '1 1 100px', padding: '8px', background: '#0f172a', color: '#fff',
            border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px'
          }}
        >
          Save Plan
        </button>
        <button 
          onClick={() => document.getElementById('file-upload').click()}
          style={{
            flex: '1 1 100px', padding: '8px', background: '#e2e8f0', color: '#1e293b',
            border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px'
          }}
        >
          Load Plan
        </button>
        <button 
          onClick={onClear}
          style={{
            flex: '1 1 100px', padding: '8px', background: '#fee2e2', color: '#991b1b',
            border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px'
          }}
        >
          Clear Canvas
        </button>
        <input 
          id="file-upload" 
          type="file" 
          style={{ display: 'none' }} 
          accept=".json"
          onChange={(e) => {
            const file = e.target.files[0];
            if (file) {
              const reader = new FileReader();
              reader.onload = (event) => onLoad(JSON.parse(event.target.result));
              reader.readAsText(file);
            }
          }}
        />
      </div>

      {/* Tabs Navigation */}
      <div style={{ display: 'flex', borderBottom: '2px solid #e2e8f0', marginBottom: '10px' }}>
        <button 
          onClick={() => setActiveTab('library')}
          style={{
            flex: 1, padding: '10px', border: 'none', background: 'none',
            fontSize: '13px', fontWeight: 'bold', cursor: 'pointer',
            borderBottom: activeTab === 'library' ? '2px solid #0284c7' : 'none',
            color: activeTab === 'library' ? '#0284c7' : '#64748b'
          }}
        >
          Equipment
        </button>
        <button 
          onClick={() => setActiveTab('settings')}
          style={{
            flex: 1, padding: '10px', border: 'none', background: 'none',
            fontSize: '13px', fontWeight: 'bold', cursor: 'pointer',
            borderBottom: activeTab === 'settings' ? '2px solid #0284c7' : 'none',
            color: activeTab === 'settings' ? '#0284c7' : '#64748b'
          }}
        >
          Global Settings
        </button>
      </div>

      {/* Tab Content */}
      <div style={{ flexGrow: 1 }}>
        {activeTab === 'library' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            
            {/* Template Scenarios */}
            <CollapsibleScenarios templates={templates} onLoad={onLoad} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {categorizedEquipment.map((category) => (
                <CollapsibleCategory 
                  key={category.name} 
                  name={category.name} 
                  items={category.items} 
                  onDragStart={onDragStart} 
                />
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '5px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '8px' }}>
                System Fluid
              </label>
              <select 
                value={globalSettings.fluid_type}
                onChange={(e) => onUpdateGlobalSettings({ ...globalSettings, fluid_type: e.target.value })}
                style={{
                  width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #e2e8f0',
                  background: '#fff', fontSize: '13px', color: '#1e293b'
                }}
              >
                <option value="water">Water</option>
                <option value="iso_vg_32">ISO VG 32 (Lube Oil)</option>
                <option value="iso_vg_46">ISO VG 46 (Lube Oil)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '8px' }}>
                Ambient Temperature
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input 
                  type="number"
                  value={(globalSettings.ambient_temperature - 273.15).toFixed(1)}
                  onChange={(e) => onUpdateGlobalSettings({ ...globalSettings, ambient_temperature: parseFloat(e.target.value) + 273.15 })}
                  style={{
                    flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid #e2e8f0',
                    fontSize: '13px'
                  }}
                />
                <span style={{ fontSize: '12px', color: '#64748b' }}>°C</span>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '8px' }}>
                Atmospheric Pressure
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input 
                  type="number"
                  value={globalSettings.atmospheric_pressure}
                  onChange={(e) => onUpdateGlobalSettings({ ...globalSettings, atmospheric_pressure: parseFloat(e.target.value) })}
                  style={{
                    flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid #e2e8f0',
                    fontSize: '13px'
                  }}
                />
                <span style={{ fontSize: '12px', color: '#64748b' }}>Pa</span>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '8px' }}>
                Global Pipe Roughness (ε)
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input 
                  type="number"
                  step="0.000001"
                  value={globalSettings.global_roughness}
                  onChange={(e) => onUpdateGlobalSettings({ ...globalSettings, global_roughness: parseFloat(e.target.value) })}
                  style={{
                    flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid #e2e8f0',
                    fontSize: '13px'
                  }}
                />
                <span style={{ fontSize: '12px', color: '#64748b' }}>m</span>
              </div>
              <p style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px' }}>Steel ≈ 0.000045m</p>
            </div>

            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '15px' }}>
              <h4 style={{ fontSize: '11px', textTransform: 'uppercase', color: '#94a3b8', marginBottom: '10px' }}>Solver Controls</h4>
              
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>Solver Method</label>
                <select 
                  value={globalSettings.solver_method || 'hybr'}
                  onChange={(e) => onUpdateGlobalSettings({ ...globalSettings, solver_method: e.target.value })}
                  style={{
                    width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #e2e8f0',
                    background: '#fff', fontSize: '12px', color: '#1e293b'
                  }}
                >
                  <option value="hybr">HYBR (Fast, for Simple Nets)</option>
                  <option value="lm">LM (Robust, for Stiff Nets)</option>
                </select>
                <p style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>HYBR is Powell's hybrid; LM is Levenberg-Marquardt (better for extreme resistance).</p>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>Control Iterations</label>
                <input 
                  type="number"
                  value={globalSettings.control_iterations || 100}
                  onChange={(e) => onUpdateGlobalSettings({ ...globalSettings, control_iterations: parseInt(e.target.value) })}
                  style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                />
                <p style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>Outer loop for Regulators/RCVs to reach setpoint.</p>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>Property Iterations</label>
                <input 
                  type="number"
                  value={globalSettings.property_iterations}
                  onChange={(e) => onUpdateGlobalSettings({ ...globalSettings, property_iterations: parseInt(e.target.value) })}
                  style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                />
                <p style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>Thermal/Property propagation loops per hydraulic step.</p>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>Convergence Tolerance</label>
                <input 
                  type="number"
                  step="0.000001"
                  value={globalSettings.tolerance}
                  onChange={(e) => onUpdateGlobalSettings({ ...globalSettings, tolerance: parseFloat(e.target.value) })}
                  style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                />
                <p style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>Target precision for balancing flow and pressure.</p>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>Inner Solver Iterations</label>
                <input 
                  type="number"
                  value={globalSettings.inner_iterations || 1000}
                  onChange={(e) => onUpdateGlobalSettings({ ...globalSettings, inner_iterations: parseInt(e.target.value) })}
                  style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                />
                <p style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>Max steps the math solver takes to find a balance.</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
