import React, { useMemo } from 'react';
import { mToMm, mmToM } from './utils/converters';
import { ASME_PIPE_STANDARDS, calculatePipeId, findClosestPipeMatch } from './utils/standards_library';

/**
 * PipeSelector component.
 */
const PipeSelector = ({ data, onChange }) => {
  const value = data.diameter || 0.1;
  
  const match = useMemo(() => findClosestPipeMatch(value), [value]);
  const currentDn = data.standardDn || (match ? match.dn : 50);
  const currentSch = data.standardSch || (match ? match.sch : "40");

  const handleDnChange = (newDn) => {
    const dnInt = parseInt(newDn, 10);
    const pipe = ASME_PIPE_STANDARDS.find(p => p.dn === dnInt);
    if (pipe) {
      const sch = pipe.schedules[currentSch] ? currentSch : Object.keys(pipe.schedules)[0];
      const newId = calculatePipeId(pipe.od, pipe.schedules[sch]);
      
      // Update all three related fields to ensure sync with DataList
      onChange('diameter', newId);
      onChange('standardDn', dnInt);
      onChange('standardSch', sch);
    }
  };

  const handleSchChange = (newSch) => {
    const pipe = ASME_PIPE_STANDARDS.find(p => p.dn === currentDn);
    if (pipe && pipe.schedules[newSch]) {
      const newId = calculatePipeId(pipe.od, pipe.schedules[newSch]);
      
      onChange('diameter', newId);
      onChange('standardSch', newSch);
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
    // Keep raw value, parse only where numerically required
    if (isNode) {
      onUpdate(id, { [field]: value });
    } else {
      onUpdateEdge(id, { [field]: value });
    }
  };

  const handleDelete = () => {
    const label = isNode ? `node ${type}` : 'connection';
    if (window.confirm(`Are you sure you want to delete this ${label}?`)) {
      if (isNode) onDelete(id);
      else onDeleteEdge(id);
    }
  };

  const handleSensingToggle = (portId) => {
    const sensing = data.sensing || {};
    onUpdate(id, { sensing: { ...sensing, [portId]: !sensing[portId] } });
  };

  return (
    <div 
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
          {isNode ? `Equipment: ${type.toUpperCase()}` : `Connection: ${data.type || 'PIPE'}`}
        </h3>
        <button onClick={handleDelete} style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '10px', cursor: 'pointer' }}>Delete</button>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div key="label">
          <label style={{ fontSize: '11px', color: '#64748b' }}>Name Tag</label>
          <input style={{ width: '100%', fontSize: '12px', padding: '4px' }} value={data.label || ''} onChange={(e) => handleChange('label', e.target.value)} />
        </div>

        {isNode && (
          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '8px' }}>
            <label style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold' }}>Sensing Nodes (Yellow Pin)</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
              {/* Default ports for most equipment */}
              {['inlet-0', 'outlet-0'].map(portId => (
                <button
                  key={portId}
                  onClick={() => handleSensingToggle(portId)}
                  style={{
                    fontSize: '10px', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer',
                    background: data.sensing?.[portId] ? '#eab308' : '#f1f5f9',
                    color: data.sensing?.[portId] ? '#fff' : '#475569',
                    border: '1px solid #e2e8f0'
                  }}
                >
                  {portId.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        )}

        {!isNode && data.type !== 'SIGNAL' && (
          <>
            <div>
              <label style={{ fontSize: '11px', color: '#64748b' }}>Pipe Length (m)</label>
              <input type="number" style={{ width: '100%', fontSize: '12px' }} value={data.length || 25.0} onChange={(e) => handleChange('length', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: '#64748b' }}>Pipe Diameter</label>
              <PipeSelector data={data} onChange={handleChange} />
            </div>
          </>
        )}

        {isNode && type === 'tank' && (
          <>
            <div>
              <label style={{ fontSize: '11px', color: '#64748b' }}>Fluid Level (m)</label>
              <input type="number" style={{ width: '100%', fontSize: '12px' }} value={data.level} onChange={(e) => handleChange('level', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: '#64748b' }}>Elevation (m)</label>
              <input type="number" style={{ width: '100%', fontSize: '12px' }} value={data.elevation} onChange={(e) => handleChange('elevation', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: '#64748b' }}>Temp (°C)</label>
              <input type="number" style={{ width: '100%', fontSize: '12px' }} step="0.1" value={(data.temperature - 273.15).toFixed(1)} onChange={(e) => handleChange('temperature', parseFloat(e.target.value) + 273.15)} />
            </div>
          </>
        )}

        {isNode && type === 'pump' && (
          <>
            <div>
              <label style={{ fontSize: '11px', color: '#64748b' }}>Curve A (Shutoff Head)</label>
              <input type="number" style={{ width: '100%', fontSize: '12px' }} value={data.A} onChange={(e) => handleChange('A', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: '#64748b' }}>Curve C (Slope)</label>
              <input type="number" style={{ width: '100%', fontSize: '12px' }} value={data.C} onChange={(e) => handleChange('C', e.target.value)} />
            </div>
          </>
        )}

        {isNode && (type === 'linear_regulator' || type === 'remote_control_valve') && (
          <>
            <div>
              <label style={{ fontSize: '11px', color: '#64748b' }}>Max Cv</label>
              <input type="number" style={{ width: '100%', fontSize: '12px' }} value={data.max_cv} onChange={(e) => handleChange('max_cv', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: '#64748b' }}>Regulation Mode</label>
              <select style={{ width: '100%', fontSize: '12px', padding: '4px' }} value={data.backpressure ? "true" : "false"} onChange={(e) => handleChange('backpressure', e.target.value === "true")}>
                <option value="false">{type === 'linear_regulator' ? 'Pressure Reducing (Downstream)' : 'Pressure Reducing (Downstream Remote)'}</option>
                <option value="true">{type === 'linear_regulator' ? 'Backpressure (Upstream)' : 'Backpressure (Upstream Remote)'}</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '11px', color: '#64748b' }}>Set Point (bar)</label>
              <input type="number" style={{ width: '100%', fontSize: '12px' }} step="0.1" value={(data.set_pressure / 100000).toFixed(1)} onChange={(e) => handleChange('set_pressure', parseFloat(e.target.value) * 100000)} />
            </div>
          </>
        )}

        {isNode && type === 'linear_control_valve' && (
          <>
            <div>
              <label style={{ fontSize: '11px', color: '#64748b' }}>Max Cv</label>
              <input type="number" style={{ width: '100%', fontSize: '12px' }} value={data.max_cv} onChange={(e) => handleChange('max_cv', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: '#64748b' }}>Opening (%)</label>
              <input type="number" style={{ width: '100%', fontSize: '12px' }} min="0.1" max="100" step="0.1" value={data.opening || 50.0} onChange={(e) => { const val = parseFloat(e.target.value) || 0; handleChange('opening', val); if (data.onChange) data.onChange(val, id); }} />
            </div>
          </>
        )}

        {isNode && type === 'heat_exchanger' && (
          <div>
            <label style={{ fontSize: '11px', color: '#64748b' }}>Heat Duty (kW)</label>
            <input type="number" style={{ width: '100%', fontSize: '12px' }} value={data.heat_duty_kw} onChange={(e) => handleChange('heat_duty_kw', e.target.value)} />
          </div>
        )}

        {isNode && type === 'filter' && (
          <>
            <div>
              <label style={{ fontSize: '11px', color: '#64748b' }}>Clean ΔP (bar)</label>
              <input type="number" step="0.01" style={{ width: '100%', fontSize: '12px' }} value={data.dp_clean || 0.2} onChange={(e) => handleChange('dp_clean', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: '#64748b' }}>Terminal ΔP (bar)</label>
              <input type="number" step="0.1" style={{ width: '100%', fontSize: '12px' }} value={data.dp_terminal || 1.0} onChange={(e) => handleChange('dp_terminal', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: '#64748b' }}>Rated Flow (L/min)</label>
              <input type="number" style={{ width: '100%', fontSize: '12px' }} value={data.flow_ref || 100.0} onChange={(e) => handleChange('flow_ref', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: '#64748b' }}>Clogging Level (%)</label>
              <input type="number" style={{ width: '100%', fontSize: '12px' }} value={data.clogging || 0.0} onChange={(e) => handleChange('clogging', e.target.value)} />
            </div>
          </>
        )}

        {isNode && type === 'orifice' && (
          <>
            <div>
              <label style={{ fontSize: '11px', color: '#64748b' }}>Reference Pipe Selection</label>
              {/* Special onChange for the Orifice's internal pipe reference */}
              <PipeSelector 
                data={{ 
                  diameter: data.pipe_diameter, 
                  standardDn: data.standardDn, 
                  standardSch: data.standardSch 
                }} 
                onChange={(field, val) => {
                  if (field === 'diameter') handleChange('pipe_diameter', val);
                  else handleChange(field, val);
                }} 
              />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: '#64748b' }}>Orifice Diameter (mm)</label>
              <input type="number" style={{ width: '100%', fontSize: '12px' }} value={mToMm(data.orifice_diameter || 0.07)} onChange={(e) => handleChange('orifice_diameter', mmToM(parseFloat(e.target.value) || 0))} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
