import React, { useState } from 'react';
import { useUnits } from '../../context/UnitContext';
import { ASME_B36_10M_SCHEDULES, getPipeScheduleDetails } from '../../constants/asme_b16_9_data';
import { resolvePipeSelection, matchScheduleByInnerDiameter, manualSelectionPatch, classSelectionPatch, classSizePatch, schedulePatch } from '../../utils/pipeDefaults';
import DraftNumberInput from '../common/DraftNumberInput';

/**
 * PipeSelector component supporting Pipe Specifications catalog and ASME B36.10M Schedule presets.
 * Emits SI values (diameter in m, roughness_mm in mm).
 */
const PipeSelector = ({ data, onChange, availablePipeClasses = [], allowCustomPipes = true }) => {
  const { isImperial } = useUnits();
  const classList = availablePipeClasses || [];

  // Pipes without a class reference (older files) show as Manual; display never rewrites data
  const selection = resolvePipeSelection(data);
  const currentClassId = selection.classId;
  const isManual = currentClassId === 'manual';
  const selectedClass = classList.find(c => c.id === currentClassId);

  const [manualMode, setManualMode] = useState(selection.isCustomId ? 'free' : 'preset'); // 'preset' | 'free'

  const value = data.diameter || 0;
  const currentDn = selection.dn;
  const currentSch = selection.sch || 'STD';

  const handleClassChange = (newClassId) => {
    const patch = newClassId === 'manual'
      ? manualSelectionPatch(currentDn, currentSch)
      : classSelectionPatch(classList.find(c => c.id === newClassId), currentDn);
    if (patch) onChange(patch);
  };

  const handleSpecSizeChange = (newDnStr) => {
    const patch = classSizePatch(selectedClass, parseInt(newDnStr, 10));
    if (patch) onChange(patch);
  };

  const handleManualPresetChange = (newDn, newSch) => {
    const patch = schedulePatch(Number(newDn !== undefined ? newDn : currentDn), newSch !== undefined ? newSch : currentSch);
    if (patch) onChange(patch);
  };

  // Dimensions & Area calculation
  const currentOdMm = data.outer_diameter_mm || (value * 1000 * 1.15);
  const currentWtMm = data.wall_thickness_mm || ((currentOdMm - value * 1000) / 2);
  const flowAreaCm2 = (Math.PI / 4) * Math.pow(value * 100, 2);
  const flowAreaIn2 = flowAreaCm2 * 0.15500031;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Pipe Class Selection */}
      <div>
        <label style={{ fontSize: '10px', color: 'var(--color-text-secondary)', fontWeight: '700', textTransform: 'uppercase' }}>Piping Spec</label>
        <select
          className="form-select"
          style={{ width: '100%', height: '32px', fontSize: '11px' }}
          value={currentClassId}
          onChange={(e) => handleClassChange(e.target.value)}
        >
          {classList.map(c => (
            <option key={c.id} value={c.id}>
              [{c.code}] {c.name}
            </option>
          ))}
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
            <label style={{ fontSize: '10px', color: 'var(--color-text-secondary)', fontWeight: '700' }}>Nominal Size</label>
            <select
              className="form-select"
              style={{ width: '100%', height: '32px', fontSize: '11px' }}
              value={currentDn}
              onChange={(e) => handleSpecSizeChange(e.target.value)}
            >
              {selectedClass.sizes.map(s => (
                <option key={s.dn} value={s.dn}>
                  DN {s.dn} ({s.nps}") - {s.sch || 'STD'}
                </option>
              ))}
            </select>
          </div>

          {/* Enhanced Spec Dimensional Summary Card */}
          <div style={{
            fontSize: '11px',
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
                DN{currentDn} ({selectedClass.sizes.find(s => s.dn === currentDn)?.nps || ''}") • {data.standardSch || 'STD'}
              </span>
              <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)' }}>
                {selectedClass.code}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontSize: '10px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
              <div>OD: <strong style={{ color: 'var(--color-text-primary)' }}>{isImperial ? `${(currentOdMm / 25.4).toFixed(3)} in` : `${currentOdMm.toFixed(1)} mm`}</strong></div>
              <div>WT: <strong style={{ color: 'var(--color-text-primary)' }}>{isImperial ? `${(currentWtMm / 25.4).toFixed(3)} in` : `${currentWtMm.toFixed(2)} mm`}</strong></div>
              <div>ID: <strong style={{ color: 'var(--color-primary-text)' }}>{isImperial ? `${(value * 39.3701).toFixed(3)} in` : `${(value * 1000).toFixed(2)} mm`}</strong></div>
              <div>Area: <strong style={{ color: 'var(--color-text-primary)' }}>{isImperial ? `${flowAreaIn2.toFixed(2)} in²` : `${flowAreaCm2.toFixed(2)} cm²`}</strong></div>
            </div>
            <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
              Mat: <span style={{ color: 'var(--color-text-primary)' }}>{selectedClass.material_grade} (ε={selectedClass.roughness_mm}mm)</span>
            </div>
            <div style={{ fontSize: '9px', color: 'var(--color-text-secondary)', marginTop: '4px', paddingTop: '4px', borderTop: '1px dashed var(--color-border)', display: 'flex', justifyContent: 'space-between' }}>
              <span>Reducers: <strong style={{ color: 'var(--color-brand-dark)' }}>{selectedClass.reducer_standard_code || 'ASME_B16_9'}</strong></span>
              <span>Sch: <strong style={{ color: 'var(--color-brand-dark)' }}>{selectedClass.schedule_standard_code || 'ASME_B36_10M'}</strong></span>
            </div>
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
                fontSize: '10px',
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
                fontSize: '10px',
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

          {manualMode === 'preset' ? (
            <>
              {/* Preset Selectors */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '6px' }}>
                <div>
                  <label style={{ fontSize: '10px', color: 'var(--color-text-secondary)', fontWeight: '700' }}>Nominal Size (NPS)</label>
                  <select
                    className="form-select"
                    style={{ width: '100%', height: '30px', fontSize: '11px' }}
                    value={currentDn}
                    onChange={(e) => handleManualPresetChange(e.target.value, currentSch)}
                  >
                    {ASME_B36_10M_SCHEDULES.map(s => (
                      <option key={s.dn} value={s.dn}>
                        DN {s.dn} ({s.nps}")
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '10px', color: 'var(--color-text-secondary)', fontWeight: '700' }}>Schedule</label>
                  <select
                    className="form-select"
                    style={{ width: '100%', height: '30px', fontSize: '11px' }}
                    value={currentSch}
                    onChange={(e) => handleManualPresetChange(currentDn, e.target.value)}
                  >
                    {Object.keys(ASME_B36_10M_SCHEDULES.find(s => s.dn === currentDn)?.schedules || { 'STD': true, '40': true, '80': true }).map(schKey => (
                      <option key={schKey} value={schKey}>
                        {schKey}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Quick-Pick Schedule Buttons */}
              <div style={{ display: 'flex', gap: '4px' }}>
                {['STD', '40', '80', 'XS', '160'].map(schKey => {
                  const isAvailable = !!(ASME_B36_10M_SCHEDULES.find(s => s.dn === currentDn)?.schedules?.[schKey]);
                  const isCurrent = currentSch === schKey;
                  if (!isAvailable) return null;
                  return (
                    <button
                      key={schKey}
                      type="button"
                      onClick={() => handleManualPresetChange(currentDn, schKey)}
                      style={{
                        flex: 1,
                        padding: '2px 4px',
                        fontSize: '9px',
                        fontWeight: '700',
                        borderRadius: '4px',
                        border: isCurrent ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                        backgroundColor: isCurrent ? 'rgba(250, 133, 7, 0.12)' : 'var(--color-surface-light)',
                        color: isCurrent ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                        cursor: 'pointer'
                      }}
                    >
                      {schKey}
                    </button>
                  );
                })}
              </div>

              {/* Dimensional Preview Card */}
              <div style={{
                fontSize: '10px',
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
                <div>ID: <strong style={{ color: 'var(--color-primary-text)' }}>{isImperial ? `${(value * 39.3701).toFixed(3)} in` : `${(value * 1000).toFixed(2)} mm`}</strong></div>
                <div>Area: <strong style={{ color: 'var(--color-text-primary)' }}>{isImperial ? `${flowAreaIn2.toFixed(2)} in²` : `${flowAreaCm2.toFixed(2)} cm²`}</strong></div>
              </div>
            </>
          ) : (
            /* Free Manual Numeric Inputs */
            <div>
              <label style={{ fontSize: '10px', color: 'var(--color-text-secondary)', fontWeight: '600' }}>Inner Diameter ({isImperial ? 'in' : 'mm'})</label>
              <DraftNumberInput
                step="0.1"
                className="form-input"
                style={{ width: '100%' }}
                displayValue={value > 0 ? (isImperial ? (value * 39.37007874).toFixed(3) : (value * 1000).toFixed(2)) : ''}
                onCommit={(text) => {
                  const raw = parseFloat(text);
                  if (isNaN(raw) || raw <= 0) return; // reverts to the stored value
                  const idM = isImperial ? raw / 39.37007874 : raw / 1000.0;
                  // A free ID keeps DN/schedule/OD/WT only if it equals a B36.10M schedule
                  const match = matchScheduleByInnerDiameter(idM);
                  const sch = match ? getPipeScheduleDetails(match.dn, match.sch) : null;
                  onChange({
                    diameter: idM,
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
            <label style={{ fontSize: '10px', color: 'var(--color-text-secondary)', fontWeight: '600' }}>Surface Roughness ε (mm)</label>
            <input
              type="number"
              step="0.001"
              className="form-input"
              style={{ width: '100%' }}
              value={data.roughness_mm !== undefined ? data.roughness_mm : 0.045}
              onChange={(e) => {
                const raw = parseFloat(e.target.value);
                if (!isNaN(raw) && raw >= 0) {
                  onChange({
                    roughness_mm: raw,
                    roughness: raw / 1000.0
                  });
                }
              }}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            <div>
              <label style={{ fontSize: '10px', color: 'var(--color-text-secondary)', fontWeight: '600' }}>Design Temp ({isImperial ? '°F' : '°C'})</label>
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
              <label style={{ fontSize: '10px', color: 'var(--color-text-secondary)', fontWeight: '600' }}>Design Press ({isImperial ? 'psi' : 'bar(g)'})</label>
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
