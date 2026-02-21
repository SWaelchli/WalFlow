import React from 'react';

export default function PropertyEditor({ node, onUpdate, onDelete }) {
  if (!node) return null;

  const { id, type, data } = node;

  const handleChange = (field, value) => {
    onUpdate(id, { [field]: parseFloat(value) || value });
  };

  const handleDelete = () => {
    if (window.confirm(`Are you sure you want to delete this ${type}?`)) {
      onDelete(id);
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
          Equipment Properties: {type.toUpperCase()}
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
        <div key="label">
          <label style={{ fontSize: '11px', color: '#64748b' }}>Name Tag</label>
          <input 
            style={{ width: '100%', fontSize: '12px', padding: '4px' }}
            value={data.label || ''} 
            onChange={(e) => handleChange('label', e.target.value)}
          />
        </div>

        {type === 'tank' && (
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

        {type === 'pump' && (
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

        {type === 'valve' && (
          <div>
            <label style={{ fontSize: '11px', color: '#64748b' }}>Max Cv (Flow Coeff)</label>
            <input 
              type="number" style={{ width: '100%', fontSize: '12px' }}
              value={data.max_cv} onChange={(e) => handleChange('max_cv', e.target.value)}
            />
          </div>
        )}

        {type === 'heat_exchanger' && (
          <div>
            <label style={{ fontSize: '11px', color: '#64748b' }}>Heat Duty (kW, negative for cooling)</label>
            <input 
              type="number" style={{ width: '100%', fontSize: '12px' }}
              value={data.heat_duty_kw} onChange={(e) => handleChange('heat_duty_kw', e.target.value)}
            />
          </div>
        )}

        {type === 'filter' && (
          <div>
            <label style={{ fontSize: '11px', color: '#64748b' }}>Resistance Factor</label>
            <input 
              type="number" style={{ width: '100%', fontSize: '12px' }}
              value={data.resistance} onChange={(e) => handleChange('resistance', e.target.value)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
