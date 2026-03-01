import React, { useMemo } from 'react';
import { mToMm, mmToM } from './utils/converters';
import { ASME_PIPE_STANDARDS, calculatePipeId, findClosestPipeMatch } from './utils/standards_library';

/**
 * PipeSelector component moved outside to prevent unmounting during parent re-renders.
 */
const PipeSelector = ({ field, value, onChange }) => {
  const match = useMemo(() => findClosestPipeMatch(value), [value]);
  
  // If no match, we default to something sensible to avoid broken UI
  const currentDn = match ? match.dn : 50; 
  const currentSch = match ? match.sch : "40";

  const handleDnChange = (newDn) => {
    const pipe = ASME_PIPE_STANDARDS.find(p => p.dn === parseInt(newDn));
    if (pipe) {
      // Try to keep same schedule if possible, else use first available
      const sch = pipe.schedules[currentSch] ? currentSch : Object.keys(pipe.schedules)[0];
      const newId = calculatePipeId(pipe.od, pipe.schedules[sch]);
      onChange(field, newId);
    }
  };

  const handleSchChange = (newSch) => {
    const pipe = ASME_PIPE_STANDARDS.find(p => p.dn === currentDn);
    if (pipe && pipe.schedules[newSch]) {
      const newId = calculatePipeId(pipe.od, pipe.schedules[newSch]);
      onChange(field, newId);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div style={{ display: 'flex', gap: '4px' }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: '10px', color: '#64748b' }}>DN (mm)</label>
          <select 
            style={{ width: '100%', fontSize: '12px' }}
            value={currentDn}
            onChange={(e) => handleDnChange(e.target.value)}
          >
            {ASME_PIPE_STANDARDS.map(p => (
              <option key={p.dn} value={p.dn}>DN {p.dn} ({p.nps}")</option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: '10px', color: '#64748b' }}>Sch</label>
          <select 
            style={{ width: '100%', fontSize: '12px' }}
            value={currentSch}
            onChange={(e) => handleSchChange(e.target.value)}
          >
            {Object.keys(ASME_PIPE_STANDARDS.find(p => p.dn === currentDn).schedules).map(sch => (
              <option key={sch} value={sch}>{sch}</option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>
        ID: {(value * 1000).toFixed(2)} mm
      </div>
    </div>
  );
};

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
    <div 
      // Prevent clicks and interactions from bubbling up to the React Flow canvas
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute', top: 20, right: 20, zIndex: 10,
        width: '240px', background: '#fff', padding: '20px',
        borderRadius: '8px', border: '1px solid #e2e8f0',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
      }}
    >
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
              <label style={{ fontSize: '11px', color: '#64748b' }}>Pipe Diameter</label>
              <PipeSelector field="diameter" value={data.diameter || 0.1} onChange={handleChange} />
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
              <label style={{ fontSize: '11px', color: '#64748b' }}>Pipe Selection (Reference)</label>
              <PipeSelector field="pipe_diameter" value={data.pipe_diameter || 0.1} onChange={handleChange} />
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
