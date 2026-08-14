import React, { useMemo, useState } from 'react';
import { mToMm, mmToM } from '../../utils/converters';
import { ASME_PIPE_STANDARDS, calculatePipeId, findClosestPipeMatch } from '../../utils/standards_library';
import { isCaseVariableProperty } from '../../constants/case_constants';
import { isPropertyOverridden, getEffectiveNodeData } from '../../utils/case_resolver';
import { GlobeIcon, BoltIcon } from '../symbols/IconLibrary';
import { useUnits } from '../../context/UnitContext';

function PropertyBadge({ propKey, nodeId, cases = [], activeCaseId = 'case_base', onResetOverride }) {
  const isCaseVar = isCaseVariableProperty(propKey);
  const activeCaseObj = cases.find(c => c.id === activeCaseId);
  const isBaseCase = !activeCaseObj || activeCaseObj.is_base;
  const isOverridden = !isBaseCase && isPropertyOverridden(nodeId, propKey, cases, activeCaseId);

  if (!isCaseVar) {
    return (
      <span className="badge-global" title="Global hardware specification fixed across all operating cases">
        <GlobeIcon size={10} color="var(--color-text-secondary)" /> Global
      </span>
    );
  }

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
      <span 
        className={`badge-case ${isOverridden ? '' : 'not-overridden'}`} 
        title="Case-specific operating variable"
      >
        <BoltIcon size={10} color={isOverridden ? '#d97706' : 'var(--color-primary)'} /> Case Variable
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
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '10px', color: 'var(--color-text-secondary)', padding: 0 }}
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
  const { isImperial } = useUnits();
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
          <label style={{ fontSize: '10px', color: '#64748b' }}>DN ({isImperial ? 'in' : 'mm'})</label>
          <select 
            className="form-select" style={{ width: '100%' }}
            value={currentDn}
            onChange={(e) => handleDnChange(e.target.value)}
          >
            {ASME_PIPE_STANDARDS.map(p => (
              <option key={p.dn} value={p.dn}>
                {isImperial ? `${p.nps}" (DN ${p.dn})` : `DN ${p.dn} (${p.nps}")`}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: '10px', color: '#64748b' }}>Sch</label>
          <select 
            className="form-select" style={{ width: '100%' }}
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
        ID: {isImperial ? `${(value * 39.37007874).toFixed(3)} in` : `${(value * 1000).toFixed(2)} mm`}
      </div>
    </div>
  );
};

export default function SetupPanel({
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
  style = {},
  inline = false
}) {
  const { isImperial, fromInputValue } = useUnits();
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
    if (finalValue === '' || finalValue === undefined || finalValue === null) {
      if (isCritical) {
        alert(`${field} cannot be empty or zero. Reverting to previous value.`);
        setLocalDrafts({}); 
        return;
      }
      finalValue = 0;
    }

    const convertedVal = fromInputValue(field, finalValue);
    const numericValue = typeof convertedVal === 'number' ? convertedVal : parseFloat(convertedVal);

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

    const processedValue = isNaN(numericValue) ? convertedVal : numericValue;

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
      style={inline ? {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        ...style
      } : {
        position: 'absolute', top: heatmapActive ? '185px' : '16px', right: '16px', zIndex: 10,
        width: '280px', background: '#ffffff', padding: isCollapsed ? '12px 18px' : '20px',
        borderRadius: '12px', border: '1px solid #D8E2E1',
        boxShadow: '0 10px 25px -3px rgba(57, 82, 83, 0.15), 0 4px 6px -2px rgba(57, 82, 83, 0.05)',
        boxSizing: 'border-box',
        transition: 'padding 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        ...style
      }}
    >
      {!inline && (
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: isCollapsed ? '0px' : '16px',
          borderBottom: isCollapsed ? 'none' : '1px solid #EBF0EF',
          paddingBottom: isCollapsed ? '0px' : '12px'
        }}>
          <div 
            style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
            onClick={() => setIsCollapsed(!isCollapsed)}
          >
            <span style={{ fontSize: '10px', color: '#94a3b8', transform: isCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
            <span style={{ 
              fontWeight: '700', 
              fontSize: '13px', 
              color: '#1C2B2C', 
              letterSpacing: '-0.01em',
              textTransform: 'capitalize'
            }}>
              {type?.replace(/_/g, ' ') || 'Connection'}
            </span>
          </div>

          <button 
            onClick={handleDelete}
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
      )}

      {(!isCollapsed || inline) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {type !== 'text_bubble' && (
            <div key="label">
              <label style={{ fontSize: '11px', color: '#64748b' }}>Name Tag</label>
              <input 
                className="form-input" style={{ width: '100%' }} 
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
                      background: data.sensing?.[portId] ? 'var(--color-warning)' : 'var(--color-bg-canvas)',
                      color: data.sensing?.[portId] ? 'var(--color-text-inverse)' : 'var(--color-text-secondary)',
                      border: '1px solid var(--color-border)'
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
                {renderLabel(`Pipe Length (${isImperial ? 'ft' : 'm'})`, 'length')}
                <input 
                  type="number" 
                  className="form-input" style={{ width: '100%' }} 
                  value={localDrafts.length !== undefined ? localDrafts.length : (isImperial ? (Number(data.length || 25.0) * 3.280839895).toFixed(2) : (data.length || 25.0))} 
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
                {renderLabel(`Fluid Level (${isImperial ? 'ft' : 'm'})`, 'level')}
                <input 
                  type="number" 
                  className="form-input" style={{ width: '100%' }} 
                  value={localDrafts.level !== undefined ? localDrafts.level : (isImperial ? (Number(effectiveData.level || 0) * 3.280839895).toFixed(2) : (effectiveData.level || 0))} 
                  onChange={(e) => handleDraftChange('level', e.target.value)}
                  onBlur={(e) => validateAndCommit('level', e.target.value)}
                />
              </div>
              <div>
                {renderLabel(`Elevation (${isImperial ? 'ft' : 'm'})`, 'elevation')}
                <input 
                  type="number" 
                  className="form-input" style={{ width: '100%' }} 
                  value={localDrafts.elevation !== undefined ? localDrafts.elevation : (isImperial ? (Number(effectiveData.elevation || 0) * 3.280839895).toFixed(2) : (effectiveData.elevation || 0))} 
                  onChange={(e) => handleDraftChange('elevation', e.target.value)}
                  onBlur={(e) => validateAndCommit('elevation', e.target.value)}
                />
              </div>
              <div>
                {renderLabel(`Temp (${isImperial ? '°F' : '°C'})`, 'temperature')}
                <input 
                  type="number" 
                  className="form-input" style={{ width: '100%' }} 
                  step="0.1" 
                  value={localDrafts.temperature !== undefined ? localDrafts.temperature : (isImperial ? (((Number(effectiveData.temperature ?? 293.15)) - 273.15) * 1.8 + 32).toFixed(1) : ((Number(effectiveData.temperature ?? 293.15)) - 273.15).toFixed(1))} 
                  onChange={(e) => handleDraftChange('temperature', e.target.value)}
                  onBlur={(e) => validateAndCommit('temperature', e.target.value)}
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
                {renderLabel(`Rated Flow (${isImperial ? 'GPM' : 'L/min'})`, 'flow_rated_lmin')}
                <input 
                  type="number" 
                  className="form-input" style={{ width: '100%' }} 
                  value={localDrafts.flow_rated_lmin !== undefined ? localDrafts.flow_rated_lmin : (isImperial ? (Number(effectiveData.flow_rated_lmin || 100) * 0.264172052).toFixed(1) : (effectiveData.flow_rated_lmin || 100))} 
                  onChange={(e) => handleDraftChange('flow_rated_lmin', e.target.value)}
                  onBlur={(e) => validateAndCommit('flow_rated_lmin', e.target.value, true)}
                />
              </div>
              <div>
                {renderLabel(`Rated Pressure (${isImperial ? 'psi(d)' : 'bar(d)'})`, 'pressure_rated_bar')}
                <input 
                  type="number" 
                  step="0.1"
                  className="form-input" style={{ width: '100%' }} 
                  value={localDrafts.pressure_rated_bar !== undefined ? localDrafts.pressure_rated_bar : (isImperial ? (Number(effectiveData.pressure_rated_bar || 5.0) * 14.5037738).toFixed(1) : (effectiveData.pressure_rated_bar || 5.0))} 
                  onChange={(e) => handleDraftChange('pressure_rated_bar', e.target.value)}
                  onBlur={(e) => validateAndCommit('pressure_rated_bar', e.target.value, true)}
                />
              </div>
              <div>
                {renderLabel('Rise to Shut-off (%)', 'rise_to_shutoff_pct')}
                <input 
                  type="number" 
                  className="form-input" style={{ width: '100%' }} 
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
                {renderLabel(`Rated Flow (${isImperial ? 'GPM' : 'L/min'})`, 'flow_rated')}
                <input 
                  type="number" 
                  className="form-input" style={{ width: '100%' }} 
                  value={localDrafts.flow_rated !== undefined ? localDrafts.flow_rated : (isImperial ? (Number(effectiveData.flow_rated || 0) * 0.264172052).toFixed(1) : (effectiveData.flow_rated || 0))} 
                  onChange={(e) => handleDraftChange('flow_rated', e.target.value)}
                  onBlur={(e) => validateAndCommit('flow_rated', e.target.value, true)}
                />
              </div>
              <div>
                {renderLabel(`Motor Power (${isImperial ? 'HP' : 'kW'})`, 'motor_power')}
                <input 
                  type="number" 
                  step="0.1"
                  className="form-input" style={{ width: '100%' }} 
                  value={localDrafts.motor_power !== undefined ? localDrafts.motor_power : (isImperial ? (Number(effectiveData.motor_power || 0) * 1.34102209).toFixed(2) : (effectiveData.motor_power || 0))} 
                  onChange={(e) => handleDraftChange('motor_power', e.target.value)}
                  onBlur={(e) => validateAndCommit('motor_power', e.target.value, true)}
                />
              </div>
              <div>
                {renderLabel('Efficiency (%)', 'efficiency')}
                <input 
                  type="number" 
                  className="form-input" style={{ width: '100%' }} 
                  value={localDrafts.efficiency !== undefined ? localDrafts.efficiency : (effectiveData.efficiency || 0)} 
                  onChange={(e) => handleDraftChange('efficiency', e.target.value)}
                  onBlur={(e) => validateAndCommit('efficiency', e.target.value)}
                />
              </div>
            </>
          )}

          {isNode && type === 'pressure_source' && (
            <>
              <div>
                {renderLabel(`Set Pressure (${isImperial ? 'psi(a)' : 'bar(a)'})`, 'source_pressure_bara')}
                <input
                  type="number"
                  className="form-input" style={{ width: '100%' }}
                  step="0.1"
                  value={localDrafts.source_pressure_bara !== undefined
                    ? localDrafts.source_pressure_bara
                    : (isImperial ? (Number(effectiveData.source_pressure_bara ?? 6.0) * 14.5037738).toFixed(1) : (effectiveData.source_pressure_bara ?? 6.0))}
                  onChange={(e) => handleDraftChange('source_pressure_bara', e.target.value)}
                  onBlur={(e) => validateAndCommit('source_pressure_bara', e.target.value, true)}
                />
              </div>

              <div>
                {renderLabel(`Injected Temp (${isImperial ? '°F' : '°C'})`, 'temperature')}
                <input
                  type="number"
                  className="form-input" style={{ width: '100%' }}
                  step="0.1"
                  value={localDrafts.temperature !== undefined
                    ? localDrafts.temperature
                    : (isImperial ? (((Number(effectiveData.temperature ?? 293.15)) - 273.15) * 1.8 + 32).toFixed(1) : ((Number(effectiveData.temperature ?? 293.15)) - 273.15).toFixed(1))}
                  onChange={(e) => handleDraftChange('temperature', e.target.value)}
                  onBlur={(e) => validateAndCommit('temperature', e.target.value)}
                />
              </div>
            </>
          )}

          {isNode && type === 'flow_source' && (
            <>
              <div>
                {renderLabel(`Set Flow (${isImperial ? 'GPM' : 'L/min'})`, 'source_flow_lmin')}
                <input
                  type="number"
                  className="form-input" style={{ width: '100%' }}
                  step={isImperial ? "0.1" : "1"}
                  value={localDrafts.source_flow_lmin !== undefined
                    ? localDrafts.source_flow_lmin
                    : (isImperial ? (Number(effectiveData.source_flow_lmin ?? 50.0) * 0.264172052).toFixed(1) : (effectiveData.source_flow_lmin ?? 50.0))}
                  onChange={(e) => handleDraftChange('source_flow_lmin', e.target.value)}
                  onBlur={(e) => validateAndCommit('source_flow_lmin', e.target.value, true)}
                />
              </div>

              <div>
                {renderLabel(`Injected Temp (${isImperial ? '°F' : '°C'})`, 'temperature')}
                <input
                  type="number"
                  className="form-input" style={{ width: '100%' }}
                  step="0.1"
                  value={localDrafts.temperature !== undefined
                    ? localDrafts.temperature
                    : (isImperial ? (((Number(effectiveData.temperature ?? 293.15)) - 273.15) * 1.8 + 32).toFixed(1) : ((Number(effectiveData.temperature ?? 293.15)) - 273.15).toFixed(1))}
                  onChange={(e) => handleDraftChange('temperature', e.target.value)}
                  onBlur={(e) => validateAndCommit('temperature', e.target.value)}
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
                  className="form-input" style={{ width: '100%' }} 
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
                {renderLabel(`Set Point (${isImperial ? 'psi(a)' : 'bar(a)'})`, 'set_pressure')}
                <input 
                  type="number" 
                  className="form-input" style={{ width: '100%' }} 
                  step="0.1" 
                  value={localDrafts.set_pressure !== undefined ? localDrafts.set_pressure : (isImperial ? ((Number(effectiveData.set_pressure || 100000) / 100000) * 14.5037738).toFixed(1) : (Number(effectiveData.set_pressure || 100000) / 100000).toFixed(1))} 
                  onChange={(e) => handleDraftChange('set_pressure', e.target.value)}
                  onBlur={(e) => {
                    const rawVal = parseFloat(e.target.value);
                    if (isNaN(rawVal)) return;
                    const pa = isImperial ? rawVal * 6894.757293 : rawVal * 100000;
                    validateAndCommit('set_pressure', pa);
                  }}
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
                  className="form-input" style={{ width: '100%' }} 
                  value={localDrafts.max_cv !== undefined ? localDrafts.max_cv : (effectiveData.max_cv || 0)} 
                  onChange={(e) => handleDraftChange('max_cv', e.target.value)}
                  onBlur={(e) => validateAndCommit('max_cv', e.target.value, true)}
                />
              </div>
              <div>
                {renderLabel(`Set Temperature (${isImperial ? '°F' : '°C'})`, 'set_temperature_c')}
                <input 
                  type="number" 
                  className="form-input" style={{ width: '100%' }} 
                  step="0.1" 
                  value={localDrafts.set_temperature_c !== undefined ? localDrafts.set_temperature_c : (isImperial ? (Number(effectiveData.set_temperature_c || 40.0) * 1.8 + 32).toFixed(1) : (effectiveData.set_temperature_c || 40.0))} 
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
                  className="form-input" style={{ width: '100%' }} 
                  value={localDrafts.max_cv !== undefined ? localDrafts.max_cv : (effectiveData.max_cv || 0)} 
                  onChange={(e) => handleDraftChange('max_cv', e.target.value)}
                  onBlur={(e) => validateAndCommit('max_cv', e.target.value, true)}
                />
              </div>
              <div>
                {renderLabel('Opening (%)', 'opening')}
                <input 
                  type="number" 
                  className="form-input" style={{ width: '100%' }} 
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
                {renderLabel(`Cracking Set Pressure (${isImperial ? 'psi(a)' : 'bar(a)'})`, 'set_pressure_bar')}
                <input 
                  type="number" step="0.1" min="0.01"
                  className="form-input" style={{ width: '100%' }} 
                  value={localDrafts.set_pressure_bar !== undefined ? localDrafts.set_pressure_bar : (isImperial ? (Number(effectiveData.set_pressure_bar ?? 20.0) * 14.5037738).toFixed(1) : (effectiveData.set_pressure_bar ?? 20.0))} 
                  onChange={(e) => handleDraftChange('set_pressure_bar', e.target.value)}
                  onBlur={(e) => validateAndCommit('set_pressure_bar', e.target.value, true)}
                />
              </div>
              <div>
                {renderLabel('Flow Coefficient (Cv)', 'cv')}
                <input 
                  type="number" step="0.1" min="0.001"
                  className="form-input" style={{ width: '100%' }} 
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
                    className="form-input" style={{ width: '100%' }} 
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
                {renderLabel(`Burst Pressure (${isImperial ? 'psi(a)' : 'bar(a)'})`, 'burst_pressure_bar')}
                <input 
                  type="number" step="0.1" min="0.01"
                  className="form-input" style={{ width: '100%' }} 
                  value={localDrafts.burst_pressure_bar !== undefined ? localDrafts.burst_pressure_bar : (isImperial ? (Number(effectiveData.burst_pressure_bar ?? 25.0) * 14.5037738).toFixed(1) : (effectiveData.burst_pressure_bar ?? 25.0))} 
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
                  {renderLabel(`Orifice Restriction Diameter (${isImperial ? 'in' : 'mm'})`, 'orifice_diameter')}
                  <input 
                    type="number" 
                    className="form-input" style={{ width: '100%' }} 
                    value={localDrafts.orifice_diameter !== undefined ? localDrafts.orifice_diameter : (isImperial ? (Number(effectiveData.orifice_diameter || 0.01) * 39.37007874).toFixed(3) : mToMm(effectiveData.orifice_diameter || 0.01))} 
                    onChange={(e) => handleDraftChange('orifice_diameter', e.target.value)}
                    onBlur={(e) => {
                      const rawVal = parseFloat(e.target.value);
                      if (isNaN(rawVal)) return;
                      const m = isImperial ? rawVal / 39.37007874 : mmToM(rawVal);
                      validateAndCommit('orifice_diameter', m, true);
                    }}
                  />
                </div>
              ) : (
                <div>
                  {renderLabel('Flow Coefficient (Cv)', 'cv')}
                  <input 
                    type="number" step="0.1" min="0.001"
                    className="form-input" style={{ width: '100%' }} 
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
                  className="form-input" style={{ width: '100%' }} 
                  step="0.1"
                  value={localDrafts.cv !== undefined ? localDrafts.cv : (effectiveData.cv ?? 10.0)} 
                  onChange={(e) => handleDraftChange('cv', e.target.value)}
                  onBlur={(e) => validateAndCommit('cv', e.target.value, true)}
                />
              </div>
              <div>
                {renderLabel(`Cracking Pressure (${isImperial ? 'psi(d)' : 'bar(d)'})`, 'cracking_pressure_bar')}
                <input 
                  type="number" 
                  className="form-input" style={{ width: '100%' }} 
                  step="0.01" min="0"
                  value={localDrafts.cracking_pressure_bar !== undefined ? localDrafts.cracking_pressure_bar : (isImperial ? (Number(effectiveData.cracking_pressure_bar ?? 0.05) * 14.5037738).toFixed(2) : (effectiveData.cracking_pressure_bar ?? 0.05))} 
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
                  className="form-input" style={{ width: '100%' }} 
                  step="0.1"
                  value={localDrafts.cv !== undefined ? localDrafts.cv : (effectiveData.cv ?? 10.0)} 
                  onChange={(e) => handleDraftChange('cv', e.target.value)}
                  onBlur={(e) => validateAndCommit('cv', e.target.value, true)}
                />
              </div>
              <div>
                {renderLabel(`Cracking Pressure (${isImperial ? 'psi(d)' : 'bar(d)'})`, 'cracking_pressure_bar')}
                <input 
                  type="number" 
                  className="form-input" style={{ width: '100%' }} 
                  step="0.01" min="0"
                  value={localDrafts.cracking_pressure_bar !== undefined ? localDrafts.cracking_pressure_bar : (isImperial ? (Number(effectiveData.cracking_pressure_bar ?? 0.05) * 14.5037738).toFixed(2) : (effectiveData.cracking_pressure_bar ?? 0.05))} 
                  onChange={(e) => handleDraftChange('cracking_pressure_bar', e.target.value)}
                  onBlur={(e) => validateAndCommit('cracking_pressure_bar', e.target.value, true)}
                />
              </div>
              <div>
                {renderLabel(`Orifice Diameter (${isImperial ? 'in' : 'mm'})`, 'orifice_diameter')}
                <input 
                  type="number" 
                  className="form-input" style={{ width: '100%' }} 
                  value={localDrafts.orifice_diameter !== undefined ? localDrafts.orifice_diameter : (isImperial ? (Number(effectiveData.orifice_diameter || 0.01) * 39.37007874).toFixed(3) : mToMm(effectiveData.orifice_diameter || 0.01))} 
                  onChange={(e) => handleDraftChange('orifice_diameter', e.target.value)}
                  onBlur={(e) => {
                    const rawVal = parseFloat(e.target.value);
                    if (isNaN(rawVal)) return;
                    const m = isImperial ? rawVal / 39.37007874 : mmToM(rawVal);
                    validateAndCommit('orifice_diameter', m, true);
                  }}
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
                {renderLabel('Rating Method', 'rating_method')}
                <select 
                  style={{ width: '100%', fontSize: '12px', padding: '4px' }} 
                  value={effectiveData.rating_method || "rated_duty"} 
                  onChange={(e) => {
                    const val = e.target.value;
                    if (isNode) onUpdate(id, { rating_method: val });
                  }}
                >
                  <option value="rated_duty">Specify Rated Duty</option>
                  <option value="design_temps">Specify Design Temperatures</option>
                  <option value="ua_direct">Specify Heat Transfer (UA)</option>
                </select>
              </div>
              <div>
                {renderLabel(`Rated Flow (${isImperial ? 'GPM' : 'L/min'})`, 'rated_flow_lmin')}
                <input 
                  type="number" 
                  className="form-input" style={{ width: '100%' }} 
                  value={localDrafts.rated_flow_lmin !== undefined ? localDrafts.rated_flow_lmin : (isImperial ? (Number(effectiveData.rated_flow_lmin || 500.0) * 0.264172052).toFixed(1) : (effectiveData.rated_flow_lmin || 500.0))} 
                  onChange={(e) => handleDraftChange('rated_flow_lmin', e.target.value)}
                  onBlur={(e) => validateAndCommit('rated_flow_lmin', e.target.value, true)}
                />
              </div>
              {(effectiveData.rating_method || "rated_duty") === "rated_duty" && (
                <div>
                  {renderLabel(`Rated Cooling (${isImperial ? 'HP' : 'kW'})`, 'rated_cooling_kw')}
                  <input 
                    type="number" 
                    className="form-input" style={{ width: '100%' }} 
                    value={localDrafts.rated_cooling_kw !== undefined ? localDrafts.rated_cooling_kw : (isImperial ? (Number(effectiveData.rated_cooling_kw || 300.0) * 1.34102209).toFixed(2) : (effectiveData.rated_cooling_kw || 300.0))} 
                    onChange={(e) => handleDraftChange('rated_cooling_kw', e.target.value)}
                    onBlur={(e) => validateAndCommit('rated_cooling_kw', e.target.value, true)}
                  />
                </div>
              )}
              {((effectiveData.rating_method || "rated_duty") === "rated_duty" || (effectiveData.rating_method || "rated_duty") === "design_temps") && (
                <div>
                  {renderLabel(`Design Inlet Temp (${isImperial ? '°F' : '°C'})`, 'design_inlet_temp_c')}
                  <input 
                    type="number" 
                    className="form-input" style={{ width: '100%' }} 
                    value={localDrafts.design_inlet_temp_c !== undefined ? localDrafts.design_inlet_temp_c : (isImperial ? (Number(effectiveData.design_inlet_temp_c || 50.0) * 1.8 + 32).toFixed(1) : (effectiveData.design_inlet_temp_c || 50.0))} 
                    onChange={(e) => handleDraftChange('design_inlet_temp_c', e.target.value)}
                    onBlur={(e) => validateAndCommit('design_inlet_temp_c', e.target.value)}
                  />
                </div>
              )}
              {(effectiveData.rating_method || "rated_duty") === "design_temps" && (
                <div>
                  {renderLabel(`Design Outlet Temp (${isImperial ? '°F' : '°C'})`, 'design_outlet_temp_c')}
                  <input 
                    type="number" 
                    className="form-input" style={{ width: '100%' }} 
                    value={localDrafts.design_outlet_temp_c !== undefined ? localDrafts.design_outlet_temp_c : (isImperial ? (Number(effectiveData.design_outlet_temp_c || 40.0) * 1.8 + 32).toFixed(1) : (effectiveData.design_outlet_temp_c || 40.0))} 
                    onChange={(e) => handleDraftChange('design_outlet_temp_c', e.target.value)}
                    onBlur={(e) => validateAndCommit('design_outlet_temp_c', e.target.value)}
                  />
                </div>
              )}
              {(effectiveData.rating_method || "rated_duty") === "ua_direct" && (
                <div>
                  {renderLabel('Heat Transfer Coeff (UA, W/K)', 'ua_direct_w_k')}
                  <input 
                    type="number" 
                    className="form-input" style={{ width: '100%' }} 
                    value={localDrafts.ua_direct_w_k !== undefined ? localDrafts.ua_direct_w_k : (effectiveData.ua_direct_w_k || 1000.0)} 
                    onChange={(e) => handleDraftChange('ua_direct_w_k', e.target.value)}
                    onBlur={(e) => validateAndCommit('ua_direct_w_k', e.target.value, true)}
                  />
                </div>
              )}
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
                  {renderLabel(`Cooling Medium Temp (${isImperial ? '°F' : '°C'})`, 'medium_temp_c')}
                  <input 
                    type="number" 
                    className="form-input" style={{ width: '100%' }} 
                    value={localDrafts.medium_temp_c !== undefined ? localDrafts.medium_temp_c : (isImperial ? (Number(effectiveData.medium_temp_c || 10.0) * 1.8 + 32).toFixed(1) : (effectiveData.medium_temp_c || 10.0))} 
                    onChange={(e) => handleDraftChange('medium_temp_c', e.target.value)}
                    onBlur={(e) => validateAndCommit('medium_temp_c', e.target.value)}
                  />
                </div>
              )}
              <div>
                {renderLabel(`Rated Pressure Drop (${isImperial ? 'psi(d)' : 'bar(d)'})`, 'rated_dp_bar')}
                <input 
                  type="number" step="0.01" 
                  className="form-input" style={{ width: '100%' }} 
                  value={localDrafts.rated_dp_bar !== undefined ? localDrafts.rated_dp_bar : (isImperial ? (Number(effectiveData.rated_dp_bar || 0.5) * 14.5037738).toFixed(2) : (effectiveData.rated_dp_bar || 0.5))} 
                  onChange={(e) => handleDraftChange('rated_dp_bar', e.target.value)}
                  onBlur={(e) => validateAndCommit('rated_dp_bar', e.target.value, true)}
                />
              </div>
            </>
          )}

          {isNode && type === 'filter' && (
            <>
              <div>
                {renderLabel(`Clean ΔP (${isImperial ? 'psi(d)' : 'bar(d)'})`, 'dp_clean')}
                <input 
                  type="number" step="0.01" 
                  className="form-input" style={{ width: '100%' }} 
                  value={localDrafts.dp_clean !== undefined ? localDrafts.dp_clean : (isImperial ? (Number(effectiveData.dp_clean || 0.2) * 14.5037738).toFixed(2) : (effectiveData.dp_clean || 0.2))} 
                  onChange={(e) => handleDraftChange('dp_clean', e.target.value)}
                  onBlur={(e) => validateAndCommit('dp_clean', e.target.value, true)}
                />
              </div>
              <div>
                {renderLabel(`Terminal ΔP (${isImperial ? 'psi(d)' : 'bar(d)'})`, 'dp_terminal')}
                <input 
                  type="number" step="0.1" 
                  className="form-input" style={{ width: '100%' }} 
                  value={localDrafts.dp_terminal !== undefined ? localDrafts.dp_terminal : (isImperial ? (Number(effectiveData.dp_terminal || 1.0) * 14.5037738).toFixed(2) : (effectiveData.dp_terminal || 1.0))} 
                  onChange={(e) => handleDraftChange('dp_terminal', e.target.value)}
                  onBlur={(e) => validateAndCommit('dp_terminal', e.target.value, true)}
                />
              </div>
              <div>
                {renderLabel(`Rated Flow (${isImperial ? 'GPM' : 'L/min'})`, 'flow_ref')}
                <input 
                  type="number" 
                  className="form-input" style={{ width: '100%' }} 
                  value={localDrafts.flow_ref !== undefined ? localDrafts.flow_ref : (isImperial ? (Number(effectiveData.flow_ref || 100.0) * 0.264172052).toFixed(1) : (effectiveData.flow_ref || 100.0))} 
                  onChange={(e) => handleDraftChange('flow_ref', e.target.value)}
                  onBlur={(e) => validateAndCommit('flow_ref', e.target.value, true)}
                />
              </div>
              <div>
                {renderLabel('Clogging Level (%)', 'clogging')}
                <input 
                  type="number" 
                  className="form-input" style={{ width: '100%' }} 
                  value={localDrafts.clogging !== undefined ? localDrafts.clogging : (effectiveData.clogging || 0.0)} 
                  onChange={(e) => handleDraftChange('clogging', e.target.value)}
                  onBlur={(e) => validateAndCommit('clogging', e.target.value)}
                />
              </div>
            </>
          )}

          {isNode && type === 'orifice' && (() => {
            const telemetryPipeD = node?.data?.telemetry?.pipe_diameter;
            const activePipeD = telemetryPipeD ?? effectiveData.pipe_diameter ?? 0.05248;
            const activePipeDmm = (activePipeD * 1000).toFixed(2);
            const activePipeDin = (activePipeD * 39.37007874).toFixed(3);
            const isTelemetryPipe = telemetryPipeD != null;

            const _orifDm = effectiveData.orifice_diameter || 0.07;
            const _beta = _orifDm / activePipeD;
            const _standard = effectiveData.standard || 'iso_5167';

            return (
              <>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                    <label style={{ fontSize: '11px', color: '#64748b' }}>Connected Pipe Diameter ({isImperial ? 'in' : 'mm'})</label>
                    {isTelemetryPipe && (
                      <span style={{ fontSize: '9.5px', color: '#395253', background: '#EBF0EF', border: '1px solid #D8E2E1', borderRadius: '3px', padding: '1px 5px', fontWeight: '600' }}>
                        AUTO
                      </span>
                    )}
                  </div>
                  <div style={{
                    width: '100%',
                    padding: '5px 8px',
                    borderRadius: '4px',
                    background: '#F4F7F6',
                    border: '1px solid #D8E2E1',
                    fontSize: '12px',
                    color: isTelemetryPipe ? '#1C2B2C' : '#94a3b8',
                    fontFamily: 'var(--font-mono, monospace)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    boxSizing: 'border-box',
                  }}>
                    <span>{isImperial ? `${activePipeDin} in` : `${activePipeDmm} mm`}</span>
                    {!isTelemetryPipe && (
                      <span style={{ fontSize: '9.5px', color: '#94a3b8', fontFamily: 'inherit' }}>no pipe connected</span>
                    )}
                  </div>
                  <div style={{ fontSize: '10px', color: '#587071', marginTop: '3px' }}>
                    Auto-detected from the inlet pipe edge. Run simulation to update.
                  </div>
                </div>

                <div>
                  {renderLabel(`Orifice Restriction Diameter (${isImperial ? 'in' : 'mm'})`, 'orifice_diameter')}
                  <input 
                    type="number" 
                    className="form-input" style={{ width: '100%' }} 
                    value={localDrafts.orifice_diameter !== undefined ? localDrafts.orifice_diameter : (isImperial ? (Number(effectiveData.orifice_diameter || 0.07) * 39.37007874).toFixed(3) : mToMm(effectiveData.orifice_diameter || 0.07))} 
                    onChange={(e) => handleDraftChange('orifice_diameter', e.target.value)}
                    onBlur={(e) => {
                      const rawVal = parseFloat(e.target.value);
                      if (isNaN(rawVal)) return;
                      const m = isImperial ? rawVal / 39.37007874 : mmToM(rawVal);
                      validateAndCommit('orifice_diameter', m, true);
                    }}
                  />
                  {_standard === 'iso_5167' && _beta > 0.75 && (
                    <div style={{
                      marginTop: '5px',
                      padding: '5px 8px',
                      borderRadius: '4px',
                      background: '#FFFBEB',
                      border: '1px solid #FCD34D',
                      fontSize: '10px',
                      color: '#92400E',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '5px',
                    }}>
                      <span style={{ fontSize: '12px', lineHeight: 1 }}>⚠</span>
                      <span>
                        <strong>β = {_beta.toFixed(3)}</strong> — outside ISO 5167&#8209;2 range [0.10–0.75]. Results are extrapolated.
                      </span>
                    </div>
                  )}
                </div>

                <div>
                  {renderLabel('Standard', 'standard')}
                  <select 
                    style={{ width: '100%', fontSize: '12px', padding: '4px' }} 
                    value={_standard} 
                    onChange={(e) => onUpdate(id, { standard: e.target.value })}
                    title="ISO 5167-2:2022 (Reader-Harris/Gallagher) or the legacy classic Cd model."
                  >
                    <option value="iso_5167" title="ISO 5167-2:2022 Reader-Harris/Gallagher discharge coefficient with §5.4 Formula (7) permanent pressure loss.">ISO 5167 (Reader-Harris/Gallagher)</option>
                    <option value="classic_cd" title="Legacy Reynolds-corrected discharge coefficient model.">Classic Cd (legacy)</option>
                  </select>
                  <div style={{ fontSize: '10px', color: '#587071', marginTop: '4px', background: '#f4f7f6', padding: '6px', borderRadius: '4px', border: '1px solid #d8e2e1' }}>
                    <span><strong>ISO 5167:</strong> Reader-Harris/Gallagher meter coefficient with ISO 5167-2 permanent pressure loss. <strong>Classic Cd:</strong> turbulent discharge coefficient with (1 − β²) loss.</span>
                  </div>
                </div>
              </>
            );
          })()}

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
                {renderLabel(`Baseline Flow (${isImperial ? 'GPM' : 'L/min'})`, 'flow_base_lmin')}
                <input 
                  type="number" 
                  step="0.1"
                  className="form-input" style={{ width: '100%' }} 
                  value={localDrafts.flow_base_lmin !== undefined ? localDrafts.flow_base_lmin : (isImperial ? (Number(effectiveData.flow_base_lmin || 10.0) * 0.264172052).toFixed(1) : (effectiveData.flow_base_lmin || 10.0))} 
                  onChange={(e) => handleDraftChange('flow_base_lmin', e.target.value)}
                  onBlur={(e) => validateAndCommit('flow_base_lmin', e.target.value, true)}
                />
              </div>
              <div>
                {renderLabel(`Baseline Inlet Pressure (${isImperial ? 'psi(a)' : 'bar(a)'})`, 'inlet_pressure_base_bar')}
                <input 
                  type="number" 
                  step="0.05"
                  className="form-input" style={{ width: '100%' }} 
                  value={localDrafts.inlet_pressure_base_bar !== undefined ? localDrafts.inlet_pressure_base_bar : (isImperial ? (Number(effectiveData.inlet_pressure_base_bar || 3.5) * 14.5037738).toFixed(2) : (effectiveData.inlet_pressure_base_bar || 3.5))} 
                  onChange={(e) => handleDraftChange('inlet_pressure_base_bar', e.target.value)}
                  onBlur={(e) => validateAndCommit('inlet_pressure_base_bar', e.target.value, true)}
                />
              </div>
              <div>
                {renderLabel(`Baseline Outlet Pressure (${isImperial ? 'psi(a)' : 'bar(a)'})`, 'outlet_pressure_base_bar')}
                <input 
                  type="number" 
                  step="0.05"
                  className="form-input" style={{ width: '100%' }} 
                  value={localDrafts.outlet_pressure_base_bar !== undefined ? localDrafts.outlet_pressure_base_bar : (isImperial ? (Number(effectiveData.outlet_pressure_base_bar || 1.0) * 14.5037738).toFixed(2) : (effectiveData.outlet_pressure_base_bar || 1.0))} 
                  onChange={(e) => handleDraftChange('outlet_pressure_base_bar', e.target.value)}
                  onBlur={(e) => validateAndCommit('outlet_pressure_base_bar', e.target.value, true)}
                />
              </div>
              <div>
                {renderLabel(`Baseline Temp (${isImperial ? '°F' : '°C'})`, 'temp_base_c')}
                <input 
                  type="number" 
                  step="0.5"
                  className="form-input" style={{ width: '100%' }} 
                  value={localDrafts.temp_base_c !== undefined ? localDrafts.temp_base_c : (isImperial ? (Number(effectiveData.temp_base_c || 45.0) * 1.8 + 32).toFixed(1) : (effectiveData.temp_base_c || 45.0))} 
                  onChange={(e) => handleDraftChange('temp_base_c', e.target.value)}
                  onBlur={(e) => validateAndCommit('temp_base_c', e.target.value, true)}
                />
              </div>
            </>
          )}

          {isNode && type === 'text_bubble' && (
            <>
              <div>
                <label style={{ fontSize: '11px', color: '#64748b' }}>Title</label>
                <input 
                  className="form-input" style={{ width: '100%' }} 
                  value={localDrafts.title !== undefined ? localDrafts.title : (data.title || 'NOTE')} 
                  onChange={(e) => handleDraftChange('title', e.target.value)}
                  onBlur={(e) => validateAndCommit('title', e.target.value)}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: '#64748b' }}>Note Content</label>
                <textarea 
                  rows={4}
                  className="form-input"
                  style={{ width: '100%', height: 'auto', padding: '6px', resize: 'vertical' }} 
                  value={localDrafts.text !== undefined ? localDrafts.text : (data.text || '')} 
                  onChange={(e) => handleDraftChange('text', e.target.value)}
                  onBlur={(e) => validateAndCommit('text', e.target.value)}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: '#64748b' }}>Font Size</label>
                <select
                  className="form-select"
                  style={{ width: '100%' }}
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
