import React, { useMemo, useState } from 'react';
import { mToMm, mmToM } from '../../utils/converters';
import { ASME_PIPE_STANDARDS, calculatePipeId, findClosestPipeMatch } from '../../utils/standards_library';
import { isCaseVariableProperty } from '../../constants/case_constants';
import { isPropertyOverridden, getEffectiveNodeData } from '../../utils/case_resolver';

function PropertyBadge({ propKey, nodeId, cases = [], activeCaseId = 'case_base', onResetOverride }) {
  const isCaseVar = isCaseVariableProperty(propKey);
  const activeCaseObj = cases.find(c => c.id === activeCaseId);
  const isBaseCase = !activeCaseObj || activeCaseObj.is_base;
  const isOverridden = !isBaseCase && isPropertyOverridden(nodeId, propKey, cases, activeCaseId);

  if (!isCaseVar) {
    return (
      <span style={{ fontSize: '9px', fontWeight: '600', color: '#64748b', background: '#f1f5f9', padding: '1px 5px', borderRadius: '4px', border: '1px solid #cbd5e1' }} title="Global hardware specification fixed across all operating cases">
        🌐 Global
      </span>
    );
  }

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
      <span style={{ fontSize: '9px', fontWeight: '700', color: isOverridden ? '#d97706' : '#FA8507', background: isOverridden ? '#fef3c7' : '#fff7ed', padding: '1px 5px', borderRadius: '4px', border: `1px solid ${isOverridden ? '#fde68a' : '#ffedd5'}` }} title="Case-specific operating variable">
        ⚡ Case Variable
      </span>
      {isOverridden && (
        <span style={{ fontSize: '9px', color: '#d97706', fontWeight: '700' }} title={`Overridden in current case`}>
          ● Overridden
        </span>
      )}
      {isOverridden && onResetOverride && (
        <button
          onClick={(e) => { e.preventDefault(); onResetOverride(nodeId, propKey); }}
          title="Reset to Base Case value"
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '10px', color: '#64748b', padding: 0 }}
        >
          ↺ Reset
        </button>
      )}
    </div>
  );
}

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

export default function PropertyEditor({
  node,
  edge,
  onUpdate,
  onUpdateEdge,
  onDelete,
  onDeleteEdge,
  heatmapActive = false,
  cases = [],
  activeCaseId = 'case_base',
  onResetCaseOverride,
  style = {}
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [localDrafts, setLocalDrafts] = useState({});

  const isNode = !!node;
  const item = isNode ? node : edge;
  const id = item?.id;
  const type = item?.type;
  const data = item?.data;

  const effectiveData = useMemo(() => {
    if (!isNode || !node) return data || {};
    return getEffectiveNodeData(node, cases, activeCaseId);
  }, [isNode, node, data, cases, activeCaseId]);

  if (!node && !edge) return null;

  const renderLabel = (labelStr, propKey) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
      <label style={{ fontSize: '11px', color: '#64748b' }}>{labelStr}</label>
      {propKey && (
        <PropertyBadge
          propKey={propKey}
          nodeId={id}
          cases={cases}
          activeCaseId={activeCaseId}
          onResetOverride={onResetCaseOverride}
        />
      )}
    </div>
  );


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

    // Critical validation
    if (isCritical) {
      if (field === 'opening') {
        if (isNaN(numericValue) || numericValue < 0 || numericValue > 100) {
          alert('Opening must be a number between 0 and 100.');
          setLocalDrafts({});
          return;
        }
      } else if (isNaN(numericValue) || numericValue <= 0) {
        alert(`${field} must be a positive number greater than zero.`);
        setLocalDrafts({});
        return;
      }
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
        position: 'absolute', top: heatmapActive ? '185px' : '16px', right: '16px', zIndex: 10,
        width: '280px', background: '#ffffff', padding: isCollapsed ? '12px 18px' : '20px',
        borderRadius: '12px', border: '1px solid #D8E2E1',
        boxShadow: '0 10px 25px -3px rgba(57, 82, 83, 0.15), 0 4px 6px -2px rgba(57, 82, 83, 0.05)',
        transition: 'top 0.25s cubic-bezier(0.4, 0, 0.2, 1), padding 0.2s ease, box-shadow 0.2s ease',
        ...style,
        maxHeight: isCollapsed ? 'auto' : (style.maxHeight || 'calc(100vh - 120px)'),
        overflowY: isCollapsed ? 'visible' : (style.overflowY || 'auto')
      }}
    >
      <div 
        onClick={() => setIsCollapsed(!isCollapsed)}
        style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: isCollapsed ? '0' : '14px',
          cursor: 'pointer',
          userSelect: 'none',
          borderBottom: isCollapsed ? 'none' : '1px solid #EBF0EF',
          paddingBottom: isCollapsed ? '0' : '10px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11px', color: '#587071', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
          <h3 style={{ margin: 0, fontSize: '13px', fontWeight: '700', color: '#395253', letterSpacing: '0.01em' }}>
            {isNode ? `Equipment: ${type.toUpperCase()}` : `Connection: ${data.type || 'PIPE'}`}
          </h3>
        </div>
        <button 
          onClick={(e) => { e.stopPropagation(); handleDelete(); }} 
          style={{ 
            background: 'rgba(239, 68, 68, 0.1)', 
            color: '#ef4444', 
            border: '1px solid rgba(239, 68, 68, 0.2)', 
            borderRadius: '6px', 
            padding: '4px 10px', 
            fontSize: '11px', 
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#ef4444'}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'; e.currentTarget.style.color = '#ef4444'; }}
        >
          Delete
        </button>
      </div>

      
      {!isCollapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {type !== 'text_bubble' && (
            <div key="label">
              <label style={{ fontSize: '11px', color: '#64748b' }}>Name Tag</label>
              <input 
                style={{ width: '100%', fontSize: '12px', padding: '4px' }} 
                value={localDrafts.label !== undefined ? localDrafts.label : (data.label || '')} 
                onChange={(e) => handleDraftChange('label', e.target.value)}
                onBlur={(e) => validateAndCommit('label', e.target.value)}
              />
            </div>
          )}

          {isNode && type !== 'text_bubble' && (
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
                {renderLabel('Pipe Length (m)', 'length')}
                <input 
                  type="number" 
                  style={{ width: '100%', fontSize: '12px' }} 
                  value={localDrafts.length !== undefined ? localDrafts.length : (data.length || 25.0)} 
                  onChange={(e) => handleDraftChange('length', e.target.value)}
                  onBlur={(e) => validateAndCommit('length', e.target.value, true)}
                />
              </div>
              <div>
                {renderLabel('Pipe Diameter', 'diameter')}
                <PipeSelector data={data} onChange={(field, val) => validateAndCommit(field, val, field === 'diameter')} />
              </div>
            </>
          )}

          {isNode && type === 'tank' && (
            <>
              <div>
                {renderLabel('Fluid Level (m)', 'level')}
                <input 
                  type="number" 
                  style={{ width: '100%', fontSize: '12px' }} 
                  value={localDrafts.level !== undefined ? localDrafts.level : (effectiveData.level || 0)} 
                  onChange={(e) => handleDraftChange('level', e.target.value)}
                  onBlur={(e) => validateAndCommit('level', e.target.value)}
                />
              </div>
              <div>
                {renderLabel('Elevation (m)', 'elevation')}
                <input 
                  type="number" 
                  style={{ width: '100%', fontSize: '12px' }} 
                  value={localDrafts.elevation !== undefined ? localDrafts.elevation : (effectiveData.elevation || 0)} 
                  onChange={(e) => handleDraftChange('elevation', e.target.value)}
                  onBlur={(e) => validateAndCommit('elevation', e.target.value)}
                />
              </div>
              <div>
                {renderLabel('Temp (°C)', 'temperature')}
                <input 
                  type="number" 
                  style={{ width: '100%', fontSize: '12px' }} 
                  step="0.1" 
                  value={localDrafts.temperature !== undefined ? localDrafts.temperature : (effectiveData.temperature - 273.15).toFixed(1)} 
                  onChange={(e) => handleDraftChange('temperature', e.target.value)}
                  onBlur={(e) => validateAndCommit('temperature', parseFloat(e.target.value) + 273.15)}
                />
              </div>
            </>
          )}

          {(type === 'centrifugal_pump' || type === 'pump') && (
            <>
              <div>
                {renderLabel('Operating Status', 'active')}
                <select 
                  style={{ width: '100%', fontSize: '12px', padding: '4px' }} 
                  value={effectiveData.active !== false ? "true" : "false"} 
                  onChange={(e) => {
                    const isActive = e.target.value === "true";
                    if (isNode) onUpdate(id, { active: isActive });
                  }}
                >
                  <option value="true">Active (On)</option>
                  <option value="false">Inactive (Off)</option>
                </select>
              </div>
              <div>
                {renderLabel('Rated Flow (L/min)', 'flow_rated_lmin')}
                <input 
                  type="number" 
                  style={{ width: '100%', fontSize: '12px' }} 
                  value={localDrafts.flow_rated_lmin !== undefined ? localDrafts.flow_rated_lmin : (effectiveData.flow_rated_lmin || 100)} 
                  onChange={(e) => handleDraftChange('flow_rated_lmin', e.target.value)}
                  onBlur={(e) => validateAndCommit('flow_rated_lmin', e.target.value, true)}
                />
              </div>
              <div>
                {renderLabel('Rated Pressure (bar)', 'pressure_rated_bar')}
                <input 
                  type="number" 
                  step="0.1"
                  style={{ width: '100%', fontSize: '12px' }} 
                  value={localDrafts.pressure_rated_bar !== undefined ? localDrafts.pressure_rated_bar : (effectiveData.pressure_rated_bar || 5.0)} 
                  onChange={(e) => handleDraftChange('pressure_rated_bar', e.target.value)}
                  onBlur={(e) => validateAndCommit('pressure_rated_bar', e.target.value, true)}
                />
              </div>
              <div>
                {renderLabel('Rise to Shut-off (%)', 'rise_to_shutoff_pct')}
                <input 
                  type="number" 
                  style={{ width: '100%', fontSize: '12px' }} 
                  value={localDrafts.rise_to_shutoff_pct !== undefined ? localDrafts.rise_to_shutoff_pct : (effectiveData.rise_to_shutoff_pct || 20.0)} 
                  onChange={(e) => handleDraftChange('rise_to_shutoff_pct', e.target.value)}
                  onBlur={(e) => validateAndCommit('rise_to_shutoff_pct', e.target.value)}
                />
              </div>
            </>
          )}

          {type === 'volumetric_pump' && (
            <>
              <div>
                {renderLabel('Operating Status', 'active')}
                <select 
                  style={{ width: '100%', fontSize: '12px', padding: '4px' }} 
                  value={effectiveData.active !== false ? "true" : "false"} 
                  onChange={(e) => {
                    const isActive = e.target.value === "true";
                    if (isNode) onUpdate(id, { active: isActive });
                  }}
                >
                  <option value="true">Active (On)</option>
                  <option value="false">Inactive (Off)</option>
                </select>
              </div>
              <div>
                {renderLabel('Rated Flow (L/min)', 'flow_rated')}
                <input 
                  type="number" 
                  style={{ width: '100%', fontSize: '12px' }} 
                  value={localDrafts.flow_rated !== undefined ? localDrafts.flow_rated : (effectiveData.flow_rated || 0)} 
                  onChange={(e) => handleDraftChange('flow_rated', e.target.value)}
                  onBlur={(e) => validateAndCommit('flow_rated', e.target.value, true)}
                />
              </div>
              <div>
                {renderLabel('Motor Power (kW)', 'motor_power')}
                <input 
                  type="number" 
                  style={{ width: '100%', fontSize: '12px' }} 
                  value={localDrafts.motor_power !== undefined ? localDrafts.motor_power : (effectiveData.motor_power || 0)} 
                  onChange={(e) => handleDraftChange('motor_power', e.target.value)}
                  onBlur={(e) => validateAndCommit('motor_power', e.target.value, true)}
                />
              </div>
              <div>
                {renderLabel('Efficiency (%)', 'efficiency')}
                <input 
                  type="number" 
                  style={{ width: '100%', fontSize: '12px' }} 
                  value={localDrafts.efficiency !== undefined ? localDrafts.efficiency : (effectiveData.efficiency || 0)} 
                  onChange={(e) => handleDraftChange('efficiency', e.target.value)}
                  onBlur={(e) => validateAndCommit('efficiency', e.target.value, true)}
                />
              </div>
            </>
          )}

          {isNode && (type === 'linear_regulator' || type === 'remote_control_valve') && (
            <>
              <div>
                {renderLabel('Max Cv', 'max_cv')}
                <input 
                  type="number" 
                  style={{ width: '100%', fontSize: '12px' }} 
                  value={localDrafts.max_cv !== undefined ? localDrafts.max_cv : (effectiveData.max_cv || 0)} 
                  onChange={(e) => handleDraftChange('max_cv', e.target.value)}
                  onBlur={(e) => validateAndCommit('max_cv', e.target.value, true)}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: '#64748b' }}>Regulation Mode</label>
                <select 
                  style={{ width: '100%', fontSize: '12px', padding: '4px' }} 
                  value={effectiveData.backpressure ? "true" : "false"} 
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
                {renderLabel('Set Point (bar)', 'set_pressure')}
                <input 
                  type="number" 
                  style={{ width: '100%', fontSize: '12px' }} 
                  step="0.1" 
                  value={localDrafts.set_pressure !== undefined ? localDrafts.set_pressure : (effectiveData.set_pressure / 100000).toFixed(1)} 
                  onChange={(e) => handleDraftChange('set_pressure', e.target.value)}
                  onBlur={(e) => validateAndCommit('set_pressure', parseFloat(e.target.value) * 100000)}
                />
              </div>
            </>
          )}

          {isNode && type === 'three_way_tcv' && (
            <>
              <div>
                {renderLabel('Max Cv', 'max_cv')}
                <input 
                  type="number" 
                  style={{ width: '100%', fontSize: '12px' }} 
                  value={localDrafts.max_cv !== undefined ? localDrafts.max_cv : (effectiveData.max_cv || 0)} 
                  onChange={(e) => handleDraftChange('max_cv', e.target.value)}
                  onBlur={(e) => validateAndCommit('max_cv', e.target.value, true)}
                />
              </div>
              <div>
                {renderLabel('Set Temperature (°C)', 'set_temperature_c')}
                <input 
                  type="number" 
                  style={{ width: '100%', fontSize: '12px' }} 
                  step="0.1" 
                  value={localDrafts.set_temperature_c !== undefined ? localDrafts.set_temperature_c : (effectiveData.set_temperature_c || 40.0)} 
                  onChange={(e) => handleDraftChange('set_temperature_c', e.target.value)}
                  onBlur={(e) => validateAndCommit('set_temperature_c', e.target.value)}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: '#64748b' }}>Hot Port Selection</label>
                <select 
                  style={{ width: '100%', fontSize: '12px', padding: '4px' }} 
                  value={effectiveData.hot_port_idx || 0} 
                  onChange={(e) => onUpdate(id, { hot_port_idx: parseInt(e.target.value) })}
                >
                  <option value="0">Inlet 1 (Left) is HOT</option>
                  <option value="1">Inlet 2 (Bottom) is HOT</option>
                </select>
              </div>
            </>
          )}

          {isNode && type === 'linear_control_valve' && (
            <>
              <div>
                {renderLabel('Max Cv', 'max_cv')}
                <input 
                  type="number" 
                  style={{ width: '100%', fontSize: '12px' }} 
                  value={localDrafts.max_cv !== undefined ? localDrafts.max_cv : (effectiveData.max_cv || 0)} 
                  onChange={(e) => handleDraftChange('max_cv', e.target.value)}
                  onBlur={(e) => validateAndCommit('max_cv', e.target.value, true)}
                />
              </div>
              <div>
                {renderLabel('Opening (%)', 'opening')}
                <input 
                  type="number" 
                  style={{ width: '100%', fontSize: '12px' }} 
                  min="0" max="100" step="0.1" 
                  value={localDrafts.opening !== undefined ? localDrafts.opening : (effectiveData.opening ?? 50.0)} 
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

          {isNode && (type === 'pressure_safety_valve' || type === 'psv') && (
            <>
              <div>
                {renderLabel('Cracking Set Pressure (bar)', 'set_pressure_bar')}
                <input 
                  type="number" step="0.1" min="0.01"
                  style={{ width: '100%', fontSize: '12px' }} 
                  value={localDrafts.set_pressure_bar !== undefined ? localDrafts.set_pressure_bar : (effectiveData.set_pressure_bar ?? 20.0)} 
                  onChange={(e) => handleDraftChange('set_pressure_bar', e.target.value)}
                  onBlur={(e) => validateAndCommit('set_pressure_bar', e.target.value, true)}
                />
              </div>
              <div>
                {renderLabel('Flow Coefficient (Cv)', 'cv')}
                <input 
                  type="number" step="0.1" min="0.001"
                  style={{ width: '100%', fontSize: '12px' }} 
                  value={localDrafts.cv !== undefined ? localDrafts.cv : (effectiveData.cv ?? 10.0)} 
                  onChange={(e) => handleDraftChange('cv', e.target.value)}
                  onBlur={(e) => validateAndCommit('cv', e.target.value, true)}
                />
              </div>
              <div>
                {renderLabel('Relief Action Mode', 'action_mode')}
                <select 
                  style={{ width: '100%', fontSize: '12px', padding: '4px' }} 
                  value={effectiveData.action_mode || 'pop_action'} 
                  onChange={(e) => onUpdate(id, { action_mode: e.target.value })}
                >
                  <option value="pop_action">Pop Action (Snap-Open)</option>
                  <option value="modulating">Modulating (Proportional)</option>
                </select>
              </div>
              {(effectiveData.action_mode === 'pop_action' || !effectiveData.action_mode) && (
                <div>
                  {renderLabel('Blowdown Reset (%)', 'blowdown_pct')}
                  <input 
                    type="number" step="0.5" min="0" max="50"
                    style={{ width: '100%', fontSize: '12px' }} 
                    value={localDrafts.blowdown_pct !== undefined ? localDrafts.blowdown_pct : (effectiveData.blowdown_pct ?? 7.0)} 
                    onChange={(e) => handleDraftChange('blowdown_pct', e.target.value)}
                    onBlur={(e) => validateAndCommit('blowdown_pct', e.target.value)}
                  />
                </div>
              )}
              <div>
                {renderLabel('Contingency Test Mode', 'forced_state')}
                <select 
                  style={{ width: '100%', fontSize: '12px', padding: '4px' }} 
                  value={effectiveData.forced_state || 'auto'} 
                  onChange={(e) => onUpdate(id, { forced_state: e.target.value })}
                >
                  <option value="auto">Auto (Normal Relief)</option>
                  <option value="forced_closed">🔒 Forced Closed</option>
                  <option value="forced_open">🔓 Forced Open</option>
                </select>
              </div>
            </>
          )}

          {isNode && type === 'rupture_disc' && (
            <>
              <div>
                {renderLabel('Burst Pressure (bar)', 'burst_pressure_bar')}
                <input 
                  type="number" step="0.1" min="0.01"
                  style={{ width: '100%', fontSize: '12px' }} 
                  value={localDrafts.burst_pressure_bar !== undefined ? localDrafts.burst_pressure_bar : (effectiveData.burst_pressure_bar ?? 25.0)} 
                  onChange={(e) => handleDraftChange('burst_pressure_bar', e.target.value)}
                  onBlur={(e) => validateAndCommit('burst_pressure_bar', e.target.value, true)}
                />
              </div>
              <div>
                {renderLabel('Bore Configuration', 'bore_type')}
                <select 
                  style={{ width: '100%', fontSize: '12px', padding: '4px' }} 
                  value={effectiveData.bore_type || 'full_bore'} 
                  onChange={(e) => onUpdate(id, { bore_type: e.target.value })}
                >
                  <option value="full_bore">Full Bore (Unrestricted)</option>
                  <option value="reduced_bore">Reduced Bore (Orifice Restricted)</option>
                </select>
              </div>
              {effectiveData.bore_type === 'reduced_bore' ? (
                <div>
                  {renderLabel('Orifice Restriction Diameter (mm)', 'orifice_diameter')}
                  <input 
                    type="number" 
                    style={{ width: '100%', fontSize: '12px' }} 
                    value={localDrafts.orifice_diameter !== undefined ? localDrafts.orifice_diameter : mToMm(effectiveData.orifice_diameter || 0.01)} 
                    onChange={(e) => handleDraftChange('orifice_diameter', e.target.value)}
                    onBlur={(e) => validateAndCommit('orifice_diameter', mmToM(parseFloat(e.target.value) || 0), true)}
                  />
                </div>
              ) : (
                <div>
                  {renderLabel('Flow Coefficient (Cv)', 'cv')}
                  <input 
                    type="number" step="0.1" min="0.001"
                    style={{ width: '100%', fontSize: '12px' }} 
                    value={localDrafts.cv !== undefined ? localDrafts.cv : (effectiveData.cv ?? 10.0)} 
                    onChange={(e) => handleDraftChange('cv', e.target.value)}
                    onBlur={(e) => validateAndCommit('cv', e.target.value, true)}
                  />
                </div>
              )}
              <div>
                {renderLabel('Contingency Test Mode', 'forced_state')}
                <select 
                  style={{ width: '100%', fontSize: '12px', padding: '4px' }} 
                  value={effectiveData.forced_state || 'auto'} 
                  onChange={(e) => onUpdate(id, { forced_state: e.target.value })}
                >
                  <option value="auto">Auto (Normal Relief)</option>
                  <option value="forced_closed">🔒 Forced Closed</option>
                  <option value="forced_open">🔓 Forced Open</option>
                </select>
              </div>
            </>
          )}

          {isNode && type === 'check_valve' && (
            <>
              <div>
                {renderLabel('Flow Coefficient (Cv)', 'cv')}
                <input 
                  type="number" 
                  style={{ width: '100%', fontSize: '12px' }} 
                  step="0.1"
                  value={localDrafts.cv !== undefined ? localDrafts.cv : (effectiveData.cv ?? 10.0)} 
                  onChange={(e) => handleDraftChange('cv', e.target.value)}
                  onBlur={(e) => validateAndCommit('cv', e.target.value, true)}
                />
              </div>
              <div>
                {renderLabel('Cracking Pressure (bar)', 'cracking_pressure_bar')}
                <input 
                  type="number" 
                  style={{ width: '100%', fontSize: '12px' }} 
                  step="0.01" min="0"
                  value={localDrafts.cracking_pressure_bar !== undefined ? localDrafts.cracking_pressure_bar : (effectiveData.cracking_pressure_bar ?? 0.05)} 
                  onChange={(e) => handleDraftChange('cracking_pressure_bar', e.target.value)}
                  onBlur={(e) => validateAndCommit('cracking_pressure_bar', e.target.value, true)}
                />
              </div>
            </>
          )}

          {isNode && type === 'check_valve_orifice' && (
            <>
              <div>
                {renderLabel('Flow Coefficient (Cv)', 'cv')}
                <input 
                  type="number" 
                  style={{ width: '100%', fontSize: '12px' }} 
                  step="0.1"
                  value={localDrafts.cv !== undefined ? localDrafts.cv : (effectiveData.cv ?? 10.0)} 
                  onChange={(e) => handleDraftChange('cv', e.target.value)}
                  onBlur={(e) => validateAndCommit('cv', e.target.value, true)}
                />
              </div>
              <div>
                {renderLabel('Cracking Pressure (bar)', 'cracking_pressure_bar')}
                <input 
                  type="number" 
                  style={{ width: '100%', fontSize: '12px' }} 
                  step="0.01" min="0"
                  value={localDrafts.cracking_pressure_bar !== undefined ? localDrafts.cracking_pressure_bar : (effectiveData.cracking_pressure_bar ?? 0.05)} 
                  onChange={(e) => handleDraftChange('cracking_pressure_bar', e.target.value)}
                  onBlur={(e) => validateAndCommit('cracking_pressure_bar', e.target.value, true)}
                />
              </div>
              <div>
                {renderLabel('Orifice Diameter (mm)', 'orifice_diameter')}
                <input 
                  type="number" 
                  style={{ width: '100%', fontSize: '12px' }} 
                  value={localDrafts.orifice_diameter !== undefined ? localDrafts.orifice_diameter : mToMm(effectiveData.orifice_diameter || 0.01)} 
                  onChange={(e) => handleDraftChange('orifice_diameter', e.target.value)}
                  onBlur={(e) => validateAndCommit('orifice_diameter', mmToM(parseFloat(e.target.value) || 0), true)}
                />
              </div>
            </>
          )}

          {isNode && type === 'heat_exchanger' && (
            <>
              <div>
                {renderLabel('Operating Status', 'active')}
                <select 
                  style={{ width: '100%', fontSize: '12px', padding: '4px' }} 
                  value={effectiveData.active !== false ? "true" : "false"} 
                  onChange={(e) => {
                    const isActive = e.target.value === "true";
                    if (isNode) onUpdate(id, { active: isActive });
                  }}
                >
                  <option value="true">Active (On)</option>
                  <option value="false">Inactive (Off)</option>
                </select>
              </div>
              <div>
                {renderLabel('Rated Cooling (kW)', 'rated_cooling_kw')}
                <input 
                  type="number" 
                  style={{ width: '100%', fontSize: '12px' }} 
                  value={localDrafts.rated_cooling_kw !== undefined ? localDrafts.rated_cooling_kw : (effectiveData.rated_cooling_kw || 300.0)} 
                  onChange={(e) => handleDraftChange('rated_cooling_kw', e.target.value)}
                  onBlur={(e) => validateAndCommit('rated_cooling_kw', e.target.value, true)}
                />
              </div>
              <div>
                {renderLabel('Rated Flow (L/min)', 'rated_flow_lmin')}
                <input 
                  type="number" 
                  style={{ width: '100%', fontSize: '12px' }} 
                  value={localDrafts.rated_flow_lmin !== undefined ? localDrafts.rated_flow_lmin : (effectiveData.rated_flow_lmin || 500.0)} 
                  onChange={(e) => handleDraftChange('rated_flow_lmin', e.target.value)}
                  onBlur={(e) => validateAndCommit('rated_flow_lmin', e.target.value, true)}
                />
              </div>
              <div>
                {renderLabel('Cooler Type', 'cooler_type')}
                <select 
                  style={{ width: '100%', fontSize: '12px', padding: '4px' }} 
                  value={effectiveData.cooler_type || "water_cooled"} 
                  onChange={(e) => {
                    const val = e.target.value;
                    if (isNode) onUpdate(id, { cooler_type: val });
                  }}
                >
                  <option value="water_cooled">Water Cooled</option>
                  <option value="air_cooled">Air Cooled</option>
                </select>
              </div>
              {(effectiveData.cooler_type || "water_cooled") === "water_cooled" && (
                <div>
                  {renderLabel('Cooling Medium Temp (°C)', 'medium_temp_c')}
                  <input 
                    type="number" 
                    style={{ width: '100%', fontSize: '12px' }} 
                    value={localDrafts.medium_temp_c !== undefined ? localDrafts.medium_temp_c : (effectiveData.medium_temp_c || 10.0)} 
                    onChange={(e) => handleDraftChange('medium_temp_c', e.target.value)}
                    onBlur={(e) => validateAndCommit('medium_temp_c', e.target.value)}
                  />
                </div>
              )}
              <div>
                {renderLabel('Rated Pressure Drop (bar)', 'rated_dp_bar')}
                <input 
                  type="number" step="0.01" 
                  style={{ width: '100%', fontSize: '12px' }} 
                  value={localDrafts.rated_dp_bar !== undefined ? localDrafts.rated_dp_bar : (effectiveData.rated_dp_bar || 0.5)} 
                  onChange={(e) => handleDraftChange('rated_dp_bar', e.target.value)}
                  onBlur={(e) => validateAndCommit('rated_dp_bar', e.target.value, true)}
                />
              </div>
            </>
          )}

          {isNode && type === 'filter' && (
            <>
              <div>
                {renderLabel('Clean ΔP (bar)', 'dp_clean')}
                <input 
                  type="number" step="0.01" 
                  style={{ width: '100%', fontSize: '12px' }} 
                  value={localDrafts.dp_clean !== undefined ? localDrafts.dp_clean : (effectiveData.dp_clean || 0.2)} 
                  onChange={(e) => handleDraftChange('dp_clean', e.target.value)}
                  onBlur={(e) => validateAndCommit('dp_clean', e.target.value, true)}
                />
              </div>
              <div>
                {renderLabel('Terminal ΔP (bar)', 'dp_terminal')}
                <input 
                  type="number" step="0.1" 
                  style={{ width: '100%', fontSize: '12px' }} 
                  value={localDrafts.dp_terminal !== undefined ? localDrafts.dp_terminal : (effectiveData.dp_terminal || 1.0)} 
                  onChange={(e) => handleDraftChange('dp_terminal', e.target.value)}
                  onBlur={(e) => validateAndCommit('dp_terminal', e.target.value, true)}
                />
              </div>
              <div>
                {renderLabel('Rated Flow (L/min)', 'flow_ref')}
                <input 
                  type="number" 
                  style={{ width: '100%', fontSize: '12px' }} 
                  value={localDrafts.flow_ref !== undefined ? localDrafts.flow_ref : (effectiveData.flow_ref || 100.0)} 
                  onChange={(e) => handleDraftChange('flow_ref', e.target.value)}
                  onBlur={(e) => validateAndCommit('flow_ref', e.target.value, true)}
                />
              </div>
              <div>
                {renderLabel('Clogging Level (%)', 'clogging')}
                <input 
                  type="number" 
                  style={{ width: '100%', fontSize: '12px' }} 
                  value={localDrafts.clogging !== undefined ? localDrafts.clogging : (effectiveData.clogging || 0.0)} 
                  onChange={(e) => handleDraftChange('clogging', e.target.value)}
                  onBlur={(e) => validateAndCommit('clogging', e.target.value)}
                />
              </div>
            </>
          )}

          {isNode && type === 'orifice' && (
            <>
              <div>
                {renderLabel('Orifice Restriction Diameter (mm)', 'orifice_diameter')}
                <input 
                  type="number" 
                  style={{ width: '100%', fontSize: '12px' }} 
                  value={localDrafts.orifice_diameter !== undefined ? localDrafts.orifice_diameter : mToMm(effectiveData.orifice_diameter || 0.07)} 
                  onChange={(e) => handleDraftChange('orifice_diameter', e.target.value)}
                  onBlur={(e) => validateAndCommit('orifice_diameter', mmToM(parseFloat(e.target.value) || 0), true)}
                />
              </div>
            </>
          )}

          {isNode && type === 'calibrated_restriction' && (
            <>
              <div>
                {renderLabel('Restriction Model', 'restriction_model')}
                <select 
                  style={{ width: '100%', fontSize: '12px', padding: '4px' }} 
                  value={effectiveData.restriction_model || 'orifice'} 
                  onChange={(e) => onUpdate(id, { restriction_model: e.target.value })}
                  title="Orifice (Turbulent with Re-dependent Cd), Laminar (dP proportional to viscosity & flow), or Quadratic (fixed K-factor)"
                >
                  <option value="orifice" title="Turbulent orifice flow. Calculates equivalent plate diameter.">Orifice Model (Re corrected)</option>
                  <option value="laminar" title="Capillary/bearing clearance flow. dP scales with viscosity and flow rate.">Laminar/Linear Model</option>
                  <option value="quadratic" title="Fixed K-factor flow resistance. dP scales with density and flow squared.">Simple Quadratic Model</option>
                </select>
                <div style={{ fontSize: '10px', color: '#587071', marginTop: '4px', background: '#f4f7f6', padding: '6px', borderRadius: '4px', border: '1px solid #d8e2e1' }}>
                  {effectiveData.restriction_model === 'laminar' && (
                    <span><strong>Laminar Model:</strong> dP = K_lam * mu * q. Best for narrow viscous clearances, fluid film journal bearings, capillary lines, and leakage channels.</span>
                  )}
                  {effectiveData.restriction_model === 'quadratic' && (
                    <span><strong>Quadratic Model:</strong> dP = K_quad * rho * q^2. Models turbulent drag without viscosity effects. Best for fixed piping fittings/losses.</span>
                  )}
                  {(effectiveData.restriction_model === 'orifice' || !effectiveData.restriction_model) && (
                    <span><strong>Orifice Model:</strong> Turbulent-dominated orifice flow. Baseline case solves for an equivalent diameter; Cd updates dynamically with Reynolds number. Best for restriction orifices.</span>
                  )}
                </div>
              </div>
              <div>
                {renderLabel('Calibration Fluid', 'fluid_type')}
                <select 
                  style={{ width: '100%', fontSize: '12px', padding: '4px' }} 
                  value={effectiveData.fluid_type || 'system'} 
                  onChange={(e) => onUpdate(id, { fluid_type: e.target.value })}
                  title="Fluid used to look up density & viscosity at baseline calibration temperature."
                >
                  <option value="system">System Fluid (Dynamic)</option>
                  <option value="water">Water</option>
                  <option value="iso_vg_46">ISO VG 46 (Lube Oil)</option>
                  <option value="iso_vg_32">ISO VG 32 (Lube Oil)</option>
                </select>
              </div>
              <div>
                {renderLabel('Baseline Flow (L/min)', 'flow_base_lmin')}
                <input 
                  type="number" 
                  step="0.1"
                  style={{ width: '100%', fontSize: '12px' }} 
                  value={localDrafts.flow_base_lmin !== undefined ? localDrafts.flow_base_lmin : (effectiveData.flow_base_lmin || 10.0)} 
                  onChange={(e) => handleDraftChange('flow_base_lmin', e.target.value)}
                  onBlur={(e) => validateAndCommit('flow_base_lmin', parseFloat(e.target.value) || 0.0, true)}
                />
              </div>
              <div>
                {renderLabel('Baseline Inlet Pressure (bar)', 'inlet_pressure_base_bar')}
                <input 
                  type="number" 
                  step="0.05"
                  style={{ width: '100%', fontSize: '12px' }} 
                  value={localDrafts.inlet_pressure_base_bar !== undefined ? localDrafts.inlet_pressure_base_bar : (effectiveData.inlet_pressure_base_bar || 3.5)} 
                  onChange={(e) => handleDraftChange('inlet_pressure_base_bar', e.target.value)}
                  onBlur={(e) => validateAndCommit('inlet_pressure_base_bar', parseFloat(e.target.value) || 0.0, true)}
                />
              </div>
              <div>
                {renderLabel('Baseline Outlet Pressure (bar)', 'outlet_pressure_base_bar')}
                <input 
                  type="number" 
                  step="0.05"
                  style={{ width: '100%', fontSize: '12px' }} 
                  value={localDrafts.outlet_pressure_base_bar !== undefined ? localDrafts.outlet_pressure_base_bar : (effectiveData.outlet_pressure_base_bar || 1.0)} 
                  onChange={(e) => handleDraftChange('outlet_pressure_base_bar', e.target.value)}
                  onBlur={(e) => validateAndCommit('outlet_pressure_base_bar', parseFloat(e.target.value) || 0.0, true)}
                />
              </div>
              <div>
                {renderLabel('Baseline Temp (°C)', 'temp_base_c')}
                <input 
                  type="number" 
                  step="0.5"
                  style={{ width: '100%', fontSize: '12px' }} 
                  value={localDrafts.temp_base_c !== undefined ? localDrafts.temp_base_c : (effectiveData.temp_base_c || 45.0)} 
                  onChange={(e) => handleDraftChange('temp_base_c', e.target.value)}
                  onBlur={(e) => validateAndCommit('temp_base_c', parseFloat(e.target.value) || 0.0, true)}
                />
              </div>
            </>
          )}

          {isNode && type === 'text_bubble' && (
            <>
              <div>
                <label style={{ fontSize: '11px', color: '#64748b' }}>Title</label>
                <input 
                  style={{ width: '100%', fontSize: '12px', padding: '4px' }} 
                  value={localDrafts.title !== undefined ? localDrafts.title : (data.title || 'NOTE')} 
                  onChange={(e) => handleDraftChange('title', e.target.value)}
                  onBlur={(e) => validateAndCommit('title', e.target.value)}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: '#64748b' }}>Note Content</label>
                <textarea 
                  rows={4}
                  style={{ width: '100%', fontSize: '12px', padding: '6px', fontFamily: 'inherit', resize: 'vertical' }} 
                  value={localDrafts.text !== undefined ? localDrafts.text : (data.text || '')} 
                  onChange={(e) => handleDraftChange('text', e.target.value)}
                  onBlur={(e) => validateAndCommit('text', e.target.value)}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: '#64748b' }}>Font Size</label>
                <select
                  style={{ width: '100%', fontSize: '12px', padding: '4px' }}
                  value={data.fontSize || 'md'}
                  onChange={(e) => onUpdate(id, { fontSize: e.target.value })}
                >
                  <option value="sm">Small (12px)</option>
                  <option value="md">Medium (14px)</option>
                  <option value="lg">Large (16px)</option>
                </select>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
