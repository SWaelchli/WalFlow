import React, { useMemo, useState } from 'react';

import { notify, confirmDialog } from '../../utils/dialogs';
import { mToMm, mToIn } from '../../utils/converters';
import { RELIEF_DRIVER_TYPES } from '../../constants/case_constants';
import { FLUID_CATEGORIES, FLUID_LIBRARY } from '../../constants/fluid_library';
import { getEffectiveNodeData } from '../../utils/case_resolver';
import { GlobeIcon, BoltIcon, WarningIcon, CrossIcon, CaretDownIcon } from '../symbols/IconLibrary';
import { componentLabel } from '../../constants/componentLabels';
import { validPortCount, NEUTRAL_TYPES } from '../../utils/networkValidation';
import { MIN_JUNCTION_PORTS, MAX_JUNCTION_PORTS, junctionPortCount, junctionPortIds } from '../../utils/junctionLayout';
import { MIN_BOUNDARY_PORTS, MAX_BOUNDARY_PORTS, BOUNDARY_PORT_TYPES, boundaryPortCount } from '../../utils/boundaryLayout';

import { useUnits } from '../../context/UnitContext';
import { useFittingStandards } from '../../hooks/useFittingStandards';
import { DEFAULT_REDUCER_STANDARD, CUSTOM_REDUCER_STANDARD } from '../../utils/reducer_catalog';
import { CONTROL_VALVE_STYLE_DEFAULTS } from '../../utils/nodeDefaults';
import DraftNumberInput from '../common/DraftNumberInput';
import PropertyBadge from './PropertyBadge';
import PipeSelector from './PipeSelector';
import ReducerSetup from './ReducerSetup';
import InstrumentSetup from './InstrumentSetup';


import { clickableProps } from '../../utils/a11yProps';
import { portNumberLabel } from '../../utils/portLabels';
const FLOW_SPLIT_OPTIONS = [
  ['common_pressure', 'Calculate flow per port based on equal pressure'],
  ['total_split', 'Distribute flow equally between ports'],
  ['per_port', 'Set flow at every port'],
];

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
  availablePipeClasses = [],
  allowCustomPipes = true,
  allNodes = [],
  allEdges = [],
  style = {},

  inline = false
}) {

  const { isImperial, fromInputValue, toDisplayValue, smallLengthToM, formatPressureGauge, labels, gaugeLabel, formatFlow } = useUnits();

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [localDrafts, setLocalDrafts] = useState({});
  const [reducerNotice, setReducerNotice] = useState(null); // { nodeId, kind: 'error' | 'warning', text }
  const reducerStandards = useFittingStandards('reducer');
  const scheduleStandards = useFittingStandards('pipe_schedule');
  const valveStyleCatalogues = useFittingStandards('control_valve');

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

  // PSV: a pilot reads the node its signal line comes from
  const psvValveType = effectiveData.valve_type || 'conventional';
  const psvActionMode = effectiveData.action_mode || 'pop_action';
  const psvPilotLine = allEdges.find(e => e.target === id && e.targetHandle === 'signal-in');
  const psvPilotSource = psvPilotLine ? allNodes.find(n => n.id === psvPilotLine.source) : null;

  const renderLabel = (labelStr, propKey) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
      <label style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)' }}>{labelStr}</label>
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

  // NPSH inputs shared by both pump types; lengths are shown in metres / feet
  const renderNpshFields = () => (
    <>
      <div>
        {renderLabel(`NPSHr (${isImperial ? 'ft' : 'm'}, 0 = not entered)`, 'npshr_m')}
        <input
          type="number" min="0" step="0.1" placeholder="0"
          className="form-input" style={{ width: '100%' }}
          value={localDrafts.npshr_m !== undefined ? localDrafts.npshr_m : (isImperial ? (Number(effectiveData.npshr_m ?? 0) * 3.280839895).toFixed(1) : (effectiveData.npshr_m ?? 0))}
          onChange={(e) => handleDraftChange('npshr_m', e.target.value)}
          onBlur={(e) => validateAndCommit('npshr_m', e.target.value)}
        />
      </div>
      <div>
        {renderLabel(`NPSH margin (${isImperial ? 'ft' : 'm'})`, 'npsh_margin_m')}
        <input
          type="number" min="0" step="0.1"
          className="form-input" style={{ width: '100%' }}
          value={localDrafts.npsh_margin_m !== undefined ? localDrafts.npsh_margin_m : (isImperial ? (Number(effectiveData.npsh_margin_m ?? 0.5) * 3.280839895).toFixed(1) : (effectiveData.npsh_margin_m ?? 0.5))}
          onChange={(e) => handleDraftChange('npsh_margin_m', e.target.value)}
          onBlur={(e) => validateAndCommit('npsh_margin_m', e.target.value)}
        />
        <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>
          Cavitation warning when NPSHa &lt; NPSHr + margin (datasheet NPSHr at the duty point).
        </p>
      </div>
    </>
  );

  // `rawValue` is always the value as typed in the active unit system. `toSi` converts it to the stored
  // unit when the input's display unit is not the field's default one (e.g. mm/in for small lengths).
  const validateAndCommit = (field, rawValue, isCritical = false, { toSi } = {}) => {
    let finalValue = rawValue;

    // Leaving an untouched field must not rewrite it with its rounded display value
    if (!Object.prototype.hasOwnProperty.call(localDrafts, field)) return;

    // Handle empty string
    if (finalValue === '' || finalValue === undefined || finalValue === null) {
      if (isCritical) {
        notify(`${field} cannot be empty or zero. Reverting to previous value.`, 'error');
        setLocalDrafts({}); 
        return;
      }
      finalValue = 0;
    }

    const convertedVal = toSi ? toSi(finalValue) : fromInputValue(field, finalValue);
    const numericValue = typeof convertedVal === 'number' ? convertedVal : parseFloat(convertedVal);

    // Critical validation
    if (isCritical) {
      if (field === 'opening_pct') {
        if (isNaN(numericValue) || numericValue < 0 || numericValue > 100) {
          notify('Opening must be a number between 0 and 100.', 'warning');
          setLocalDrafts({});
          return;
        }
      } else if (field === 'efficiency_pct') {
        if (isNaN(numericValue) || numericValue < 1 || numericValue > 100) {
          notify('Efficiency must be a number between 1 and 100 %.', 'warning');
          setLocalDrafts({});
          return;
        }
      } else if (field === 'max_discharge_pressure_bara') {
        if (isNaN(numericValue) || numericValue <= 1.0) {
          notify(`Max. discharge pressure must be above 1 bar absolute (14.5 psia).`, 'warning');
          setLocalDrafts({});
          return;
        }
      } else if (field === 'temp_base_c') {
        // Calibration temperature: any physical temperature, including 0 °C and below
        if (isNaN(numericValue) || numericValue <= -273.15) {
          notify('Calibration temperature must be above absolute zero.', 'warning');
          setLocalDrafts({});
          return;
        }
      } else if (field === 'cracking_pressure_bar') {
        // Zero cracking pressure is a valid check valve
        if (isNaN(numericValue) || numericValue < 0) {
          notify('Cracking pressure must be zero or positive.', 'warning');
          setLocalDrafts({});
          return;
        }
      } else if (field === 'fl') {
        if (isNaN(numericValue) || numericValue <= 0 || numericValue > 1) {
          notify('F_L must be greater than 0 and at most 1.', 'warning');
          setLocalDrafts({});
          return;
        }
      } else if (field === 'fd') {
        if (isNaN(numericValue) || numericValue <= 0) {
          notify('F_d must be greater than 0.', 'warning');
          setLocalDrafts({});
          return;
        }
      } else if (field === 'set_flow_lmin') {
        // A magnitude: the direction is set by supply / draw; 0 stops the boundary
        if (!Number.isFinite(numericValue) || numericValue < 0) {
          notify('Set flow must be zero or positive. Choose supply or draw for the direction.', 'warning');
          setLocalDrafts({});
          return;
        }
      } else if (field === 'min_suction_pressure_bara') {
        if (!Number.isFinite(numericValue) || numericValue < 0) {
          notify('Min. suction pressure must be zero or positive.', 'warning');
          setLocalDrafts({});
          return;
        }
      } else if (isNaN(numericValue) || numericValue <= 0) {
        notify(`${field} must be a positive number greater than zero.`, 'warning');
        setLocalDrafts({});
        return;
      }
    }

    const processedValue = isNaN(numericValue) ? convertedVal : numericValue;
    const updates = { [field]: processedValue };

    // Clear local draft for this field once committed
    setLocalDrafts(prev => {
      const next = { ...prev };
      delete next[field];
      return next;
    });

    if (isNode) {
      onUpdate(id, updates);
    } else {
      onUpdateEdge(id, updates);
    }
  };

  const handleDraftChange = (field, val) => {
    setLocalDrafts(prev => ({ ...prev, [field]: val }));
  };

  // IEC 60534-2-1 valve style of a control valve: sets F_L and F_d for the viscosity correction
  const renderValveStyle = () => {
    const styleId = effectiveData.valve_style_id || CONTROL_VALVE_STYLE_DEFAULTS.valve_style_id;
    const fl = effectiveData.fl ?? CONTROL_VALVE_STYLE_DEFAULTS.fl;
    const fd = effectiveData.fd ?? CONTROL_VALVE_STYLE_DEFAULTS.fd;
    const factor = (v) => {
      const s = String(Number(v));
      return (s.split('.')[1] || '').length >= 2 ? s : Number(v).toFixed(2);
    };
    const isCustom = styleId === 'custom';
    const isLoading = valveStyleCatalogues.length === 0;
    const known = valveStyleCatalogues.some(cat => (cat.dimensions || []).some(row => `${cat.code}:${row.code}` === styleId));
    const isMissing = !isCustom && !isLoading && !known;
    const selectValue = isCustom ? 'custom' : styleId;

    const handleStyleChange = (value) => {
      if (value === 'custom') {
        onUpdate(id, { valve_style_id: 'custom' });
        return;
      }
      for (const cat of valveStyleCatalogues) {
        const row = (cat.dimensions || []).find(r => `${cat.code}:${r.code}` === value);
        if (row) {
          onUpdate(id, { valve_style_id: value, fl: row.fl, fd: row.fd });
          return;
        }
      }
    };

    // Self-contained label: valve type · trim, flow direction (the closed select shows no optgroup)
    const styleLabel = (row) => {
      const trimDir = [row.trim, row.flow_direction && row.flow_direction.toLowerCase()].filter(Boolean).join(', ');
      return [row.valve_type, trimDir].filter(Boolean).join(' · ') || row.code;
    };
    let selectedLabel = isCustom ? 'Custom' : undefined;
    valveStyleCatalogues.forEach(cat => (cat.dimensions || []).forEach(row => {
      if (`${cat.code}:${row.code}` === styleId) selectedLabel = styleLabel(row);
    }));

    const mutedNote = { fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', margin: '4px 0 0' };
    const styleHelp = 'IEC 60534-2-1 valve style: sets F_L and F_d for the viscosity correction. Flow to open: the flow pushes the plug away from the seat. Flow to close: the flow pushes it towards the seat. Cage: flow out = from inside the cage outwards.';

    return (
      <div>
        <label
          title={styleHelp}
          style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)' }}
        >
          Valve style
        </label>
        <select
          className="form-select"
          aria-label="Valve style"
          title={selectedLabel ? `${selectedLabel}\n\n${styleHelp}` : styleHelp}
          style={{ width: '100%', fontSize: 'var(--fs-xs)', padding: '4px' }}
          value={selectValue}
          onChange={(e) => handleStyleChange(e.target.value)}
        >
          {valveStyleCatalogues.map(cat => {
            const byType = [];
            (cat.dimensions || []).forEach(row => {
              let group = byType.find(g => g.type === row.valve_type);
              if (!group) { group = { type: row.valve_type, rows: [] }; byType.push(group); }
              group.rows.push(row);
            });
            return byType.map(group => (
              <optgroup key={`${cat.code}|${group.type}`} label={`${cat.name} - ${group.type}`}>
                {group.rows.map(row => (
                  <option key={row.code} value={`${cat.code}:${row.code}`}>
                    {styleLabel(row)}
                  </option>
                ))}
              </optgroup>
            ));
          })}
          {isMissing && <option value={styleId} disabled>Not in catalogue</option>}
          {isLoading && !isCustom && <option value={styleId} disabled>Loading styles...</option>}
          <option value="custom">Custom</option>
        </select>

        {isCustom ? (
          <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
            {[['fl', 'F_L', fl, '0.01'], ['fd', 'F_d', fd, '0.01']].map(([field, name, value, step]) => (
              <div key={field} style={{ flex: 1 }}>
                {renderLabel(name, field)}
                <input
                  type="number" min="0" step={step}
                  aria-label={name}
                  className="form-input" style={{ width: '100%' }}
                  value={localDrafts[field] !== undefined ? localDrafts[field] : value}
                  onChange={(e) => handleDraftChange(field, e.target.value)}
                  onBlur={(e) => validateAndCommit(field, e.target.value, true)}
                />
              </div>
            ))}
          </div>
        ) : (
          <p style={mutedNote}>
            {isMissing
              ? `Style not in catalogue: F_L ${factor(fl)}, F_d ${factor(fd)} kept`
              : `F_L ${factor(fl)} · F_d ${factor(fd)}`}
          </p>
        )}
      </div>
    );
  };

  const handleDelete = async () => {
    const label = isNode ? `node ${type}` : 'connection';
    const ok = await confirmDialog({
      title: isNode ? 'Delete component?' : 'Delete pipe?',
      message: `Delete this ${label}?`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    if (isNode) onDelete(id);
    else onDeleteEdge(id);
  };

  const isBoundaryType = BOUNDARY_PORT_TYPES.has(type);
  const [minPorts, maxPorts] = isBoundaryType ? [MIN_BOUNDARY_PORTS, MAX_BOUNDARY_PORTS] : [MIN_JUNCTION_PORTS, MAX_JUNCTION_PORTS];
  const portCountOk = validPortCount(data?.num_ports, minPorts, maxPorts);

  // Fewer ports: refused while a port that would go still has a pipe or a signal line
  const handlePortCountChange = (value) => {
    const next = parseInt(value, 10);
    const current = isBoundaryType ? boundaryPortCount(data) : junctionPortCount(data);
    // Compared with the stored value: an invalid one (e.g. 4.6) is replaced even by the count it displays
    if (!Number.isFinite(next) || (portCountOk && next === current)) return;
    if (next < current) {
      const inUse = [];
      for (let k = next; k < current; k += 1) {
        const handle = `port-${k}`;
        if (allEdges.some(e => (e.source === id && (e.sourceHandle === handle || e.sourceHandle === `signal-${handle}`)) || (e.target === id && e.targetHandle === handle))) {
          inUse.push(portNumberLabel(k));
        }
      }
      if (inUse.length) {
        notify(`${inUse.join(' and ')} still ${inUse.length > 1 ? 'have' : 'has'} a connected line. Delete ${inUse.length > 1 ? 'them' : 'it'} before reducing the number of ports.`, 'warning');
        return;
      }
      const sensing = { ...(data.sensing || {}) };
      for (let k = next; k < current; k += 1) delete sensing[`port-${k}`];
      onUpdate(id, { num_ports: next, sensing, ...resizedPortFlows(next) });
      return;
    }
    onUpdate(id, { num_ports: next, ...resizedPortFlows(next) });
  };

  // Per-port flows of a flow boundary follow the port count: new ports copy the last port, fewer ports trim
  const resizedPortFlows = (count) => {
    if (type !== 'flow_boundary' || !Array.isArray(data?.port_flows_lmin)) return {};
    const flows = data.port_flows_lmin.slice(0, count);
    const fill = flows.length ? flows[flows.length - 1] : (data.set_flow_lmin ?? 50.0);
    while (flows.length < count) flows.push(fill);
    return { port_flows_lmin: flows };
  };

  const sensingPorts = type === 'junction' ? junctionPortIds(junctionPortCount(data))
    : isBoundaryType ? junctionPortIds(boundaryPortCount(data))
    : NEUTRAL_TYPES.has(type) ? ['port-0', 'port-1'] : ['inlet-0', 'outlet-0'];
  const sensingLabel = (portId) => (portId.startsWith('port-') ? portNumberLabel(Number(portId.slice(5))).toUpperCase() : portId.toUpperCase());

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
          <div {...clickableProps} 
            style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
            onClick={() => setIsCollapsed(!isCollapsed)}
          >
            <CaretDownIcon size={10} color="var(--color-text-muted)" style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.2s' }} />
            <span style={{ 
              fontWeight: '700', 
              fontSize: 'var(--fs-base)', 
              color: '#1C2B2C', 
              letterSpacing: '-0.01em'
            }}>
              {componentLabel(type, { isEdge: !isNode })}
            </span>
          </div>

          <button 
            onClick={handleDelete}
            style={{ 
              background: 'rgba(239, 68, 68, 0.1)', 
              color: 'var(--color-danger-text)', 
              border: '1px solid rgba(239, 68, 68, 0.2)', 
              borderRadius: '6px', 
              padding: '4px 10px', 
              fontSize: 'var(--fs-xs)', 
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
              <label style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)' }}>Name tag</label>
              <input 
                className="form-input" style={{ width: '100%' }} 
                value={localDrafts.label !== undefined ? localDrafts.label : (data.label || '')} 
                onChange={(e) => handleDraftChange('label', e.target.value)}
                onBlur={(e) => validateAndCommit('label', e.target.value)}
              />
            </div>
          )}

          {isNode && (type === 'junction' || isBoundaryType) && (
            <div>
              <label htmlFor={`num-ports-${id}`} style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)' }}>Number of ports</label>
              <select
                id={`num-ports-${id}`}
                className="form-input" style={{ width: '100%' }}
                value={portCountOk ? (isBoundaryType ? boundaryPortCount(data) : junctionPortCount(data)) : ''}
                onChange={(e) => handlePortCountChange(e.target.value)}
              >
                {!portCountOk && <option value="" disabled>— invalid —</option>}
                {Array.from({ length: maxPorts - minPorts + 1 }, (_, i) => minPorts + i).map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          )}

          {/* a measurement tap always shows its pin and an instrument has none, so neither has sensing toggles */}
          {isNode && type !== 'text_bubble' && type !== 'measure_point' && type !== 'instrument' && (
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '8px' }}>
              <label style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', fontWeight: 'bold' }}>Sensing nodes (yellow pin)</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
                {sensingPorts.map(portId => (
                  <button
                    key={portId}
                    onClick={() => handleSensingToggle(portId)}
                    style={{
                      fontSize: 'var(--fs-xs)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer',
                      background: data.sensing?.[portId] ? 'var(--color-warning)' : 'var(--color-bg-canvas)',
                      color: data.sensing?.[portId] ? 'var(--color-text-inverse)' : 'var(--color-text-secondary)',
                      border: '1px solid var(--color-border)'
                    }}
                  >
                    {sensingLabel(portId)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!isNode && data.type !== 'SIGNAL' && (
            <>
              <div>
                {renderLabel(`Pipe Length (${isImperial ? 'ft' : 'm'})`, 'length_m')}
                <input 
                  type="number" 
                  className="form-input" style={{ width: '100%' }} 
                  value={localDrafts.length_m !== undefined ? localDrafts.length_m : (isImperial ? (Number(data.length_m ?? 25.0) * 3.280839895).toFixed(2) : (data.length_m ?? 25.0))} 
                  onChange={(e) => handleDraftChange('length_m', e.target.value)}
                  onBlur={(e) => validateAndCommit('length_m', e.target.value, true)}
                />
              </div>
              <div>
                {renderLabel('Pipe Class & Dimensions', 'diameter_m')}
                <PipeSelector 
                  data={data} 
                  availablePipeClasses={availablePipeClasses} 
                  allowCustomPipes={allowCustomPipes} 
                  onChange={(updates) => onUpdateEdge(id, updates)} // already SI, bypass fromInputValue
                />
              </div>

            </>
          )}


          {isNode && type === 'tank' && (
            <>
              <div>
                {renderLabel(`Fluid Level (${isImperial ? 'ft' : 'm'})`, 'level_m')}
                <input 
                  type="number" 
                  className="form-input" style={{ width: '100%' }} 
                  value={localDrafts.level_m !== undefined ? localDrafts.level_m : (isImperial ? (Number(effectiveData.level_m ?? 1.0) * 3.280839895).toFixed(2) : (effectiveData.level_m ?? 1.0))} 
                  onChange={(e) => handleDraftChange('level_m', e.target.value)}
                  onBlur={(e) => validateAndCommit('level_m', e.target.value)}
                />
              </div>
              <div>
                {renderLabel(`Elevation (${isImperial ? 'ft' : 'm'})`, 'elevation_m')}
                <input 
                  type="number" 
                  className="form-input" style={{ width: '100%' }} 
                  value={localDrafts.elevation_m !== undefined ? localDrafts.elevation_m : (isImperial ? (Number(effectiveData.elevation_m || 0) * 3.280839895).toFixed(2) : (effectiveData.elevation_m || 0))} 
                  onChange={(e) => handleDraftChange('elevation_m', e.target.value)}
                  onBlur={(e) => validateAndCommit('elevation_m', e.target.value)}
                />
              </div>
              <div>
                {renderLabel(`Temp (${isImperial ? '°F' : '°C'})`, 'temperature_k')}
                <input 
                  type="number" 
                  className="form-input" style={{ width: '100%' }} 
                  step="0.1" 
                  value={localDrafts.temperature_k !== undefined ? localDrafts.temperature_k : Number(toDisplayValue('temperature_k', effectiveData.temperature_k ?? 293.15)).toFixed(1)} 
                  onChange={(e) => handleDraftChange('temperature_k', e.target.value)}
                  onBlur={(e) => validateAndCommit('temperature_k', e.target.value)}
                />
              </div>
            </>
          )}

          {(type === 'centrifugal_pump' || type === 'pump') && (
            <>
              <div>
                {renderLabel('Operating Status', 'active')}
                <select 
                  style={{ width: '100%', fontSize: 'var(--fs-sm)', padding: '4px' }} 
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
                {renderLabel(`Rated Flow (${labels.flow})`, 'flow_rated_lmin')}
                <input 
                  type="number" 
                  className="form-input" style={{ width: '100%' }} 
                  value={localDrafts.flow_rated_lmin !== undefined ? localDrafts.flow_rated_lmin : toDisplayValue('flow_rated_lmin', effectiveData.flow_rated_lmin || 100)} 
                  onChange={(e) => handleDraftChange('flow_rated_lmin', e.target.value)}
                  onBlur={(e) => validateAndCommit('flow_rated_lmin', e.target.value, true)}
                />
              </div>
              <div>
                {renderLabel(`Rated Head (${isImperial ? 'ft' : 'm'})`, 'head_rated_m')}
                <input
                  type="number"
                  step="0.1"
                  className="form-input" style={{ width: '100%' }}
                  placeholder={effectiveData.head_rated_m ? undefined : 'Enter rated head'}
                  value={localDrafts.head_rated_m !== undefined ? localDrafts.head_rated_m : (effectiveData.head_rated_m ? (isImperial ? (Number(effectiveData.head_rated_m) * 3.280839895).toFixed(1) : effectiveData.head_rated_m) : '')}
                  onChange={(e) => handleDraftChange('head_rated_m', e.target.value)}
                  onBlur={(e) => { if (e.target.value !== '' || effectiveData.head_rated_m) validateAndCommit('head_rated_m', e.target.value, true); }}
                />
                {!effectiveData.head_rated_m ? (
                  <div role="alert" style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', marginTop: '6px', padding: '6px 8px', borderRadius: '6px', backgroundColor: '#FEF3C7', border: '1px solid #FCD34D', fontSize: 'var(--fs-xs)', color: 'var(--color-warning-text-strong)' }}>
                    <WarningIcon size={12} color="var(--color-warning-text-strong)" style={{ flexShrink: 0, marginTop: '1px' }} />
                    <span>
                      Rated head missing. Pumps are rated in head since v0.2; this pump{effectiveData.pressure_rated_bar ? ` had a rated pressure difference of ${effectiveData.pressure_rated_bar} bar` : ''}. Enter the head from the pump datasheet; the simulation will not run until then.
                    </span>
                  </div>
                ) : (
                  <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>
                    Pressure rise = ρ·g·head, so it follows the fluid density.
                    {data.telemetry?.inlets?.[0]?.density ? ` At the last result (ρ = ${data.telemetry.inlets[0].density.toFixed(0)} kg/m³) the rated head equals ${isImperial ? `${(data.telemetry.inlets[0].density * 9.81 * effectiveData.head_rated_m / 6894.757).toFixed(1)} psi` : `${(data.telemetry.inlets[0].density * 9.81 * effectiveData.head_rated_m / 1e5).toFixed(2)} bar`}.` : ''}
                  </p>
                )}
              </div>
              <div>
                {renderLabel('Rise to Shut-off (%)', 'rise_to_shutoff_pct')}
                <input 
                  type="number" 
                  className="form-input" style={{ width: '100%' }} 
                  value={localDrafts.rise_to_shutoff_pct !== undefined ? localDrafts.rise_to_shutoff_pct : (effectiveData.rise_to_shutoff_pct ?? 20.0)}
                  onChange={(e) => handleDraftChange('rise_to_shutoff_pct', e.target.value)}
                  onBlur={(e) => validateAndCommit('rise_to_shutoff_pct', e.target.value)}
                />
              </div>
              <div>
                {renderLabel('Pump Efficiency (%)', 'efficiency_pct')}
                <input
                  type="number"
                  min="1" max="100" step="1"
                  className="form-input" style={{ width: '100%' }}
                  value={localDrafts.efficiency_pct !== undefined ? localDrafts.efficiency_pct : (effectiveData.efficiency_pct ?? 75)}
                  onChange={(e) => handleDraftChange('efficiency_pct', e.target.value)}
                  onBlur={(e) => validateAndCommit('efficiency_pct', e.target.value, true)}
                />
                <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>
                  Hydraulic pump efficiency only, excluding the motor. Used for pump heat and shaft power.
                </p>
              </div>
              {renderNpshFields()}
              {effectiveData.active === false && (
                <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', margin: 0 }}>
                  Stopped pump: modelled as a flow resistance in both directions (rated head lost at rated flow). Add a check valve to block backflow.
                </p>
              )}
            </>
          )}

          {type === 'volumetric_pump' && (
            <>
              <div>
                {renderLabel('Operating Status', 'active')}
                <select 
                  style={{ width: '100%', fontSize: 'var(--fs-sm)', padding: '4px' }} 
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
                {renderLabel(`Rated Flow (${labels.flow})`, 'flow_rated_lmin')}
                <input 
                  type="number" 
                  className="form-input" style={{ width: '100%' }} 
                  value={localDrafts.flow_rated_lmin !== undefined ? localDrafts.flow_rated_lmin : toDisplayValue('flow_rated_lmin', effectiveData.flow_rated_lmin || 0)} 
                  onChange={(e) => handleDraftChange('flow_rated_lmin', e.target.value)}
                  onBlur={(e) => validateAndCommit('flow_rated_lmin', e.target.value, true)}
                />
              </div>
              <div>
                {renderLabel('Drive', 'drive_type')}
                <select
                  className="form-select"
                  style={{ width: '100%', height: '32px', fontSize: 'var(--fs-xs)' }}
                  value={effectiveData.drive_type || 'fixed_speed'}
                  onChange={(e) => { if (isNode) onUpdate(id, { drive_type: e.target.value }); }}
                >
                  <option value="fixed_speed">Fixed speed (motor overload flagged)</option>
                  <option value="vfd_power_limit">VFD with power limit (flow reduced)</option>
                </select>
                <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>
                  {(effectiveData.drive_type || 'fixed_speed') === 'fixed_speed'
                    ? 'Flow stays at displacement; above the motor rating the motor would overheat and trip.'
                    : 'Above the motor rating the drive slows the pump, so the flow drops to the power limit.'}
                </p>
              </div>
              <div>
                {renderLabel(`Max. Discharge Pressure (${labels.pressureAbs})`, 'max_discharge_pressure_bara')}
                <input
                  type="number"
                  step="1"
                  className="form-input" style={{ width: '100%' }}
                  value={localDrafts.max_discharge_pressure_bara !== undefined
                    ? localDrafts.max_discharge_pressure_bara
                    : toDisplayValue('max_discharge_pressure_bara', effectiveData.max_discharge_pressure_bara ?? 50.0)}
                  onChange={(e) => handleDraftChange('max_discharge_pressure_bara', e.target.value)}
                  onBlur={(e) => validateAndCommit('max_discharge_pressure_bara', e.target.value, true)}
                />
                <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>
                  Internal relief: above this outlet pressure the excess flow recirculates to suction, so the delivered flow drops below displacement.
                </p>
              </div>
              <div>
                {renderLabel(`Motor Rating (${isImperial ? 'HP' : 'kW'})`, 'motor_power_kw')}
                <input 
                  type="number" 
                  step="0.1"
                  className="form-input" style={{ width: '100%' }} 
                  value={localDrafts.motor_power_kw !== undefined ? localDrafts.motor_power_kw : (isImperial ? (Number(effectiveData.motor_power_kw || 0) * 1.34102209).toFixed(2) : (effectiveData.motor_power_kw || 0))} 
                  onChange={(e) => handleDraftChange('motor_power_kw', e.target.value)}
                  onBlur={(e) => validateAndCommit('motor_power_kw', e.target.value, true)}
                />
              </div>
              <div>
                {renderLabel('Pump Efficiency (%)', 'efficiency_pct')}
                <input
                  type="number"
                  className="form-input" style={{ width: '100%' }}
                  value={localDrafts.efficiency_pct !== undefined ? localDrafts.efficiency_pct : (effectiveData.efficiency_pct ?? 85)}
                  onChange={(e) => handleDraftChange('efficiency_pct', e.target.value)}
                  onBlur={(e) => validateAndCommit('efficiency_pct', e.target.value, true)}
                />
                <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>
                  Pump efficiency only, excluding the motor. Shaft power = flow × ΔP ÷ efficiency.
                </p>
              </div>
              {renderNpshFields()}
            </>
          )}

          {isNode && type === 'pressure_boundary' && (
            <>
              <div>
                {renderLabel(`Set Pressure (${labels.pressureAbs})`, 'set_pressure_bara')}
                <input
                  type="number"
                  className="form-input" style={{ width: '100%' }}
                  step="0.1"
                  value={localDrafts.set_pressure_bara !== undefined
                    ? localDrafts.set_pressure_bara
                    : toDisplayValue('set_pressure_bara', effectiveData.set_pressure_bara ?? 6.0)}
                  onChange={(e) => handleDraftChange('set_pressure_bara', e.target.value)}
                  onBlur={(e) => validateAndCommit('set_pressure_bara', e.target.value, true)}
                />
              </div>

              <div>
                {renderLabel(`Injected Temp (${isImperial ? '°F' : '°C'})`, 'temperature_k')}
                <input
                  type="number"
                  className="form-input" style={{ width: '100%' }}
                  step="0.1"
                  value={localDrafts.temperature_k !== undefined
                    ? localDrafts.temperature_k
                    : Number(toDisplayValue('temperature_k', effectiveData.temperature_k ?? 293.15)).toFixed(1)}
                  onChange={(e) => handleDraftChange('temperature_k', e.target.value)}
                  onBlur={(e) => validateAndCommit('temperature_k', e.target.value)}
                />
              </div>
            </>
          )}

          {isNode && type === 'flow_boundary' && (() => {
            const isDraw = effectiveData.flow_direction === 'draw';
            const telemetry = node?.data?.telemetry;
            const alertStyle = { background: '#FEF2F2', border: '1px solid #FEE2E2', borderRadius: '4px', padding: '8px', fontSize: 'var(--fs-xs)', color: 'var(--color-danger-text)' };
            const hintStyle = { fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', margin: '4px 0 0' };
            const pressureUnit = labels.pressureAbs;
            const pressureValue = (field, fallback) => (localDrafts[field] !== undefined
              ? localDrafts[field]
              : toDisplayValue(field, effectiveData[field] ?? fallback));
            const nPorts = boundaryPortCount(data);
            const flowSplit = effectiveData.flow_split ?? 'common_pressure';
            const perPort = nPorts > 1 && flowSplit === 'per_port';
            const portFlows = Array.isArray(data?.port_flows_lmin) ? data.port_flows_lmin : [];
            const connectedPorts = new Set();
            allEdges.forEach(e => {
              [[e.source, e.sourceHandle], [e.target, e.targetHandle]].forEach(([nodeId, handle]) => {
                const m = nodeId === id ? /^port-(\d+)$/.exec(String(handle ?? '')) : null;
                if (m) connectedPorts.add(Number(m[1]));
              });
            });
            const portFlowTotal = Array.from({ length: nPorts }, (_, k) => k)
              .filter(k => connectedPorts.has(k))
              .reduce((sum, k) => sum + Number(portFlows[k] ?? effectiveData.set_flow_lmin ?? 50.0), 0);
            const commitPortFlow = (k, raw) => {
              if (!Object.prototype.hasOwnProperty.call(localDrafts, `port_flow_${k}`)) return;
              const value = fromInputValue('set_flow_lmin', raw === '' ? 0 : raw);
              const numeric = typeof value === 'number' ? value : parseFloat(value);
              setLocalDrafts(prev => {
                const next = { ...prev };
                delete next[`port_flow_${k}`];
                return next;
              });
              if (!Number.isFinite(numeric) || numeric < 0) {
                notify('Port flow must be zero or positive. Choose supply or draw for the direction.', 'warning');
                return;
              }
              const flows = Array.from({ length: nPorts }, (_, j) => portFlows[j] ?? Number(effectiveData.set_flow_lmin ?? 50.0));
              flows[k] = numeric;
              onUpdate(id, { port_flows_lmin: flows });
            };
            return (
              <>
                {!isDraw && telemetry?.pressure_cap_reached && (
                  <div role="alert" style={alertStyle}>
                    Discharge pressure limit reached: the delivered flow is below the set flow. Raise the max. discharge pressure or check for a blocked outlet path.
                  </div>
                )}
                {isDraw && telemetry?.suction_limit_reached && (
                  <div role="alert" style={alertStyle}>
                    Suction limit reached: drawn flow below set flow. Lower the min. suction pressure or check for a blocked path to the boundary.
                  </div>
                )}
                <div>
                  <label htmlFor={`flow-direction-${id}`} style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)' }}>Direction</label>
                  <select
                    id={`flow-direction-${id}`}
                    className="form-input" style={{ width: '100%' }}
                    value={isDraw ? 'draw' : 'supply'}
                    onChange={(e) => onUpdate(id, { flow_direction: e.target.value })}
                  >
                    <option value="supply">Supply (flow into the network)</option>
                    <option value="draw">Draw (flow out of the network)</option>
                  </select>
                </div>

                {!perPort && (
                <div>
                  {renderLabel(`Set Flow (${labels.flow})`, 'set_flow_lmin')}
                  <input
                    type="number"
                    min="0"
                    className="form-input" style={{ width: '100%' }}
                    step={isImperial ? "0.1" : "1"}
                    value={localDrafts.set_flow_lmin !== undefined
                      ? localDrafts.set_flow_lmin
                      : toDisplayValue('set_flow_lmin', effectiveData.set_flow_lmin ?? 50.0)}
                    onChange={(e) => handleDraftChange('set_flow_lmin', e.target.value)}
                    onBlur={(e) => validateAndCommit('set_flow_lmin', e.target.value, true)}
                  />
                  <p style={hintStyle}>Magnitude, zero or more; 0 stops the boundary.</p>
                </div>
                )}

                {nPorts > 1 && (
                  <div>
                    <label htmlFor={`flow-split-${id}`} style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)' }}>Flow split</label>
                    <select
                      id={`flow-split-${id}`}
                      className="form-input" style={{ width: '100%', minWidth: 0, textOverflow: 'ellipsis' }}
                      title={FLOW_SPLIT_OPTIONS.find(([v]) => v === flowSplit)?.[1]}
                      value={flowSplit}
                      onChange={(e) => {
                        const next = e.target.value;
                        if (next === 'per_port') {
                          const base = Number(effectiveData.set_flow_lmin ?? 50.0);
                          const flows = Array.from({ length: nPorts }, (_, k) => portFlows[k] ?? base);
                          onUpdate(id, { flow_split: next, port_flows_lmin: flows });
                        } else {
                          onUpdate(id, { flow_split: next });
                        }
                      }}
                    >
                      {FLOW_SPLIT_OPTIONS.map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                )}

                {perPort && (
                  <div>
                    <label style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)' }}>
                      {`Flow per port (${labels.flow})`}
                    </label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '2px' }}>
                      {Array.from({ length: nPorts }, (_, k) => {
                        const draftKey = `port_flow_${k}`;
                        const stored = portFlows[k] ?? Number(effectiveData.set_flow_lmin ?? 50.0);
                        const connected = connectedPorts.has(k);
                        return (
                          <div key={k} style={{ opacity: connected ? 1 : 0.6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <label htmlFor={`port-flow-${id}-${k}`} style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', width: '48px', flexShrink: 0 }}>{portNumberLabel(k)}</label>
                              <input
                                id={`port-flow-${id}-${k}`}
                                type="number"
                                min="0"
                                className="form-input" style={{ flex: 1, minWidth: 0 }}
                                step={isImperial ? "0.1" : "1"}
                                value={localDrafts[draftKey] !== undefined
                                  ? localDrafts[draftKey]
                                  : toDisplayValue('set_flow_lmin', stored)}
                                onChange={(e) => handleDraftChange(draftKey, e.target.value)}
                                onBlur={(e) => commitPortFlow(k, e.target.value)}
                              />
                            </div>
                            {!connected && <p style={{ ...hintStyle, margin: '2px 0 0 56px' }}>not connected</p>}
                          </div>
                        );
                      })}
                    </div>
                    <p style={hintStyle}>
                      {`Total (connected ports): ${formatFlow(portFlowTotal)} ${labels.flow}`}
                    </p>
                  </div>
                )}

                {!isDraw && (
                  <div>
                    {renderLabel(`Max. Discharge Pressure (${pressureUnit})`, 'max_discharge_pressure_bara')}
                    <input
                      type="number"
                      className="form-input" style={{ width: '100%' }}
                      step="1"
                      value={pressureValue('max_discharge_pressure_bara', 50.0)}
                      onChange={(e) => handleDraftChange('max_discharge_pressure_bara', e.target.value)}
                      onBlur={(e) => validateAndCommit('max_discharge_pressure_bara', e.target.value, true)}
                    />
                    <p style={hintStyle}>Above this outlet pressure the delivered flow drops below the set flow.</p>
                  </div>
                )}

                {isDraw && (
                  <div>
                    {renderLabel(`Min. Suction Pressure (${pressureUnit})`, 'min_suction_pressure_bara')}
                    <input
                      type="number"
                      min="0"
                      className="form-input" style={{ width: '100%' }}
                      step="0.1"
                      value={pressureValue('min_suction_pressure_bara', 0.0)}
                      onChange={(e) => handleDraftChange('min_suction_pressure_bara', e.target.value)}
                      onBlur={(e) => validateAndCommit('min_suction_pressure_bara', e.target.value, true)}
                    />
                    <p style={hintStyle}>Below this pressure at the boundary the drawn flow drops below the set flow.</p>
                  </div>
                )}

                {!isDraw && (
                  <div>
                    {renderLabel(`Injected Temp (${isImperial ? '°F' : '°C'})`, 'temperature_k')}
                    <input
                      type="number"
                      className="form-input" style={{ width: '100%' }}
                      step="0.1"
                      value={localDrafts.temperature_k !== undefined
                        ? localDrafts.temperature_k
                        : Number(toDisplayValue('temperature_k', effectiveData.temperature_k ?? 293.15)).toFixed(1)}
                      onChange={(e) => handleDraftChange('temperature_k', e.target.value)}
                      onBlur={(e) => validateAndCommit('temperature_k', e.target.value)}
                    />
                  </div>
                )}
              </>
            );
          })()}

          {isNode && RELIEF_DRIVER_TYPES.includes(type) && !(type === 'flow_boundary' && effectiveData.flow_direction === 'draw') && (
            <div>
              {renderLabel('Ramp during relief analysis', 'relief_ramp_enabled')}
              <select
                className="form-select"
                style={{ width: '100%', height: '32px', fontSize: 'var(--fs-xs)' }}
                value={effectiveData.relief_ramp_enabled !== false ? 'true' : 'false'}
                onChange={(e) => onUpdate(id, { relief_ramp_enabled: e.target.value === 'true' })}
              >
                <option value="true">Ramp (drives the relief scenario)</option>
                <option value="false">Hold at set value</option>
              </select>
              <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>
                The relief analysis ramps every enabled driver from rest to its set value to find the state at which each relief device opens. Hold receivers, such as a downstream header, at their set value.
              </p>
            </div>
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
              {type === 'remote_control_valve' && renderValveStyle()}
              <div>
                <label style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)' }}>Regulation mode</label>
                <select 
                  style={{ width: '100%', fontSize: 'var(--fs-sm)', padding: '4px' }} 
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
                {renderLabel(`Set Point (${labels.pressureAbs})`, 'set_pressure_pa')}
                <input 
                  type="number" 
                  className="form-input" style={{ width: '100%' }} 
                  step="0.1" 
                  value={localDrafts.set_pressure_pa !== undefined ? localDrafts.set_pressure_pa : toDisplayValue('set_pressure_pa', effectiveData.set_pressure_pa ?? 100000)} 
                  onChange={(e) => handleDraftChange('set_pressure_pa', e.target.value)}
                  onBlur={(e) => {
                    if (isNaN(parseFloat(e.target.value))) return;
                    validateAndCommit('set_pressure_pa', e.target.value);
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
              {renderValveStyle()}
              <div>
                {renderLabel(`Set Temperature (${isImperial ? '°F' : '°C'})`, 'set_temperature_c')}
                <input 
                  type="number" 
                  className="form-input" style={{ width: '100%' }} 
                  step="0.1" 
                  value={localDrafts.set_temperature_c !== undefined ? localDrafts.set_temperature_c : (isImperial ? (Number(effectiveData.set_temperature_c ?? 40.0) * 1.8 + 32).toFixed(1) : (effectiveData.set_temperature_c ?? 40.0))} 
                  onChange={(e) => handleDraftChange('set_temperature_c', e.target.value)}
                  onBlur={(e) => validateAndCommit('set_temperature_c', e.target.value)}
                />
              </div>
              <div>
                <label style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)' }}>Hot port selection</label>
                <select 
                  style={{ width: '100%', fontSize: 'var(--fs-sm)', padding: '4px' }} 
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
              {renderValveStyle()}
              <div>
                {renderLabel('Opening (%)', 'opening_pct')}
                <input 
                  type="number" 
                  className="form-input" style={{ width: '100%' }} 
                  min="0" max="100" step="0.1" 
                  value={localDrafts.opening_pct !== undefined ? localDrafts.opening_pct : (effectiveData.opening_pct ?? 50.0)} 
                  onChange={(e) => {
                    handleDraftChange('opening_pct', e.target.value);
                    const val = parseFloat(e.target.value);
                    if (data.onChange && !isNaN(val)) data.onChange(val, id);
                  }}
                  onBlur={(e) => validateAndCommit('opening_pct', e.target.value, true)}
                />
              </div>
            </>
          )}

          {isNode && (type === 'pressure_safety_valve' || type === 'psv') && (
            <>
              <div>
                {renderLabel(`Set Pressure (${gaugeLabel})`, 'set_pressure_barg')}
                <input
                  type="number" step="0.1" min="0.01"
                  className="form-input" style={{ width: '100%' }}
                  placeholder={effectiveData.set_pressure_barg ? undefined : 'Enter set pressure (gauge)'}
                  value={localDrafts.set_pressure_barg !== undefined ? localDrafts.set_pressure_barg : (effectiveData.set_pressure_barg ? toDisplayValue('set_pressure_barg', effectiveData.set_pressure_barg) : '')}
                  onChange={(e) => handleDraftChange('set_pressure_barg', e.target.value)}
                  onBlur={(e) => { if (e.target.value !== '' || effectiveData.set_pressure_barg) validateAndCommit('set_pressure_barg', e.target.value, true); }}
                />
                {!effectiveData.set_pressure_barg ? (
                  <div role="alert" style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', marginTop: '6px', padding: '6px 8px', borderRadius: '6px', backgroundColor: '#FEF3C7', border: '1px solid #FCD34D', fontSize: 'var(--fs-xs)', color: 'var(--color-warning-text-strong)' }}>
                    <WarningIcon size={12} color="var(--color-warning-text-strong)" style={{ flexShrink: 0, marginTop: '1px' }} />
                    <span>
                      Set Pressure ({gaugeLabel}) missing. Relief devices are set in gauge pressure since v0.2; this device{effectiveData.set_pressure_bar ? ` had ${effectiveData.set_pressure_bar} bar a` : ''}. Enter the set pressure from the datasheet; the simulation will not run until then.
                    </span>
                  </div>
                ) : (
                  <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>
                    Opens when the inlet gauge pressure reaches the set pressure; rated capacity at 10 % overpressure.
                  </p>
                )}
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
                {renderLabel('Valve Type', 'valve_type')}
                <select
                  style={{ width: '100%', fontSize: 'var(--fs-sm)', padding: '4px' }}
                  value={psvValveType}
                  onChange={(e) => onUpdate(id, { valve_type: e.target.value })}
                >
                  <option value="conventional">Conventional (spring)</option>
                  <option value="balanced_bellows">Balanced bellows</option>
                  <option value="pilot">Pilot-operated</option>
                </select>
                <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>
                  {psvValveType === 'conventional' && 'Opens on inlet minus outlet pressure: backpressure shifts the opening and reduces the lift. Built-up backpressure limit 10 % of set.'}
                  {psvValveType === 'balanced_bellows' && 'Opens on inlet gauge pressure, independent of backpressure. Backpressure limit 50 % of set.'}
                  {psvValveType === 'pilot' && (psvPilotSource
                    ? `Pilot senses ${psvPilotSource.data?.label || psvPilotSource.id} through its pilot line.`
                    : 'Pilot senses the valve inlet. To sense elsewhere, drag a signal line from a sensing pin or tap to the pilot connection on top of the valve.')}
                </p>
              </div>
              {psvValveType === 'conventional' && (
                <div>
                  {renderLabel(`Design Superimposed Backpressure (${gaugeLabel})`, 'design_superimposed_bp_barg')}
                  <input
                    type="number" step="0.1" min="0"
                    className="form-input" style={{ width: '100%' }}
                    value={localDrafts.design_superimposed_bp_barg !== undefined ? localDrafts.design_superimposed_bp_barg : toDisplayValue('design_superimposed_bp_barg', effectiveData.design_superimposed_bp_barg ?? 0)}
                    onChange={(e) => handleDraftChange('design_superimposed_bp_barg', e.target.value)}
                    onBlur={(e) => validateAndCommit('design_superimposed_bp_barg', e.target.value)}
                  />
                  {effectiveData.set_pressure_barg ? (
                    <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>
                      Spring set (CDTP) {formatPressureGauge(Math.max(0.01, Number(effectiveData.set_pressure_barg) - Number(effectiveData.design_superimposed_bp_barg ?? 0)))}: opens at set pressure when the actual backpressure equals this value.
                    </p>
                  ) : null}
                </div>
              )}
              <div>
                {renderLabel('Relief Action Mode', 'action_mode')}
                <select
                  style={{ width: '100%', fontSize: 'var(--fs-sm)', padding: '4px' }}
                  value={psvActionMode}
                  onChange={(e) => onUpdate(id, { action_mode: e.target.value })}
                >
                  <option value="pop_action">Pop action – reseats (blowdown)</option>
                  <option value="pop_latching">Pop action – latching (stays open)</option>
                  <option value="modulating">Modulating (proportional)</option>
                </select>
                {psvActionMode === 'pop_latching' && (
                  <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>
                    Once popped, stays at full lift for the run (no reseat).
                  </p>
                )}
              </div>
              {psvActionMode === 'pop_action' && (
                <div>
                  {renderLabel('Blowdown (% of set)', 'blowdown_pct')}
                  <input 
                    type="number" step="0.5" min="0" max="50"
                    className="form-input" style={{ width: '100%' }} 
                    value={localDrafts.blowdown_pct !== undefined ? localDrafts.blowdown_pct : (effectiveData.blowdown_pct ?? 7.0)} 
                    onChange={(e) => handleDraftChange('blowdown_pct', e.target.value)}
                    onBlur={(e) => validateAndCommit('blowdown_pct', e.target.value)}
                  />
                  {effectiveData.set_pressure_barg ? (
                    <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>
                      {/* blowdown applies to the opening driver: the spring setting (CDTP) of a conventional valve */}
                      Reseats at {formatPressureGauge(Number(effectiveData.set_pressure_barg) - (psvValveType === 'conventional'
                        ? Math.max(0.01, Number(effectiveData.set_pressure_barg) - Number(effectiveData.design_superimposed_bp_barg ?? 0))
                        : Number(effectiveData.set_pressure_barg)) * Number(effectiveData.blowdown_pct ?? 7.0) / 100)}{psvValveType === 'conventional' ? ' at the design backpressure' : ''}. If full lift would drop the inlet below that, the valve cycles between reseat and set; the result shows the average relief load.
                    </p>
                  ) : null}
                </div>
              )}
              <div>
                {renderLabel('Contingency Test Mode', 'forced_state')}
                <select 
                  style={{ width: '100%', fontSize: 'var(--fs-sm)', padding: '4px' }} 
                  value={effectiveData.forced_state || 'auto'} 
                  onChange={(e) => onUpdate(id, { forced_state: e.target.value })}
                >
                  <option value="auto">Auto (Normal Relief)</option>
                  <option value="forced_closed">Forced closed</option>
                  <option value="forced_open">Forced open</option>
                </select>
              </div>
            </>
          )}

          {isNode && type === 'rupture_disc' && (
            <>
              <div>
                {renderLabel(`Burst Pressure (${gaugeLabel})`, 'burst_pressure_barg')}
                <input
                  type="number" step="0.1" min="0.01"
                  className="form-input" style={{ width: '100%' }}
                  placeholder={effectiveData.burst_pressure_barg ? undefined : 'Enter burst pressure (gauge)'}
                  value={localDrafts.burst_pressure_barg !== undefined ? localDrafts.burst_pressure_barg : (effectiveData.burst_pressure_barg ? toDisplayValue('burst_pressure_barg', effectiveData.burst_pressure_barg) : '')}
                  onChange={(e) => handleDraftChange('burst_pressure_barg', e.target.value)}
                  onBlur={(e) => { if (e.target.value !== '' || effectiveData.burst_pressure_barg) validateAndCommit('burst_pressure_barg', e.target.value, true); }}
                />
                {!effectiveData.burst_pressure_barg ? (
                  <div role="alert" style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', marginTop: '6px', padding: '6px 8px', borderRadius: '6px', backgroundColor: '#FEF3C7', border: '1px solid #FCD34D', fontSize: 'var(--fs-xs)', color: 'var(--color-warning-text-strong)' }}>
                    <WarningIcon size={12} color="var(--color-warning-text-strong)" style={{ flexShrink: 0, marginTop: '1px' }} />
                    <span>
                      Burst Pressure ({gaugeLabel}) missing. Relief devices are set in gauge pressure since v0.2; this device{effectiveData.burst_pressure_bar ? ` had ${effectiveData.burst_pressure_bar} bar a` : ''}. Enter the burst pressure from the datasheet; the simulation will not run until then.
                    </span>
                  </div>
                ) : (
                  <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>
                    Bursts when the inlet gauge pressure reaches the burst pressure and stays open for the run.
                  </p>
                )}
              </div>
              <div>
                {renderLabel('Bore Configuration', 'bore_type')}
                <select 
                  style={{ width: '100%', fontSize: 'var(--fs-sm)', padding: '4px' }} 
                  value={effectiveData.bore_type || 'full_bore'} 
                  onChange={(e) => onUpdate(id, { bore_type: e.target.value })}
                >
                  <option value="full_bore">Full Bore (Unrestricted)</option>
                  <option value="reduced_bore">Reduced Bore (Orifice Restricted)</option>
                </select>
              </div>
              {effectiveData.bore_type === 'reduced_bore' ? (
                <div>
                  {renderLabel(`Orifice Restriction Diameter (${isImperial ? 'in' : 'mm'})`, 'orifice_diameter_m')}
                  <input 
                    type="number" 
                    className="form-input" style={{ width: '100%' }} 
                    value={localDrafts.orifice_diameter_m !== undefined ? localDrafts.orifice_diameter_m : (isImperial ? mToIn(effectiveData.orifice_diameter_m || 0.01) : mToMm(effectiveData.orifice_diameter_m || 0.01))} 
                    onChange={(e) => handleDraftChange('orifice_diameter_m', e.target.value)}
                    onBlur={(e) => {
                      if (isNaN(parseFloat(e.target.value))) return;
                      validateAndCommit('orifice_diameter_m', e.target.value, true, { toSi: smallLengthToM });
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
                  style={{ width: '100%', fontSize: 'var(--fs-sm)', padding: '4px' }} 
                  value={effectiveData.forced_state || 'auto'} 
                  onChange={(e) => onUpdate(id, { forced_state: e.target.value })}
                >
                  <option value="auto">Auto (Normal Relief)</option>
                  <option value="forced_closed">Forced closed</option>
                  <option value="forced_open">Forced open</option>
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
                {renderLabel(`Cracking ΔP (${isImperial ? 'psi' : 'bar'})`, 'cracking_pressure_bar')}
                <input 
                  type="number" 
                  className="form-input" style={{ width: '100%' }} 
                  step="0.01" min="0"
                  value={localDrafts.cracking_pressure_bar !== undefined ? localDrafts.cracking_pressure_bar : toDisplayValue('cracking_pressure_bar', effectiveData.cracking_pressure_bar ?? 0.05)} 
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
                {renderLabel(`Cracking ΔP (${isImperial ? 'psi' : 'bar'})`, 'cracking_pressure_bar')}
                <input 
                  type="number" 
                  className="form-input" style={{ width: '100%' }} 
                  step="0.01" min="0"
                  value={localDrafts.cracking_pressure_bar !== undefined ? localDrafts.cracking_pressure_bar : toDisplayValue('cracking_pressure_bar', effectiveData.cracking_pressure_bar ?? 0.05)} 
                  onChange={(e) => handleDraftChange('cracking_pressure_bar', e.target.value)}
                  onBlur={(e) => validateAndCommit('cracking_pressure_bar', e.target.value, true)}
                />
              </div>
              <div>
                {renderLabel(`Orifice Diameter (${isImperial ? 'in' : 'mm'})`, 'orifice_diameter_m')}
                <input 
                  type="number" 
                  className="form-input" style={{ width: '100%' }} 
                  value={localDrafts.orifice_diameter_m !== undefined ? localDrafts.orifice_diameter_m : (isImperial ? mToIn(effectiveData.orifice_diameter_m || 0.01) : mToMm(effectiveData.orifice_diameter_m || 0.01))} 
                  onChange={(e) => handleDraftChange('orifice_diameter_m', e.target.value)}
                  onBlur={(e) => {
                    if (isNaN(parseFloat(e.target.value))) return;
                    validateAndCommit('orifice_diameter_m', e.target.value, true, { toSi: smallLengthToM });
                  }}
                />
              </div>
            </>
          )}

          {isNode && type === 'heat_exchanger' && (
            <>
              {node?.data?.telemetry?.rating_status && node.data.telemetry.rating_status !== 'ok' && (
                <div role="alert" style={{ background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: '4px', padding: '8px', fontSize: 'var(--fs-xs)', color: 'var(--color-warning-text-strong)' }}>
                  {node.data.telemetry.rating_status === 'infeasible'
                    ? 'Rating is not achievable: the rated duty needs a larger temperature change than the fluid and medium temperatures allow. The result is limited by the heat balance, not the rating.'
                    : 'Rating needs an effectiveness above 0.95: very large heat transfer area. Check the rated duty and temperatures.'}
                </div>
              )}
              <div>
                {renderLabel('Operating Status', 'active')}
                <select 
                  style={{ width: '100%', fontSize: 'var(--fs-sm)', padding: '4px' }} 
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
                  style={{ width: '100%', fontSize: 'var(--fs-sm)', padding: '4px' }} 
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
                {renderLabel(`Rated Flow (${labels.flow})`, 'rated_flow_lmin')}
                <input 
                  type="number" 
                  className="form-input" style={{ width: '100%' }} 
                  value={localDrafts.rated_flow_lmin !== undefined ? localDrafts.rated_flow_lmin : toDisplayValue('rated_flow_lmin', effectiveData.rated_flow_lmin || 500.0)} 
                  onChange={(e) => handleDraftChange('rated_flow_lmin', e.target.value)}
                  onBlur={(e) => validateAndCommit('rated_flow_lmin', e.target.value, true)}
                />
              </div>
              {(effectiveData.rating_method || "rated_duty") === "rated_duty" && (
                <div>
                  {renderLabel(`Rated Cooling (${isImperial ? 'BTU/h' : 'kW'})`, 'rated_cooling_kw')}
                  <input 
                    type="number" 
                    className="form-input" style={{ width: '100%' }} 
                    value={localDrafts.rated_cooling_kw !== undefined ? localDrafts.rated_cooling_kw : (isImperial ? (Number(effectiveData.rated_cooling_kw ?? 300.0) * 3412.141633).toFixed(0) : (effectiveData.rated_cooling_kw ?? 300.0))} 
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
                    value={localDrafts.design_inlet_temp_c !== undefined ? localDrafts.design_inlet_temp_c : (isImperial ? (Number(effectiveData.design_inlet_temp_c ?? 50.0) * 1.8 + 32).toFixed(1) : (effectiveData.design_inlet_temp_c ?? 50.0))} 
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
                    value={localDrafts.design_outlet_temp_c !== undefined ? localDrafts.design_outlet_temp_c : (isImperial ? (Number(effectiveData.design_outlet_temp_c ?? 40.0) * 1.8 + 32).toFixed(1) : (effectiveData.design_outlet_temp_c ?? 40.0))} 
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
                  style={{ width: '100%', fontSize: 'var(--fs-sm)', padding: '4px' }} 
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
                    value={localDrafts.medium_temp_c !== undefined ? localDrafts.medium_temp_c : (isImperial ? (Number(effectiveData.medium_temp_c ?? 10.0) * 1.8 + 32).toFixed(1) : (effectiveData.medium_temp_c ?? 10.0))} 
                    onChange={(e) => handleDraftChange('medium_temp_c', e.target.value)}
                    onBlur={(e) => validateAndCommit('medium_temp_c', e.target.value)}
                  />
                </div>
              )}
              <div>
                {renderLabel(`Rated ΔP (${isImperial ? 'psi' : 'bar'})`, 'rated_dp_bar')}
                <input 
                  type="number" step="0.01" 
                  className="form-input" style={{ width: '100%' }} 
                  value={localDrafts.rated_dp_bar !== undefined ? localDrafts.rated_dp_bar : toDisplayValue('rated_dp_bar', effectiveData.rated_dp_bar ?? 0.5)} 
                  onChange={(e) => handleDraftChange('rated_dp_bar', e.target.value)}
                  onBlur={(e) => validateAndCommit('rated_dp_bar', e.target.value, true)}
                />
              </div>
            </>
          )}

          {isNode && type === 'filter' && (
            <>
              <div>
                {renderLabel(`Clean ΔP (${isImperial ? 'psi' : 'bar'})`, 'dp_clean_bar')}
                <input 
                  type="number" step="0.01" 
                  className="form-input" style={{ width: '100%' }} 
                  value={localDrafts.dp_clean_bar !== undefined ? localDrafts.dp_clean_bar : toDisplayValue('dp_clean_bar', effectiveData.dp_clean_bar || 0.2)} 
                  onChange={(e) => handleDraftChange('dp_clean_bar', e.target.value)}
                  onBlur={(e) => validateAndCommit('dp_clean_bar', e.target.value, true)}
                />
              </div>
              <div>
                {renderLabel(`Terminal ΔP (${isImperial ? 'psi' : 'bar'})`, 'dp_terminal_bar')}
                <input 
                  type="number" step="0.1" 
                  className="form-input" style={{ width: '100%' }} 
                  value={localDrafts.dp_terminal_bar !== undefined ? localDrafts.dp_terminal_bar : toDisplayValue('dp_terminal_bar', effectiveData.dp_terminal_bar || 1.0)} 
                  onChange={(e) => handleDraftChange('dp_terminal_bar', e.target.value)}
                  onBlur={(e) => validateAndCommit('dp_terminal_bar', e.target.value, true)}
                />
              </div>
              <div>
                {renderLabel(`Rated Flow (${labels.flow})`, 'flow_ref_lmin')}
                <input 
                  type="number" 
                  className="form-input" style={{ width: '100%' }} 
                  value={localDrafts.flow_ref_lmin !== undefined ? localDrafts.flow_ref_lmin : toDisplayValue('flow_ref_lmin', effectiveData.flow_ref_lmin || 100.0)} 
                  onChange={(e) => handleDraftChange('flow_ref_lmin', e.target.value)}
                  onBlur={(e) => validateAndCommit('flow_ref_lmin', e.target.value, true)}
                />
              </div>
              <div>
                {renderLabel('Clogging Level (%)', 'clogging_pct')}
                <input 
                  type="number" 
                  className="form-input" style={{ width: '100%' }} 
                  value={localDrafts.clogging_pct !== undefined ? localDrafts.clogging_pct : (effectiveData.clogging_pct ?? 0.0)} 
                  onChange={(e) => handleDraftChange('clogging_pct', e.target.value)}
                  onBlur={(e) => validateAndCommit('clogging_pct', e.target.value)}
                />
              </div>
              <div>
                {renderLabel('Reference viscosity (mPa·s, 0 = auto)', 'ref_viscosity_mpas')}
                <input 
                  type="number" min="0" step="1" placeholder="auto"
                  className="form-input" style={{ width: '100%' }} 
                  title="Viscosity of the fluid the datasheet ΔP refers to. Auto: system fluid at 40 °C (oils, fuels) or 20 °C (aqueous)."
                  value={localDrafts.ref_viscosity_mpas !== undefined ? localDrafts.ref_viscosity_mpas : (effectiveData.ref_viscosity_mpas || '')} 
                  onChange={(e) => handleDraftChange('ref_viscosity_mpas', e.target.value)}
                  onBlur={(e) => validateAndCommit('ref_viscosity_mpas', e.target.value)}
                />
              </div>
            </>
          )}

          {isNode && type === 'orifice' && (() => {
            const telemetryPipeD = node?.data?.telemetry?.pipe_diameter;
            const activePipeD = telemetryPipeD ?? effectiveData.pipe_diameter_m ?? 0.05248;
            const activePipeDmm = (activePipeD * 1000).toFixed(2);
            const activePipeDin = mToIn(activePipeD);
            const isTelemetryPipe = telemetryPipeD != null;

            const _orifDm = effectiveData.orifice_diameter_m || 0.07;
            const _beta = _orifDm / activePipeD;
            const _standard = effectiveData.standard || 'iso_5167';

            return (
              <>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                    <label style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)' }}>Connected pipe diameter ({isImperial ? 'in' : 'mm'})</label>
                    {isTelemetryPipe && (
                      <span style={{ fontSize: 'var(--fs-xs)', color: '#395253', background: '#EBF0EF', border: '1px solid #D8E2E1', borderRadius: '3px', padding: '1px 5px', fontWeight: '600' }}>
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
                    fontSize: 'var(--fs-sm)',
                    color: isTelemetryPipe ? '#1C2B2C' : 'var(--color-text-muted)',
                    fontFamily: 'var(--font-mono, monospace)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    boxSizing: 'border-box',
                  }}>
                    <span>{isImperial ? `${activePipeDin} in` : `${activePipeDmm} mm`}</span>
                    {!isTelemetryPipe && (
                      <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-muted)', fontFamily: 'inherit' }}>no pipe connected</span>
                    )}
                  </div>
                  <div style={{ fontSize: 'var(--fs-xs)', color: '#587071', marginTop: '3px' }}>
                    Auto-detected from the inlet pipe edge. Run simulation to update.
                  </div>
                </div>

                <div>
                  {renderLabel(`Orifice Restriction Diameter (${isImperial ? 'in' : 'mm'})`, 'orifice_diameter_m')}
                  <input 
                    type="number" 
                    className="form-input" style={{ width: '100%' }} 
                    value={localDrafts.orifice_diameter_m !== undefined ? localDrafts.orifice_diameter_m : (isImperial ? mToIn(effectiveData.orifice_diameter_m || 0.07) : mToMm(effectiveData.orifice_diameter_m || 0.07))} 
                    onChange={(e) => handleDraftChange('orifice_diameter_m', e.target.value)}
                    onBlur={(e) => {
                      if (isNaN(parseFloat(e.target.value))) return;
                      validateAndCommit('orifice_diameter_m', e.target.value, true, { toSi: smallLengthToM });
                    }}
                  />
                  {_standard === 'iso_5167' && _beta > 0.75 && (
                    <div style={{
                      marginTop: '5px',
                      padding: '5px 8px',
                      borderRadius: '4px',
                      background: 'var(--color-warning-bg)',
                      border: '1px solid #FCD34D',
                      fontSize: 'var(--fs-xs)',
                      color: 'var(--color-warning-text-strong)',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '5px',
                    }}>
                      <WarningIcon size={12} style={{ marginTop: '1px' }} />
                      <span>
                        <strong>β = {_beta.toFixed(3)}</strong> — outside ISO 5167&#8209;2 range [0.10–0.75]. Results are extrapolated.
                      </span>
                    </div>
                  )}
                </div>

                <div>
                  {renderLabel('Standard', 'standard')}
                  <select 
                    style={{ width: '100%', fontSize: 'var(--fs-sm)', padding: '4px' }} 
                    value={_standard} 
                    onChange={(e) => onUpdate(id, { standard: e.target.value })}
                    title="ISO 5167-2:2022 (Reader-Harris/Gallagher) or the legacy classic Cd model."
                  >
                    <option value="iso_5167" title="ISO 5167-2:2022 Reader-Harris/Gallagher discharge coefficient with §5.4 Formula (7) permanent pressure loss.">ISO 5167 (Reader-Harris/Gallagher)</option>
                    <option value="classic_cd" title="Legacy Reynolds-corrected discharge coefficient model.">Classic Cd (legacy)</option>
                  </select>
                  <div style={{ fontSize: 'var(--fs-xs)', color: '#587071', marginTop: '4px', background: '#f4f7f6', padding: '6px', borderRadius: '4px', border: '1px solid #d8e2e1' }}>
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
                  style={{ width: '100%', fontSize: 'var(--fs-sm)', padding: '4px' }} 
                  value={effectiveData.restriction_model || 'orifice'} 
                  onChange={(e) => onUpdate(id, { restriction_model: e.target.value })}
                  title="Orifice (Turbulent with Re-dependent Cd), Laminar (dP proportional to viscosity & flow), or Quadratic (fixed K-factor)"
                >
                  <option value="orifice" title="Turbulent orifice flow. Calculates equivalent plate diameter.">Orifice Model (Re corrected)</option>
                  <option value="laminar" title="Capillary/bearing clearance flow. dP scales with viscosity and flow rate.">Laminar/Linear Model</option>
                  <option value="quadratic" title="Fixed K-factor flow resistance. dP scales with density and flow squared.">Simple Quadratic Model</option>
                </select>
                <div style={{ fontSize: 'var(--fs-xs)', color: '#587071', marginTop: '4px', background: '#f4f7f6', padding: '6px', borderRadius: '4px', border: '1px solid #d8e2e1' }}>
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
                  style={{ width: '100%', fontSize: 'var(--fs-sm)', padding: '4px' }} 
                  value={effectiveData.fluid_type || 'system'} 
                  onChange={(e) => onUpdate(id, { fluid_type: e.target.value })}
                  title="Fluid used to look up density & viscosity at baseline calibration temperature."
                >
                  <option value="system">System Fluid (Dynamic)</option>
                  {FLUID_CATEGORIES.map((category) => (
                    <optgroup key={category} label={category}>
                      {FLUID_LIBRARY.filter((f) => f.category === category).map((f) => (
                        <option key={f.id} value={f.id}>{f.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div>
                {renderLabel(`Baseline Flow (${labels.flow})`, 'flow_base_lmin')}
                <input 
                  type="number" 
                  step="0.1"
                  className="form-input" style={{ width: '100%' }} 
                  value={localDrafts.flow_base_lmin !== undefined ? localDrafts.flow_base_lmin : toDisplayValue('flow_base_lmin', effectiveData.flow_base_lmin || 10.0)} 
                  onChange={(e) => handleDraftChange('flow_base_lmin', e.target.value)}
                  onBlur={(e) => validateAndCommit('flow_base_lmin', e.target.value, true)}
                />
              </div>
              <div>
                {renderLabel(`Baseline Inlet Pressure (${labels.pressureAbs})`, 'inlet_pressure_base_bara')}
                <input 
                  type="number" 
                  step="0.05"
                  className="form-input" style={{ width: '100%' }} 
                  value={localDrafts.inlet_pressure_base_bara !== undefined ? localDrafts.inlet_pressure_base_bara : toDisplayValue('inlet_pressure_base_bara', effectiveData.inlet_pressure_base_bara || 3.5)} 
                  onChange={(e) => handleDraftChange('inlet_pressure_base_bara', e.target.value)}
                  onBlur={(e) => validateAndCommit('inlet_pressure_base_bara', e.target.value, true)}
                />
              </div>
              <div>
                {renderLabel(`Baseline Outlet Pressure (${labels.pressureAbs})`, 'outlet_pressure_base_bara')}
                <input 
                  type="number" 
                  step="0.05"
                  className="form-input" style={{ width: '100%' }} 
                  value={localDrafts.outlet_pressure_base_bara !== undefined ? localDrafts.outlet_pressure_base_bara : toDisplayValue('outlet_pressure_base_bara', effectiveData.outlet_pressure_base_bara || 1.0)} 
                  onChange={(e) => handleDraftChange('outlet_pressure_base_bara', e.target.value)}
                  onBlur={(e) => validateAndCommit('outlet_pressure_base_bara', e.target.value, true)}
                />
              </div>
              <div>
                {renderLabel(`Baseline Temp (${isImperial ? '°F' : '°C'})`, 'temp_base_c')}
                <input 
                  type="number" 
                  step="0.5"
                  className="form-input" style={{ width: '100%' }} 
                  value={localDrafts.temp_base_c !== undefined ? localDrafts.temp_base_c : (isImperial ? (Number(effectiveData.temp_base_c ?? 45.0) * 1.8 + 32).toFixed(1) : (effectiveData.temp_base_c ?? 45.0))} 
                  onChange={(e) => handleDraftChange('temp_base_c', e.target.value)}
                  onBlur={(e) => validateAndCommit('temp_base_c', e.target.value, true)}
                />
              </div>
            </>
          )}

          {isNode && (type === 'reducer' || type === 'expander') && <ReducerSetup ctx={{ allEdges, availablePipeClasses, effectiveData, handleDraftChange, id, isImperial, localDrafts, onUpdate, reducerNotice, reducerStandards, scheduleStandards, renderLabel, setReducerNotice, smallLengthToM, validateAndCommit }} />}

          {isNode && type === 'instrument' && (
            <InstrumentSetup id={id} data={data} allNodes={allNodes} allEdges={allEdges} isImperial={isImperial} onUpdate={onUpdate} />
          )}

          {isNode && type === 'text_bubble' && (
            <>
              <div>
                <label style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)' }}>Title</label>
                <input 
                  className="form-input" style={{ width: '100%' }} 
                  value={localDrafts.title !== undefined ? localDrafts.title : (data.title || 'NOTE')} 
                  onChange={(e) => handleDraftChange('title', e.target.value)}
                  onBlur={(e) => validateAndCommit('title', e.target.value)}
                />
              </div>
              <div>
                <label style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)' }}>Note content</label>
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
                <label style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)' }}>Font size</label>
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
