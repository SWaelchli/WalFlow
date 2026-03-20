import React, { useMemo, useState } from 'react';
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
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (!node && !edge) return null;

  const isNode = !!node;
  const item = isNode ? node : edge;
  const { id, type, data } = item;

  // Track raw strings for all numeric inputs to allow empty state while typing
  const [localDrafts, setLocalDrafts] = useState({});

  const validateAndCommit = (field, rawValue, isCritical = false) => {
    let finalValue = rawValue;

    // Handle empty string
    if (finalValue === '') {
      if (isCritical) {
        alert(`${field} cannot be empty or zero. Reverting to previous value.`);
        // Reset local draft to original data
        setLocalDrafts({}); 
        return;
      }
      finalValue = "0";
    }

    const numericValue = parseFloat(finalValue);

    // Critical validation (e.g., diameter, Cv cannot be 0)
    if (isCritical && (isNaN(numericValue) || numericValue <= 0)) {
      alert(`${field} must be a positive number greater than zero.`);
      setLocalDrafts({});
      return;
    }

    const processedValue = isNaN(numericValue) ? finalValue : numericValue;

    if (isNode) {
      onUpdate(id, { [field]: processedValue });
    } else {
      onUpdateEdge(id, { [field]: processedValue });
    }
    
    // Clear local draft for this field once committed
    setLocalDrafts(prev => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const handleDraftChange = (field, val) => {
    setLocalDrafts(prev => ({ ...prev, [field]: val }));
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
        width: '240px', background: '#fff', padding: isCollapsed ? '10px 20px' : '20px',
        borderRadius: '8px', border: '1px solid #e2e8f0',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        transition: 'all 0.2s ease-in-out'
      }}
    >
      <div 
        onClick={() => setIsCollapsed(!isCollapsed)}
        style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: isCollapsed ? '0' : '10px',
          cursor: 'pointer',
          userSelect: 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
          <h3 style={{ margin: 0, fontSize: '14px', color: '#0f172a' }}>
            {isNode ? `Equipment: ${type.toUpperCase()}` : `Connection: ${data.type || 'PIPE'}`}
          </h3>
        </div>
        <button onClick={(e) => { e.stopPropagation(); handleDelete(); }} style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '10px', cursor: 'pointer' }}>Delete</button>
      </div>
      
      {!isCollapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div key="label">
            <label style={{ fontSize: '11px', color: '#64748b' }}>Name Tag</label>
            <input 
              style={{ width: '100%', fontSize: '12px', padding: '4px' }} 
              value={localDrafts.label !== undefined ? localDrafts.label : (data.label || '')} 
              onChange={(e) => handleDraftChange('label', e.target.value)}
              onBlur={(e) => validateAndCommit('label', e.target.value)}
            />
          </div>

          {isNode && (
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '8px' }}>
              <label style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold' }}>Sensing Nodes (Yellow Pin)</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
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
                <input 
                  type="number" 
                  style={{ width: '100%', fontSize: '12px' }} 
                  value={localDrafts.length !== undefined ? localDrafts.length : (data.length || 25.0)} 
                  onChange={(e) => handleDraftChange('length', e.target.value)}
                  onBlur={(e) => validateAndCommit('length', e.target.value, true)}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: '#64748b' }}>Pipe Diameter</label>
                <PipeSelector data={data} onChange={(field, val) => validateAndCommit(field, val, field === 'diameter')} />
              </div>
            </>
          )}

          {isNode && type === 'tank' && (
            <>
              <div>
                <label style={{ fontSize: '11px', color: '#64748b' }}>Fluid Level (m)</label>
                <input 
                  type="number" 
                  style={{ width: '100%', fontSize: '12px' }} 
                  value={localDrafts.level !== undefined ? localDrafts.level : (data.level || 0)} 
                  onChange={(e) => handleDraftChange('level', e.target.value)}
                  onBlur={(e) => validateAndCommit('level', e.target.value)}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: '#64748b' }}>Elevation (m)</label>
                <input 
                  type="number" 
                  style={{ width: '100%', fontSize: '12px' }} 
                  value={localDrafts.elevation !== undefined ? localDrafts.elevation : (data.elevation || 0)} 
                  onChange={(e) => handleDraftChange('elevation', e.target.value)}
                  onBlur={(e) => validateAndCommit('elevation', e.target.value)}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: '#64748b' }}>Temp (°C)</label>
                <input 
                  type="number" 
                  style={{ width: '100%', fontSize: '12px' }} 
                  step="0.1" 
                  value={localDrafts.temperature !== undefined ? localDrafts.temperature : (data.temperature - 273.15).toFixed(1)} 
                  onChange={(e) => handleDraftChange('temperature', e.target.value)}
                  onBlur={(e) => validateAndCommit('temperature', parseFloat(e.target.value) + 273.15)}
                />
              </div>
            </>
          )}

          {(type === 'centrifugal_pump' || type === 'pump') && (
            <>
              <div>
                <label style={{ fontSize: '11px', color: '#64748b' }}>Rated Flow (L/min)</label>
                <input 
                  type="number" 
                  style={{ width: '100%', fontSize: '12px' }} 
                  value={localDrafts.flow_rated_lmin !== undefined ? localDrafts.flow_rated_lmin : (data.flow_rated_lmin || 100)} 
                  onChange={(e) => handleDraftChange('flow_rated_lmin', e.target.value)}
                  onBlur={(e) => validateAndCommit('flow_rated_lmin', e.target.value, true)}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: '#64748b' }}>Rated Pressure (bar)</label>
                <input 
                  type="number" 
                  step="0.1"
                  style={{ width: '100%', fontSize: '12px' }} 
                  value={localDrafts.pressure_rated_bar !== undefined ? localDrafts.pressure_rated_bar : (data.pressure_rated_bar || 5.0)} 
                  onChange={(e) => handleDraftChange('pressure_rated_bar', e.target.value)}
                  onBlur={(e) => validateAndCommit('pressure_rated_bar', e.target.value, true)}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: '#64748b' }}>Rise to Shut-off (%)</label>
                <input 
                  type="number" 
                  style={{ width: '100%', fontSize: '12px' }} 
                  value={localDrafts.rise_to_shutoff_pct !== undefined ? localDrafts.rise_to_shutoff_pct : (data.rise_to_shutoff_pct || 20.0)} 
                  onChange={(e) => handleDraftChange('rise_to_shutoff_pct', e.target.value)}
                  onBlur={(e) => validateAndCommit('rise_to_shutoff_pct', e.target.value)}
                />
              </div>
            </>
          )}

          {type === 'volumetric_pump' && (
            <>
              <div>
                <label style={{ fontSize: '11px', color: '#64748b' }}>Rated Flow (L/min)</label>
                <input 
                  type="number" 
                  style={{ width: '100%', fontSize: '12px' }} 
                  value={localDrafts.flow_rated !== undefined ? localDrafts.flow_rated : (data.flow_rated || 0)} 
                  onChange={(e) => handleDraftChange('flow_rated', e.target.value)}
                  onBlur={(e) => validateAndCommit('flow_rated', e.target.value, true)}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: '#64748b' }}>Motor Power (kW)</label>
                <input 
                  type="number" 
                  style={{ width: '100%', fontSize: '12px' }} 
                  value={localDrafts.motor_power !== undefined ? localDrafts.motor_power : (data.motor_power || 0)} 
                  onChange={(e) => handleDraftChange('motor_power', e.target.value)}
                  onBlur={(e) => validateAndCommit('motor_power', e.target.value, true)}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: '#64748b' }}>Efficiency (%)</label>
                <input 
                  type="number" 
                  style={{ width: '100%', fontSize: '12px' }} 
                  value={localDrafts.efficiency !== undefined ? localDrafts.efficiency : (data.efficiency || 0)} 
                  onChange={(e) => handleDraftChange('efficiency', e.target.value)}
                  onBlur={(e) => validateAndCommit('efficiency', e.target.value, true)}
                />
              </div>
            </>
          )}

          {isNode && (type === 'linear_regulator' || type === 'remote_control_valve') && (
            <>
              <div>
                <label style={{ fontSize: '11px', color: '#64748b' }}>Max Cv</label>
                <input 
                  type="number" 
                  style={{ width: '100%', fontSize: '12px' }} 
                  value={localDrafts.max_cv !== undefined ? localDrafts.max_cv : (data.max_cv || 0)} 
                  onChange={(e) => handleDraftChange('max_cv', e.target.value)}
                  onBlur={(e) => validateAndCommit('max_cv', e.target.value, true)}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: '#64748b' }}>Regulation Mode</label>
                <select 
                  style={{ width: '100%', fontSize: '12px', padding: '4px' }} 
                  value={data.backpressure ? "true" : "false"} 
                  onChange={(e) => {
                    const isBack = e.target.value === "true";
                    if (isNode) onUpdate(id, { backpressure: isBack });
                  }}
                >
                  <option value="false">{type === 'linear_regulator' ? 'Pressure Reducing (Downstream)' : 'Pressure Reducing (Downstream Remote)'}</option>
                  <option value="true">{type === 'linear_regulator' ? 'Backpressure (Upstream)' : 'Backpressure (Upstream Remote)'}</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '11px', color: '#64748b' }}>Set Point (bar)</label>
                <input 
                  type="number" 
                  style={{ width: '100%', fontSize: '12px' }} 
                  step="0.1" 
                  value={localDrafts.set_pressure !== undefined ? localDrafts.set_pressure : (data.set_pressure / 100000).toFixed(1)} 
                  onChange={(e) => handleDraftChange('set_pressure', e.target.value)}
                  onBlur={(e) => validateAndCommit('set_pressure', parseFloat(e.target.value) * 100000)}
                />
              </div>
            </>
          )}

          {isNode && type === 'linear_control_valve' && (
            <>
              <div>
                <label style={{ fontSize: '11px', color: '#64748b' }}>Max Cv</label>
                <input 
                  type="number" 
                  style={{ width: '100%', fontSize: '12px' }} 
                  value={localDrafts.max_cv !== undefined ? localDrafts.max_cv : (data.max_cv || 0)} 
                  onChange={(e) => handleDraftChange('max_cv', e.target.value)}
                  onBlur={(e) => validateAndCommit('max_cv', e.target.value, true)}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: '#64748b' }}>Opening (%)</label>
                <input 
                  type="number" 
                  style={{ width: '100%', fontSize: '12px' }} 
                  min="0.1" max="100" step="0.1" 
                  value={localDrafts.opening !== undefined ? localDrafts.opening : (data.opening || 50.0)} 
                  onChange={(e) => {
                    handleDraftChange('opening', e.target.value);
                    const val = parseFloat(e.target.value);
                    if (data.onChange && !isNaN(val)) data.onChange(val, id);
                  }}
                  onBlur={(e) => validateAndCommit('opening', e.target.value, true)}
                />
              </div>
            </>
          )}

          {isNode && type === 'heat_exchanger' && (
            <div>
              <label style={{ fontSize: '11px', color: '#64748b' }}>Heat Duty (kW)</label>
              <input 
                type="number" 
                style={{ width: '100%', fontSize: '12px' }} 
                value={localDrafts.heat_duty_kw !== undefined ? localDrafts.heat_duty_kw : (data.heat_duty_kw || 0)} 
                onChange={(e) => handleDraftChange('heat_duty_kw', e.target.value)}
                onBlur={(e) => validateAndCommit('heat_duty_kw', e.target.value)}
              />
            </div>
          )}

          {isNode && type === 'filter' && (
            <>
              <div>
                <label style={{ fontSize: '11px', color: '#64748b' }}>Clean ΔP (bar)</label>
                <input 
                  type="number" step="0.01" 
                  style={{ width: '100%', fontSize: '12px' }} 
                  value={localDrafts.dp_clean !== undefined ? localDrafts.dp_clean : (data.dp_clean || 0.2)} 
                  onChange={(e) => handleDraftChange('dp_clean', e.target.value)}
                  onBlur={(e) => validateAndCommit('dp_clean', e.target.value, true)}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: '#64748b' }}>Terminal ΔP (bar)</label>
                <input 
                  type="number" step="0.1" 
                  style={{ width: '100%', fontSize: '12px' }} 
                  value={localDrafts.dp_terminal !== undefined ? localDrafts.dp_terminal : (data.dp_terminal || 1.0)} 
                  onChange={(e) => handleDraftChange('dp_terminal', e.target.value)}
                  onBlur={(e) => validateAndCommit('dp_terminal', e.target.value, true)}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: '#64748b' }}>Rated Flow (L/min)</label>
                <input 
                  type="number" 
                  style={{ width: '100%', fontSize: '12px' }} 
                  value={localDrafts.flow_ref !== undefined ? localDrafts.flow_ref : (data.flow_ref || 100.0)} 
                  onChange={(e) => handleDraftChange('flow_ref', e.target.value)}
                  onBlur={(e) => validateAndCommit('flow_ref', e.target.value, true)}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: '#64748b' }}>Clogging Level (%)</label>
                <input 
                  type="number" 
                  style={{ width: '100%', fontSize: '12px' }} 
                  value={localDrafts.clogging !== undefined ? localDrafts.clogging : (data.clogging || 0.0)} 
                  onChange={(e) => handleDraftChange('clogging', e.target.value)}
                  onBlur={(e) => validateAndCommit('clogging', e.target.value)}
                />
              </div>
            </>
          )}

          {isNode && type === 'orifice' && (
            <>
              <div>
                <label style={{ fontSize: '11px', color: '#64748b' }}>Reference Pipe Selection</label>
                <PipeSelector 
                  data={{ 
                    diameter: data.pipe_diameter, 
                    standardDn: data.standardDn, 
                    standardSch: data.standardSch 
                  }} 
                  onChange={(field, val) => {
                    if (field === 'diameter') validateAndCommit('pipe_diameter', val, true);
                    else if (isNode) onUpdate(id, { [field]: val });
                  }} 
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: '#64748b' }}>Orifice Diameter (mm)</label>
                <input 
                  type="number" 
                  style={{ width: '100%', fontSize: '12px' }} 
                  value={localDrafts.orifice_diameter !== undefined ? localDrafts.orifice_diameter : mToMm(data.orifice_diameter || 0.07)} 
                  onChange={(e) => handleDraftChange('orifice_diameter', e.target.value)}
                  onBlur={(e) => validateAndCommit('orifice_diameter', mmToM(parseFloat(e.target.value) || 0), true)}
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
