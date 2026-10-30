import React, { useState } from 'react';
import { useUnits } from '../../context/UnitContext';
import { mToIn } from '../../utils/converters';
import { resolvePipeSelection, findPipeClass, matchScheduleByInnerDiameter, manualSelectionPatch, classSelectionPatch, classSizePatch, schedulePatch } from '../../utils/pipeDefaults';
import { getScheduleStandardOptions, getScheduleStandardName, getScheduleDataset, getScheduleBore, listSchedules, scheduleLabel, classScheduleCodes, classReducerCodes } from '../../utils/pipe_schedules';
import { formatDnOption, normalizeReducerStandard, getReducerStandardOptions } from '../../utils/reducer_catalog';
import { useFittingStandards } from '../../hooks/useFittingStandards';
import DraftNumberInput from '../common/DraftNumberInput';

/**
 * PipeSelector: pick a pipe class and size, or manual dimensions from the pipe schedule catalogs
 * (ASME B36.10M / B36.19M, DIN EN 10220 / EN ISO 1127), all read from the fitting catalog API.
 * Emits SI values (diameter_m in m, roughness_mm in mm).
 */
const PipeSelector = ({ data, onChange, availablePipeClasses = [], allowCustomPipes = true }) => {
  const { isImperial, gaugeLabel } = useUnits();
  const classList = availablePipeClasses || [];
  const scheduleOptions = getScheduleStandardOptions(useFittingStandards('pipe_schedule'));
  const reducerOptions = getReducerStandardOptions(useFittingStandards('reducer'));

  // Pipes without a class reference (older files) show as Manual; display never rewrites data
  const selection = resolvePipeSelection(data, scheduleOptions);
  const currentClassId = selection.classId;
  const isManual = currentClassId === 'manual';
  const selectedClass = findPipeClass(classList, currentClassId);
  // A class the pipe refers to that is not in the catalogue (or not allowed in this project)
  const isUnknownClass = !isManual && !selectedClass;

  const [manualMode, setManualMode] = useState(selection.isCustomId ? 'free' : 'preset'); // 'preset' | 'free'

  const value = data.diameter_m || 0;
  const currentDn = selection.dn;
  const currentSch = selection.sch || 'STD';
  const scheduleStandard = selection.scheduleStandard;
  const scheduleDataset = getScheduleDataset(scheduleStandard, scheduleOptions);
  const currentSchedules = listSchedules(currentDn, scheduleStandard, scheduleOptions);

  const handleClassChange = (newClassId) => {
    const patch = newClassId === 'manual'
      ? (manualSelectionPatch(currentDn, currentSch, scheduleStandard, scheduleOptions) || { pipe_class_id: 'manual', pipe_class_code: 'CUSTOM' })
      : classSelectionPatch(findPipeClass(classList, newClassId), currentDn);
    if (patch) onChange(patch);
  };

  const handleSpecSizeChange = (newDnStr) => {
    const patch = classSizePatch(selectedClass, parseInt(newDnStr, 10));
    if (patch) onChange(patch);
  };

  const handleManualPresetChange = (newDn, newSch) => {
    const patch = schedulePatch(Number(newDn !== undefined ? newDn : currentDn), newSch !== undefined ? newSch : currentSch, scheduleStandard, scheduleOptions);
    if (patch) onChange(patch);
  };

  // Another dimension standard: same DN (or nearest) and the counterpart schedule (STD ↔ Normal, XS ↔ Heavy)
  const handleScheduleStandardChange = (newCode) => {
    const patch = manualSelectionPatch(currentDn, currentSch, newCode, scheduleOptions);
    if (patch) onChange(patch);
  };

  const reducerStandardName = (code) => reducerOptions.find(o => o.code === normalizeReducerStandard(code))?.name || code;

  // Dimensions & Area calculation
  const currentOdMm = data.outer_diameter_mm || (value * 1000 * 1.15);
  const currentWtMm = data.wall_thickness_mm || ((currentOdMm - value * 1000) / 2);
  const flowAreaCm2 = (Math.PI / 4) * Math.pow(value * 100, 2);
  const flowAreaIn2 = flowAreaCm2 * 0.15500031;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Pipe Class Selection */}
      <div>
        <label style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', fontWeight: '600' }}>Pipe class</label>
        <select
          className="form-select"
          style={{ width: '100%', height: '32px', fontSize: 'var(--fs-xs)' }}
          value={selectedClass ? selectedClass.id : currentClassId}
          onChange={(e) => handleClassChange(e.target.value)}
        >
          {classList.map(c => (
            <option key={c.id} value={c.id}>
              [{c.code}] {c.name}
            </option>
          ))}
          {isUnknownClass && (
            <option value={currentClassId} disabled>
              [{data.pipe_class_code || currentClassId}] not in catalogue
            </option>
          )}
          {(allowCustomPipes || isManual) && (
            <option value="manual" disabled={!allowCustomPipes}>
              Manual / Custom Dimensions{allowCustomPipes ? '' : ' (not allowed in this project)'}
            </option>
          )}
        </select>
      </div>

      {/* Selected Project Pipe Class Mode */}
      {!isManual && selectedClass && (
        <>
          <div>
            <label style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', fontWeight: '700' }}>Nominal size</label>
            <select
              className="form-select"
              style={{ width: '100%', height: '32px', fontSize: 'var(--fs-xs)' }}
              value={currentDn}
              onChange={(e) => handleSpecSizeChange(e.target.value)}
            >
              {selectedClass.sizes.map(s => (
                <option key={s.dn} value={s.dn}>
                  {formatDnOption(s.dn, s.nps)} - {scheduleLabel(s.sch)}
                </option>
              ))}
            </select>
          </div>

          {/* Enhanced Spec Dimensional Summary Card */}
          <div style={{
            fontSize: 'var(--fs-xs)',
            backgroundColor: 'var(--color-surface-light)',
            padding: '10px 12px',
            borderRadius: '8px',
            border: '1px solid var(--color-border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)', paddingBottom: '4px' }}>
              <span style={{ fontWeight: '700', color: 'var(--color-brand-dark)' }}>
                {formatDnOption(currentDn, selectedClass.sizes.find(s => s.dn === currentDn)?.nps)} • {scheduleLabel(data.standardSch)}
              </span>
              <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)' }}>
                {selectedClass.code}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
              <div>OD: <strong style={{ color: 'var(--color-text-primary)' }}>{isImperial ? `${(currentOdMm / 25.4).toFixed(3)} in` : `${currentOdMm.toFixed(1)} mm`}</strong></div>
              <div>WT: <strong style={{ color: 'var(--color-text-primary)' }}>{isImperial ? `${(currentWtMm / 25.4).toFixed(3)} in` : `${currentWtMm.toFixed(2)} mm`}</strong></div>
              <div>ID: <strong style={{ color: 'var(--color-primary-text)' }}>{isImperial ? `${mToIn(value)} in` : `${(value * 1000).toFixed(2)} mm`}</strong></div>
              <div>Area: <strong style={{ color: 'var(--color-text-primary)' }}>{isImperial ? `${flowAreaIn2.toFixed(2)} in²` : `${flowAreaCm2.toFixed(2)} cm²`}</strong></div>
            </div>
            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
              Mat: <span style={{ color: 'var(--color-text-primary)' }}>{selectedClass.material_grade} (ε={selectedClass.roughness_mm}mm)</span>
            </div>
            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', marginTop: '4px', paddingTop: '4px', borderTop: '1px dashed var(--color-border)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span>Reducers: <strong style={{ color: 'var(--color-brand-dark)' }}>{classReducerCodes(selectedClass).map(reducerStandardName).join(', ')}</strong></span>
              <span>Pipe dimensions: <strong style={{ color: 'var(--color-brand-dark)' }}>{classScheduleCodes(selectedClass).map(c => getScheduleStandardName(c, scheduleOptions)).join(', ')}</strong></span>
            </div>
          </div>
        </>
      )}


      {/* Spec missing from the catalogue / project: show the stored dimensions, sizes cannot be chosen */}
      {isUnknownClass && (
        <>
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-warning-text)' }}>
            Pipe class "{data.pipe_class_code || currentClassId}" is not available in the catalogue or this project. Showing the stored dimensions; choose another pipe class to change the size.
          </div>
          <div style={{
            fontSize: 'var(--fs-xs)',
            backgroundColor: 'var(--color-surface-light)',
            padding: '8px 10px',
            borderRadius: '8px',
            border: '1px solid var(--color-border)',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '4px',
            color: 'var(--color-text-secondary)'
          }}>
            <div>Size: <strong style={{ color: 'var(--color-text-primary)' }}>{formatDnOption(currentDn)} • {scheduleLabel(data.standardSch)}</strong></div>
            <div>OD: <strong style={{ color: 'var(--color-text-primary)' }}>{isImperial ? `${(currentOdMm / 25.4).toFixed(3)} in` : `${currentOdMm.toFixed(1)} mm`}</strong></div>
            <div>WT: <strong style={{ color: 'var(--color-text-primary)' }}>{isImperial ? `${(currentWtMm / 25.4).toFixed(3)} in` : `${currentWtMm.toFixed(2)} mm`}</strong></div>
            <div>ID: <strong style={{ color: 'var(--color-primary-text)' }}>{isImperial ? `${mToIn(value)} in` : `${(value * 1000).toFixed(2)} mm`}</strong></div>
            <div>Area: <strong style={{ color: 'var(--color-text-primary)' }}>{isImperial ? `${flowAreaIn2.toFixed(2)} in²` : `${flowAreaCm2.toFixed(2)} cm²`}</strong></div>
          </div>
        </>
      )}


      {/* Manual / Custom Sizing Mode */}
      {isManual && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* Sizing Mode Toggle */}
          <div style={{ display: 'flex', gap: '4px', backgroundColor: 'var(--color-surface-light)', padding: '2px', borderRadius: '6px', border: '1px solid var(--color-border)' }}>
            <button
              type="button"
              onClick={() => setManualMode('preset')}
              style={{
                flex: 1,
                padding: '4px 6px',
                fontSize: 'var(--fs-xs)',
                fontWeight: '700',
                borderRadius: '4px',
                border: 'none',
                backgroundColor: manualMode === 'preset' ? 'var(--color-brand-dark)' : 'transparent',
                color: manualMode === 'preset' ? '#FFFFFF' : 'var(--color-text-secondary)',
                cursor: 'pointer'
              }}
            >
              Schedule Presets
            </button>
            <button
              type="button"
              onClick={() => setManualMode('free')}
              style={{
                flex: 1,
                padding: '4px 6px',
                fontSize: 'var(--fs-xs)',
                fontWeight: '700',
                borderRadius: '4px',
                border: 'none',
                backgroundColor: manualMode === 'free' ? 'var(--color-brand-dark)' : 'transparent',
                color: manualMode === 'free' ? '#FFFFFF' : 'var(--color-text-secondary)',
                cursor: 'pointer'
              }}
            >
              Free Dimensions
            </button>
          </div>

          {manualMode === 'preset' && scheduleOptions.length === 0 ? (
            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-warning-text)' }}>
              Pipe schedule catalog not loaded. Use Free Dimensions, or check the connection to the server.
            </div>
          ) : manualMode === 'preset' ? (
            <>
              {/* Dimension Standard */}
              <div>
                <label style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', fontWeight: '700' }}>Dimension standard</label>
                <select
                  className="form-select"
                  style={{ width: '100%', height: '30px', fontSize: 'var(--fs-xs)' }}
                  value={scheduleStandard}
                  onChange={(e) => handleScheduleStandardChange(e.target.value)}
                >
                  {scheduleOptions.map(o => (
                    <option key={o.code} value={o.code}>{o.name}</option>
                  ))}
                </select>
              </div>

              {/* Preset Selectors */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '6px' }}>
                <div>
                  <label style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', fontWeight: '700' }}>Nominal size</label>
                  <select
                    className="form-select"
                    style={{ width: '100%', height: '30px', fontSize: 'var(--fs-xs)' }}
                    value={currentDn}
                    onChange={(e) => handleManualPresetChange(e.target.value, currentSch)}
                  >
                    {scheduleDataset.map(s => (
                      <option key={s.dn} value={s.dn}>
                        {formatDnOption(s.dn, s.nps)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', fontWeight: '700' }}>Schedule</label>
                  <select
                    className="form-select"
                    style={{ width: '100%', height: '30px', fontSize: 'var(--fs-xs)' }}
                    value={currentSch}
                    onChange={(e) => handleManualPresetChange(currentDn, e.target.value)}
                  >
                    {(currentSchedules.includes(currentSch) ? currentSchedules : [currentSch, ...currentSchedules]).map(schKey => (
                      <option key={schKey} value={schKey}>
                        {scheduleLabel(schKey)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Quick-Pick Schedule Buttons */}
              <div style={{ display: 'flex', gap: '4px' }}>
                {currentSchedules.map(schKey => {
                  const isCurrent = currentSch === schKey;
                  return (
                    <button
                      key={schKey}
                      type="button"
                      onClick={() => handleManualPresetChange(currentDn, schKey)}
                      style={{
                        flex: 1,
                        padding: '2px 4px',
                        fontSize: 'var(--fs-xs)',
                        fontWeight: '700',
                        borderRadius: '4px',
                        border: isCurrent ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                        backgroundColor: isCurrent ? 'rgba(250, 133, 7, 0.12)' : 'var(--color-surface-light)',
                        color: isCurrent ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                        cursor: 'pointer'
                      }}
                    >
                      {scheduleLabel(schKey)}
                    </button>
                  );
                })}
              </div>

              {/* Dimensional Preview Card */}
              <div style={{
                fontSize: 'var(--fs-xs)',
                backgroundColor: 'var(--color-surface-light)',
                padding: '8px 10px',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '4px',
                color: 'var(--color-text-secondary)'
              }}>
                <div>OD: <strong style={{ color: 'var(--color-text-primary)' }}>{isImperial ? `${(currentOdMm / 25.4).toFixed(3)} in` : `${currentOdMm.toFixed(1)} mm`}</strong></div>
                <div>WT: <strong style={{ color: 'var(--color-text-primary)' }}>{isImperial ? `${(currentWtMm / 25.4).toFixed(3)} in` : `${currentWtMm.toFixed(2)} mm`}</strong></div>
                <div>ID: <strong style={{ color: 'var(--color-primary-text)' }}>{isImperial ? `${mToIn(value)} in` : `${(value * 1000).toFixed(2)} mm`}</strong></div>
                <div>Area: <strong style={{ color: 'var(--color-text-primary)' }}>{isImperial ? `${flowAreaIn2.toFixed(2)} in²` : `${flowAreaCm2.toFixed(2)} cm²`}</strong></div>
              </div>
            </>
          ) : (
            /* Free Manual Numeric Inputs */
            <div>
              <label style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', fontWeight: '600' }}>Inner diameter ({isImperial ? 'in' : 'mm'})</label>
              <DraftNumberInput
                step="0.1"
                className="form-input"
                style={{ width: '100%' }}
                displayValue={value > 0 ? (isImperial ? (value * 39.37007874).toFixed(3) : (value * 1000).toFixed(2)) : ''}
                onCommit={(text) => {
                  const raw = parseFloat(text);
                  if (isNaN(raw) || raw <= 0) return; // reverts to the stored value
                  const idM = isImperial ? raw / 39.37007874 : raw / 1000.0;
                  // A free ID keeps DN/schedule/OD/WT only if it equals a schedule of the pipe's dimension standard
                  const match = matchScheduleByInnerDiameter(idM, scheduleStandard, scheduleOptions);
                  const sch = match ? getScheduleBore(match.dn, match.sch, scheduleStandard, scheduleOptions) : null;
                  onChange({
                    diameter_m: idM,
                    standardDn: sch ? sch.dn : null,
                    standardSch: sch ? sch.sch : null,
                    outer_diameter_mm: sch ? sch.od_mm : null,
                    wall_thickness_mm: sch ? sch.wt_mm : null
                  });
                }}
              />
            </div>
          )}

          {/* Roughness & Design Ratings */}
          <div>
            <label style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', fontWeight: '600' }}>Surface roughness ε (mm)</label>
            <input
              type="number"
              step="0.001"
              className="form-input"
              style={{ width: '100%' }}
              value={data.roughness_mm !== undefined ? data.roughness_mm : 0.045}
              onChange={(e) => {
                const raw = parseFloat(e.target.value);
                if (!isNaN(raw) && raw >= 0) {
                  onChange({ roughness_mm: raw });
                }
              }}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            <div>
              <label style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', fontWeight: '600' }}>Design temperature ({isImperial ? '°F' : '°C'})</label>
              <input
                type="number"
                step="0.5"
                className="form-input"
                style={{ width: '100%' }}
                value={
                  data.design_temperature_c !== undefined
                    ? (isImperial ? ((data.design_temperature_c * 1.8) + 32).toFixed(1) : data.design_temperature_c)
                    : ''
                }
                placeholder={isImperial ? '122.0' : '50.0'}
                onChange={(e) => {
                  const raw = parseFloat(e.target.value);
                  if (!isNaN(raw)) {
                    const tempC = isImperial ? (raw - 32) / 1.8 : raw;
                    onChange({ design_temperature_c: tempC });
                  } else {
                    onChange({ design_temperature_c: undefined });
                  }
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', fontWeight: '600' }}>Design pressure ({gaugeLabel})</label>
              <input
                type="number"
                step="0.1"
                className="form-input"
                style={{ width: '100%' }}
                value={
                  data.design_pressure_bar !== undefined
                    ? (isImperial ? (data.design_pressure_bar * 14.50377).toFixed(1) : data.design_pressure_bar)
                    : ''
                }
                placeholder={isImperial ? '150.0' : '10.0'}
                onChange={(e) => {
                  const raw = parseFloat(e.target.value);
                  if (!isNaN(raw)) {
                    const pBar = isImperial ? raw / 14.50377 : raw;
                    onChange({ design_pressure_bar: pBar });
                  } else {
                    onChange({ design_pressure_bar: undefined });
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PipeSelector;
