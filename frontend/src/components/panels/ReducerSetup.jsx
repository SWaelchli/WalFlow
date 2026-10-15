import React from 'react';
import {
  DEFAULT_REDUCER_STANDARD,
  CUSTOM_REDUCER_STANDARD,
  normalizeReducerStandard,
  getReducerStandardOptions,
  getReducerDataset,
  getLargeEndDns,
  getSmallEndDns,
  findReducerEntry,
  coneAngleFromGeometry,
  getEdgePipeClass,
  resolveBore,
  formatDnOption
} from '../../utils/reducer_catalog';

/**
 * Inspector fields of a reducer / expander (standard, sizes, geometry). `ctx` carries the helpers of the
 * SetupPanel it belongs to: its field label and draft/commit handling, the unit system and the pipe data.
 */
export default function ReducerSetup({ ctx }) {
  const {
    allEdges, availablePipeClasses, effectiveData, handleDraftChange, id, isImperial, localDrafts, onUpdate,
    reducerNotice, reducerStandards, renderLabel, setReducerNotice, validateAndCommit,
  } = ctx;
  return (() => {
            const isCustom = effectiveData.standard === CUSTOM_REDUCER_STANDARD;
            const reducerType = effectiveData.reducer_type || 'concentric';
            const dnLarge = Number(effectiveData.dn_large || 80);
            const dnSmall = Number(effectiveData.dn_small || 50);
            const schLarge = effectiveData.sch_large || 'STD';
            const schSmall = effectiveData.sch_small || 'STD';
            const isExpanding = effectiveData.orientation === 'expanding'; // Small -> Large

            // Catalog standard (API-backed, bundled fallback)
            const standardOptions = getReducerStandardOptions(reducerStandards);
            const standardCode = isCustom ? DEFAULT_REDUCER_STANDARD : normalizeReducerStandard(effectiveData.standard);
            const standardName = standardOptions.find(o => o.code === standardCode)?.name || standardCode;
            const dataset = getReducerDataset(standardCode, standardOptions);

            // Find connected inlet and outlet pipe edges and their pipe classes
            const connectedInletEdge = allEdges.find(e => e.target === id && (e.targetHandle === 'inlet-0' || !e.targetHandle));
            const connectedOutletEdge = allEdges.find(e => e.source === id && (e.sourceHandle === 'outlet-0' || !e.sourceHandle));
            const inletClass = getEdgePipeClass(connectedInletEdge, availablePipeClasses);
            const outletClass = getEdgePipeClass(connectedOutletEdge, availablePipeClasses);
            const lineClass = inletClass || outletClass;
            const classReducerStandard = lineClass?.reducer_standard_code ? normalizeReducerStandard(lineClass.reducer_standard_code) : null;
            const classStandardMismatch = !isCustom && classReducerStandard && classReducerStandard !== standardCode;
            const classStandardName = standardOptions.find(o => o.code === classReducerStandard)?.name || classReducerStandard;

            const pipeInletDn = Number(connectedInletEdge?.data?.standardDn) || null;
            const pipeOutletDn = Number(connectedOutletEdge?.data?.standardDn) || null;
            const pipeInletDiameterM = connectedInletEdge?.data?.diameter;
            const pipeOutletDiameterM = connectedOutletEdge?.data?.diameter;

            // Large end sits on the inlet when reducing, on the outlet when expanding
            const largeClass = isExpanding ? outletClass : inletClass;
            const smallClass = isExpanding ? inletClass : outletClass;
            const largeBore = resolveBore(dnLarge, schLarge, largeClass);
            const smallBore = resolveBore(dnSmall, schSmall, smallClass);
            const largeSchFromClass = !!(largeBore && largeClass && largeBore.source === largeClass.code);
            const smallSchFromClass = !!(smallBore && smallClass && smallBore.source === smallClass.code);

            const activeEntry = findReducerEntry(dataset, dnLarge, dnSmall);
            const lengthMm = Number(effectiveData.length_mm || (effectiveData.length ? effectiveData.length * 1000 : 89.0));
            const coneAngleDeg = Number(effectiveData.cone_angle_deg || 18.2);

            // The bores the solver actually uses
            const dInMeters = Number(effectiveData.diameter_in || 0.07792);
            const dOutMeters = Number(effectiveData.diameter_out || 0.05248);

            const hasInletMismatch = pipeInletDiameterM && Math.abs(pipeInletDiameterM - dInMeters) > 0.0015;
            const hasOutletMismatch = pipeOutletDiameterM && Math.abs(pipeOutletDiameterM - dOutMeters) > 0.0015;

            const showNotice = (kind, text) => setReducerNotice({ nodeId: id, kind, text });

            // Builds a consistent geometry update; refuses to guess when a bore is unknown.
            const applySizes = ({ dl, ds, sl = schLarge, ss = schSmall, expanding = isExpanding, std = standardCode }) => {
              const lClass = expanding ? outletClass : inletClass;
              const sClass = expanding ? inletClass : outletClass;
              const stdDataset = getReducerDataset(std, standardOptions);
              const stdName = standardOptions.find(o => o.code === std)?.name || std;
              const entry = findReducerEntry(stdDataset, dl, ds);
              const lBore = resolveBore(dl, sl, lClass);
              const sBore = resolveBore(ds, ss, sClass);

              const missing = [];
              if (!lBore) missing.push(`DN${dl} Sch ${sl}`);
              if (!sBore) missing.push(`DN${ds} Sch ${ss}`);
              if (missing.length > 0) {
                showNotice('error', `No bore data for ${missing.join(' and ')}. Choose a listed schedule, assign a pipe class to the line, or switch to Custom dimensions.`);
                return;
              }

              const newLengthMm = entry ? Number(entry.length_mm) : lengthMm;
              const newCone = entry ? Number(entry.cone_angle_deg) : coneAngleFromGeometry(lBore.id_mm, sBore.id_mm, newLengthMm);

              onUpdate(id, {
                standard: std,
                dn_large: dl,
                nps_large: lBore.nps || '',
                dn_small: ds,
                nps_small: sBore.nps || '',
                sch_large: lBore.sch,
                sch_small: sBore.sch,
                orientation: expanding ? 'expanding' : 'reducing',
                length: newLengthMm / 1000.0,
                length_mm: newLengthMm,
                cone_angle_deg: Number(newCone.toFixed(2)),
                diameter_in: (expanding ? sBore.id_mm : lBore.id_mm) / 1000.0,
                diameter_out: (expanding ? lBore.id_mm : sBore.id_mm) / 1000.0,
              });

              if (entry) {
                setReducerNotice(null);
              } else {
                showNotice('warning', `DN${dl} × DN${ds} is not listed in ${stdName}. Length kept at ${newLengthMm.toFixed(0)} mm; cone angle derived from the bores.`);
              }
            };

            const handleAutoInheritFromLines = () => {
              if (!connectedInletEdge && !connectedOutletEdge) {
                showNotice('error', 'No pipe lines are connected to the inlet or outlet port.');
                return;
              }
              const missingDn = [];
              if (connectedInletEdge && !pipeInletDn) missingDn.push('inlet');
              if (connectedOutletEdge && !pipeOutletDn) missingDn.push('outlet');
              if (missingDn.length > 0) {
                showNotice('error', missingDn.length > 1
                ? 'The inlet and outlet lines have no nominal size (DN). Select a pipe class size or schedule preset on each line first.'
                : `The ${missingDn[0]} line has no nominal size (DN). Select a pipe class size or schedule preset on the line first.`);
                return;
              }

              // An open port keeps the reducer's current size on that side
              const dnIn = pipeInletDn || (isExpanding ? dnSmall : dnLarge);
              const dnOut = pipeOutletDn || (isExpanding ? dnLarge : dnSmall);
              if (dnIn === dnOut) {
                showNotice('error', `Both ends resolve to DN${dnIn}; a reducer needs two different sizes.`);
                return;
              }
              const schIn = connectedInletEdge?.data?.standardSch || (isExpanding ? schSmall : schLarge);
              const schOut = connectedOutletEdge?.data?.standardSch || (isExpanding ? schLarge : schSmall);
              const expanding = dnIn < dnOut;

              applySizes({
                dl: expanding ? dnOut : dnIn,
                ds: expanding ? dnIn : dnOut,
                sl: expanding ? schOut : schIn,
                ss: expanding ? schIn : schOut,
                expanding,
                std: classReducerStandard || standardCode,
              });
            };

            const handleLargeDnChange = (newDnLarge) => {
              const dl = Number(newDnLarge);
              const smalls = getSmallEndDns(dataset, dl);
              const ds = smalls.includes(dnSmall) ? dnSmall : (smalls[0] || dnSmall);
              applySizes({ dl, ds });
            };

            const handleStandardChange = (newStandard) => {
              if (newStandard === CUSTOM_REDUCER_STANDARD) {
                setReducerNotice(null);
                onUpdate(id, { standard: CUSTOM_REDUCER_STANDARD });
                return;
              }
              const newDataset = getReducerDataset(newStandard, standardOptions);
              let dl = dnLarge;
              let ds = dnSmall;
              if (!findReducerEntry(newDataset, dl, ds)) {
                const larges = getLargeEndDns(newDataset);
                dl = larges.includes(dnLarge) ? dnLarge : (larges.find(d => d >= dnLarge) || larges[larges.length - 1]);
                const smalls = getSmallEndDns(newDataset, dl);
                ds = smalls.includes(dnSmall) ? dnSmall : smalls[0];
              }
              applySizes({ dl, ds, std: newStandard });
            };

            const availableLargeDNs = getLargeEndDns(dataset);
            if (!availableLargeDNs.includes(dnLarge)) availableLargeDNs.push(dnLarge);
            const availableSmallDNs = getSmallEndDns(dataset, dnLarge);
            if (!availableSmallDNs.includes(dnSmall)) availableSmallDNs.push(dnSmall);
            const dnLabel = (dn, end) => {
              const entry = dataset.find(r => Number(r[`dn_${end}`]) === dn);
              return formatDnOption(dn, entry?.[`nps_${end}`]);
            };
            const scheduleOptions = (current) => (
              ['STD', '40', '80', 'XS', '160'].includes(current) ? ['STD', '40', '80', 'XS', '160'] : [current, 'STD', '40', '80', 'XS', '160']
            );
            const notice = reducerNotice?.nodeId === id ? reducerNotice : null;

            const betaRatio = Math.min(dInMeters, dOutMeters) / Math.max(1e-6, Math.max(dInMeters, dOutMeters));

            return (
              <>
                {/* Auto-Detect from Lines Action Card */}
                {(connectedInletEdge || connectedOutletEdge) && (
                  <div style={{
                    padding: '8px 10px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(57, 82, 83, 0.08)',
                    border: '1px solid var(--color-border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '10px', fontWeight: '700', color: 'var(--color-brand-dark)' }}>
                        Connected Lines Spec
                      </span>
                      <button
                        type="button"
                        onClick={handleAutoInheritFromLines}
                        className="btn-secondary"
                        style={{ height: '22px', padding: '0 8px', fontSize: '9px', fontWeight: '700', gap: '4px' }}
                        title="Match reducer sizes, schedules and fitting standard to the connected lines"
                      >
                        <BoltIcon size={10} /> Auto-Detect Sizes
                      </button>
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Inlet: {connectedInletEdge ? `${pipeInletDn ? `DN${pipeInletDn}` : 'No DN'} (${connectedInletEdge.data?.pipe_class_code || 'Custom'})` : 'Open'}</span>
                      <span>Outlet: {connectedOutletEdge ? `${pipeOutletDn ? `DN${pipeOutletDn}` : 'No DN'} (${connectedOutletEdge.data?.pipe_class_code || 'Custom'})` : 'Open'}</span>
                    </div>
                  </div>
                )}

                {/* Inline result of the last size action (replaces blocking alerts) */}
                {notice && (
                  <div
                    role={notice.kind === 'error' ? 'alert' : 'status'}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '8px',
                      backgroundColor: notice.kind === 'error' ? '#FEF2F2' : '#FEF3C7',
                      border: `1px solid ${notice.kind === 'error' ? '#FEE2E2' : '#FCD34D'}`,
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '6px',
                      fontSize: '10px',
                      color: notice.kind === 'error' ? '#B91C1C' : '#92400E'
                    }}
                  >
                    <WarningIcon size={12} style={{ flexShrink: 0, marginTop: '1px' }} />
                    <span style={{ flex: 1 }}>{notice.text}</span>
                    <button
                      type="button"
                      onClick={() => setReducerNotice(null)}
                      aria-label="Dismiss message"
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'inherit', padding: 0, display: 'inline-flex' }}
                    >
                      <CrossIcon size={10} />
                    </button>
                  </div>
                )}

                {/* Pipe class prescribes a different fitting standard */}
                {classStandardMismatch && (
                  <div style={{
                    padding: '8px 10px',
                    borderRadius: '8px',
                    backgroundColor: '#F4F7F6',
                    border: '1px solid #D8E2E1',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    fontSize: '10px',
                    color: '#1C2B2C'
                  }}>
                    <span>
                      Pipe class <strong>{lineClass.code}</strong> specifies <strong>{classStandardName}</strong>; this reducer uses <strong>{standardName}</strong>.
                    </span>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => handleStandardChange(classReducerStandard)}
                      style={{ alignSelf: 'flex-start', height: '22px', padding: '0 8px', fontSize: '9px', fontWeight: '700' }}
                    >
                      Use {classStandardName}
                    </button>
                  </div>
                )}

                {/* Size Mismatch Warning Alert */}
                {(hasInletMismatch || hasOutletMismatch) && (
                  <div style={{
                    padding: '8px 10px',
                    borderRadius: '8px',
                    backgroundColor: '#FEF3C7',
                    border: '1px solid #FCD34D',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <WarningIcon size={12} color="#92400E" />
                      <strong style={{ fontSize: '11px', color: '#92400E' }}>Pipe Size Mismatch Detected</strong>
                    </div>
                    <div style={{ fontSize: '10px', color: '#B45309' }}>
                      {hasInletMismatch && <div>• Inlet: Pipe is {(pipeInletDiameterM * 1000).toFixed(1)}mm vs Reducer {(dInMeters * 1000).toFixed(1)}mm</div>}
                      {hasOutletMismatch && <div>• Outlet: Pipe is {(pipeOutletDiameterM * 1000).toFixed(1)}mm vs Reducer {(dOutMeters * 1000).toFixed(1)}mm</div>}
                    </div>
                    <button
                      type="button"
                      onClick={handleAutoInheritFromLines}
                      style={{
                        marginTop: '4px',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        border: '1px solid #D97706',
                        backgroundColor: '#D97706',
                        color: '#FFFFFF',
                        fontSize: '10px',
                        fontWeight: '700',
                        cursor: 'pointer'
                      }}
                    >
                      Fix to Connected Line Sizes
                    </button>
                  </div>
                )}

                <div>
                  {renderLabel('Dimensional Standard', 'standard')}
                  <select
                    className="form-select"
                    style={{ width: '100%', height: '32px', fontSize: '11px' }}
                    value={isCustom ? CUSTOM_REDUCER_STANDARD : standardCode}
                    onChange={(e) => handleStandardChange(e.target.value)}
                  >
                    {standardOptions.map(o => (
                      <option key={o.code} value={o.code}>
                        {o.name}{o.code === classReducerStandard ? ' (pipe class)' : ''}
                      </option>
                    ))}
                    {!isCustom && !standardOptions.some(o => o.code === standardCode) && (
                      <option value={standardCode}>{standardCode} (not in catalog)</option>
                    )}
                    <option value={CUSTOM_REDUCER_STANDARD}>Custom / Manual Dimensions</option>
                  </select>
                </div>

                <div>
                  {renderLabel('Reducer Type', 'reducer_type')}
                  <select
                    className="form-select"
                    style={{ width: '100%', height: '32px', fontSize: '11px' }}
                    value={reducerType}
                    onChange={(e) => onUpdate(id, { reducer_type: e.target.value })}
                  >
                    <option value="concentric">Concentric (Symmetrical)</option>
                    <option value="eccentric">Eccentric (Flat-on-Top / Suction)</option>
                  </select>
                </div>


                {!isCustom ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', padding: '6px 8px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: '11px', fontWeight: '600', color: '#334155' }}>
                        Flow: {isExpanding ? 'Expander (Small → Large)' : 'Reducer (Large → Small)'}
                      </span>
                      <button
                        type="button"
                        onClick={() => applySizes({ dl: dnLarge, ds: dnSmall, expanding: !isExpanding })}
                        style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#ffffff', cursor: 'pointer' }}
                        title="Flip flow orientation between reducing and expanding"
                      >
                        ⇄ Invert
                      </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div>
                        <label style={{ fontSize: '10px', color: '#64748b', fontWeight: '700' }}>Large End (NPS)</label>
                        <select
                          className="form-select"
                          style={{ width: '100%', height: '30px', fontSize: '11px' }}
                          value={dnLarge}
                          onChange={(e) => handleLargeDnChange(e.target.value)}
                        >
                          {availableLargeDNs.map(dn => (
                            <option key={dn} value={dn}>{dnLabel(dn, 'large')}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label style={{ fontSize: '10px', color: '#64748b', fontWeight: '700' }}>Small End (NPS)</label>
                        <select
                          className="form-select"
                          style={{ width: '100%', height: '30px', fontSize: '11px' }}
                          value={dnSmall}
                          onChange={(e) => applySizes({ dl: dnLarge, ds: Number(e.target.value) })}
                        >
                          {availableSmallDNs.map(dn => (
                            <option key={dn} value={dn}>{dnLabel(dn, 'small')}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div>
                        <label style={{ fontSize: '10px', color: '#64748b', fontWeight: '700' }}>Large Schedule</label>
                        <select
                          className="form-select"
                          style={{ width: '100%', height: '30px', fontSize: '11px' }}
                          value={schLarge}
                          disabled={largeSchFromClass}
                          title={largeSchFromClass ? `Wall thickness taken from pipe class ${largeClass.code}` : undefined}
                          onChange={(e) => applySizes({ dl: dnLarge, ds: dnSmall, sl: e.target.value })}
                        >
                          {scheduleOptions(schLarge).map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                        {largeSchFromClass && (
                          <div style={{ fontSize: '9px', color: '#587071', marginTop: '2px' }}>From {largeClass.code}</div>
                        )}
                      </div>

                      <div>
                        <label style={{ fontSize: '10px', color: '#64748b', fontWeight: '700' }}>Small Schedule</label>
                        <select
                          className="form-select"
                          style={{ width: '100%', height: '30px', fontSize: '11px' }}
                          value={schSmall}
                          disabled={smallSchFromClass}
                          title={smallSchFromClass ? `Wall thickness taken from pipe class ${smallClass.code}` : undefined}
                          onChange={(e) => applySizes({ dl: dnLarge, ds: dnSmall, ss: e.target.value })}
                        >
                          {scheduleOptions(schSmall).map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                        {smallSchFromClass && (
                          <div style={{ fontSize: '9px', color: '#587071', marginTop: '2px' }}>From {smallClass.code}</div>
                        )}
                      </div>
                    </div>

                    <div style={{ background: '#f4f7f6', padding: '8px', borderRadius: '4px', border: '1px solid #d8e2e1', fontSize: '10px', color: '#334155' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                        <span>Catalog:</span>
                        <strong style={{ color: activeEntry ? 'inherit' : '#B45309' }}>
                          {activeEntry ? standardName : `Not listed in ${standardName}`}
                        </strong>
                      </div>
                      {(!largeBore || !smallBore) && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#B91C1C', marginBottom: '3px' }}>
                          <WarningIcon size={10} />
                          <span>No bore data for {[!largeBore && `DN${dnLarge} Sch ${schLarge}`, !smallBore && `DN${dnSmall} Sch ${schSmall}`].filter(Boolean).join(' and ')}; diameters below are the last valid values.</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                        <span>Fitting Length (H):</span>
                        <strong>{isImperial ? `${(lengthMm / 25.4).toFixed(2)} in` : `${lengthMm.toFixed(1)} mm`}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                        <span>Cone Angle (θ):</span>
                        <strong>{coneAngleDeg.toFixed(1)}°</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                        <span>Inlet ID (D₁):</span>
                        <strong>{isImperial ? `${(dInMeters * 39.3701).toFixed(3)} in` : `${(dInMeters * 1000).toFixed(2)} mm`}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Outlet ID (D₂):</span>
                        <strong>{isImperial ? `${(dOutMeters * 39.3701).toFixed(3)} in` : `${(dOutMeters * 1000).toFixed(2)} mm`}</strong>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      {renderLabel(`Inlet Diameter (${isImperial ? 'in' : 'mm'})`, 'diameter_in')}
                      <input
                        type="number"
                        step="0.1"
                        className="form-input"
                        style={{ width: '100%' }}
                        value={localDrafts.diameter_in !== undefined ? localDrafts.diameter_in : (isImperial ? (Number(effectiveData.diameter_in || 0.07792) * 39.3701).toFixed(3) : (Number(effectiveData.diameter_in || 0.07792) * 1000).toFixed(2))}
                        onChange={(e) => handleDraftChange('diameter_in', e.target.value)}
                        onBlur={(e) => validateAndCommit('diameter_in', isImperial ? (Number(e.target.value) / 39.3701) : (Number(e.target.value) / 1000.0))}
                      />
                    </div>

                    <div>
                      {renderLabel(`Outlet Diameter (${isImperial ? 'in' : 'mm'})`, 'diameter_out')}
                      <input
                        type="number"
                        step="0.1"
                        className="form-input"
                        style={{ width: '100%' }}
                        value={localDrafts.diameter_out !== undefined ? localDrafts.diameter_out : (isImperial ? (Number(effectiveData.diameter_out || 0.05248) * 39.3701).toFixed(3) : (Number(effectiveData.diameter_out || 0.05248) * 1000).toFixed(2))}
                        onChange={(e) => handleDraftChange('diameter_out', e.target.value)}
                        onBlur={(e) => validateAndCommit('diameter_out', isImperial ? (Number(e.target.value) / 39.3701) : (Number(e.target.value) / 1000.0))}
                      />
                    </div>

                    <div>
                      {renderLabel(`Transition Length (${isImperial ? 'in' : 'mm'})`, 'length')}
                      <input
                        type="number"
                        step="1.0"
                        className="form-input"
                        style={{ width: '100%' }}
                        value={localDrafts.length !== undefined ? localDrafts.length : (isImperial ? (Number(effectiveData.length || 0.089) * 39.3701).toFixed(2) : (Number(effectiveData.length || 0.089) * 1000).toFixed(1))}
                        onChange={(e) => handleDraftChange('length', e.target.value)}
                        onBlur={(e) => validateAndCommit('length', isImperial ? (Number(e.target.value) / 39.3701) : (Number(e.target.value) / 1000.0))}
                      />
                    </div>

                    <div>
                      {renderLabel('Included Angle (deg)', 'cone_angle_deg')}
                      <input
                        type="number"
                        step="0.5"
                        className="form-input"
                        style={{ width: '100%' }}
                        value={localDrafts.cone_angle_deg !== undefined ? localDrafts.cone_angle_deg : Number(effectiveData.cone_angle_deg || 18.2).toFixed(1)}
                        onChange={(e) => handleDraftChange('cone_angle_deg', e.target.value)}
                        onBlur={(e) => validateAndCommit('cone_angle_deg', Number(e.target.value))}
                      />
                    </div>
                  </>
                )}

                <div style={{ fontSize: '10px', color: '#587071', background: '#f8fafc', padding: '6px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                  <span><strong>Hydraulic Ratio (β):</strong> {betaRatio.toFixed(3)} | <strong>Loss Standard:</strong> Crane TP 410 conical transition with Bernoulli static pressure shift.</span>
                </div>
              </>
            );
          })();
}
