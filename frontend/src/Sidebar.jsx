import React from 'react';

const equipmentTypes = [
  { type: 'tank', label: 'Tank', description: 'Fluid Reservoir (Atm Pressure)' },
  { type: 'pump', label: 'Pump', description: 'Centrifugal Pump (A=80, C=-2000)' },
  { type: 'valve', label: 'Valve', description: 'Control Valve (Variable Cv)' },
  { type: 'orifice', label: 'Orifice', description: 'Fixed Resistance Orifice' },
  { type: 'filter', label: 'Filter', description: 'Lube Oil Filter (Duplex)' },
  { type: 'heat_exchanger', label: 'Cooler', description: 'Shell & Tube Heat Exchanger' },
  { type: 'splitter', label: 'Splitter', description: 'Supply Manifold / T-Piece' },
  { type: 'mixer', label: 'Mixer', description: 'Return Manifold / T-Piece' },
];

export default function Sidebar({ onSave, onLoad, onClear, onCalculate, isSimulating }) {
  const onDragStart = (event, nodeType) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <aside style={{
      width: '260px', background: '#fff', borderRight: '1px solid #e2e8f0',
      padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px',
      overflowY: 'auto', zIndex: 10, position: 'relative', boxShadow: '2px 0 5px rgba(0,0,0,0.05)'
    }}>
      <div style={{ marginBottom: '10px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 5px 0' }}>WalFlow Library</h2>
        <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>Drag and drop onto the canvas</p>
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

      {equipmentTypes.map((item) => (
        <div
          key={item.type}
          style={{
            padding: '12px', background: '#f8fafc', border: '1px solid #e2e8f0',
            borderRadius: '6px', cursor: 'grab', display: 'flex', flexDirection: 'column',
            gap: '4px', transition: 'all 0.2s'
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
          <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e293b' }}>{item.label}</div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>{item.description}</div>
        </div>
      ))}
    </aside>
  );
}
