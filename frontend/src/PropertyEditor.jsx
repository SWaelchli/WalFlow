import React from 'react';
import { mToMm, mmToM } from './utils/converters';

export default function PropertyEditor({ node, edge, onUpdate, onUpdateEdge, onDelete, onDeleteEdge }) {
  if (!node && !edge) return null;

  const isNode = !!node;
  const item = isNode ? node : edge;
  const { id, type, data } = item;

  const handleChange = (field, value) => {
    if (isNode) {
      onUpdate(id, { [field]: parseFloat(value) || value });
    } else {
      onUpdateEdge(id, { [field]: parseFloat(value) || value });
    }
  };

  const handleDelete = () => {
    const label = isNode ? `node ${type}` : 'connection';
    if (window.confirm(`Are you sure you want to delete this ${label}?`)) {
      if (isNode) {
        onDelete(id);
      } else {
        onDeleteEdge(id);
      }
    }
  };

  return (
    <div style={{
      position: 'absolute', top: 20, right: 20, zIndex: 10,
      width: '240px', background: '#fff', padding: '20px',
      borderRadius: '8px', border: '1px solid #e2e8f0',
      boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h3 style={{ margin: 0, fontSize: '14px', color: '#0f172a' }}>
          {isNode ? `Equipment: ${type.toUpperCase()}` : 'Connection: PIPE'}
        </h3>
        <button 
          onClick={handleDelete}
          style={{
            background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px',
            padding: '4px 8px', fontSize: '10px', cursor: 'pointer'
          }}
        >
          Delete
        </button>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {isNode && (
          <div key="label">
            <label style={{ fontSize: '11px', color: '#64748b' }}>Name Tag</label>
            <input 
              style={{ width: '100%', fontSize: '12px', padding: '4px' }}
              value={data.label || ''} 
              onChange={(e) => handleChange('label', e.target.value)}
            />
          </div>
        )}

        {!isNode && (
          <>
            <div>
              <label style={{ fontSize: '11px', color: '#64748b' }}>Pipe Length (m)</label>
              <input 
                type="number" style={{ width: '100%', fontSize: '12px' }}
                value={data.length || 25.0} onChange={(e) => handleChange('length', e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: '#64748b' }}>Pipe Diameter (m)</label>
              <input 
                type="number" style={{ width: '100%', fontSize: '12px' }}
                value={data.diameter || 0.1} onChange={(e) => handleChange('diameter', e.target.value)}
              />
            </div>
          </>
        )}

        {isNode && type === 'tank' && (
          <>
            <div>
              <label style={{ fontSize: '11px', color: '#64748b' }}>Fluid Level (m)</label>
              <input 
                type="number" style={{ width: '100%', fontSize: '12px' }}
                value={data.level} onChange={(e) => handleChange('level', e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: '#64748b' }}>Elevation (m)</label>
              <input 
                type="number" style={{ width: '100%', fontSize: '12px' }}
                value={data.elevation} onChange={(e) => handleChange('elevation', e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: '#64748b' }}>Temp (K)</label>
              <input 
                type="number" style={{ width: '100%', fontSize: '12px' }}
                value={data.temperature} onChange={(e) => handleChange('temperature', e.target.value)}
              />
            </div>
          </>
        )}

        {isNode && type === 'pump' && (
          <>
            <div>
              <label style={{ fontSize: '11px', color: '#64748b' }}>Curve A (Shutoff Head)</label>
              <input 
                type="number" style={{ width: '100%', fontSize: '12px' }}
                value={data.A} onChange={(e) => handleChange('A', e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: '#64748b' }}>Curve C (Slope)</label>
              <input 
                type="number" style={{ width: '100%', fontSize: '12px' }}
                value={data.C} onChange={(e) => handleChange('C', e.target.value)}
              />
            </div>
          </>
        )}

        {isNode && type === 'valve' && (
          <>
            <div>
              <label style={{ fontSize: '11px', color: '#64748b' }}>Max Cv (Flow Coeff)</label>
              <input 
                type="number" style={{ width: '100%', fontSize: '12px' }}
                value={data.max_cv} onChange={(e) => handleChange('max_cv', e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: '#64748b' }}>Opening (%)</label>
              <input 
                type="number" style={{ width: '100%', fontSize: '12px' }}
                min="0.1" max="100" step="0.1"
                value={data.opening || 50.0} 
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 0;
                  handleChange('opening', val);
                  if (data.onChange) data.onChange(val, id);
                }}
              />
            </div>
          </>
        )}

        {isNode && type === 'heat_exchanger' && (
          <div>
            <label style={{ fontSize: '11px', color: '#64748b' }}>Heat Duty (kW, negative for cooling)</label>
            <input 
              type="number" style={{ width: '100%', fontSize: '12px' }}
              value={data.heat_duty_kw} onChange={(e) => handleChange('heat_duty_kw', e.target.value)}
            />
          </div>
        )}

        {isNode && type === 'filter' && (
          <div>
            <label style={{ fontSize: '11px', color: '#64748b' }}>Resistance Factor</label>
            <input 
              type="number" style={{ width: '100%', fontSize: '12px' }}
              value={data.resistance} onChange={(e) => handleChange('resistance', e.target.value)}
            />
          </div>
        )}

        {isNode && type === 'orifice' && (
          <>
            <div>
              <label style={{ fontSize: '11px', color: '#64748b' }}>Pipe Diameter (mm)</label>
              <input 
                type="number" style={{ width: '100%', fontSize: '12px' }}
                value={mToMm(data.pipe_diameter || 0.1)} 
                onChange={(e) => handleChange('pipe_diameter', mmToM(parseFloat(e.target.value) || 0))}
              />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: '#64748b' }}>Orifice Diameter (mm)</label>
              <input 
                type="number" style={{ width: '100%', fontSize: '12px' }}
                value={mToMm(data.orifice_diameter || 0.07)} 
                onChange={(e) => handleChange('orifice_diameter', mmToM(parseFloat(e.target.value) || 0))}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
