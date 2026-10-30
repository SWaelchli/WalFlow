/**
 * Unit conversion utilities for WalFlow.
 * All internal values in WalFlow are standardized in Metric/SI units:
 * - Pressure: Pa (or bar in UI state)
 * - Flow rate: m³/s (or L/min in UI state)
 * - Temperature: K (or °C in UI state)
 * - Power: kW (or W)
 * - Length: m
 * - Diameter: mm / m
 * - Velocity: m/s
 */

// ==========================================
// CONSTANTS & MULTIPLIERS
// ==========================================
export const BAR_TO_PA = 100000;
export const PA_TO_BAR = 1 / BAR_TO_PA;

export const BAR_TO_PSI = 14.503773773;
export const PSI_TO_BAR = 1 / BAR_TO_PSI;

export const PA_TO_PSI = 0.00014503773773;
export const PSI_TO_PA = 6894.757293;

export const M3S_TO_LMIN = 60000;
export const LMIN_TO_M3S = 1 / M3S_TO_LMIN;

export const LMIN_TO_GPM = 0.264172052358;
export const GPM_TO_LMIN = 3.785411784;

export const M3S_TO_GPM = 15850.3231415;
export const GPM_TO_M3S = 1 / M3S_TO_GPM;

export const LMIN_TO_M3H = 0.06;
export const M3H_TO_LMIN = 1 / LMIN_TO_M3H;

export const KW_TO_HP = 1.3410220896;
export const HP_TO_KW = 0.74569987158;
export const KW_TO_BTUH = 3412.141633;

export const M_TO_FT = 3.280839895;
export const FT_TO_M = 1 / M_TO_FT;

export const MM_TO_IN = 1 / 25.4;
export const IN_TO_MM = 25.4;

export const M_TO_IN = 39.37007874;
export const IN_TO_M = 1 / M_TO_IN;

export const MS_TO_FTS = 3.280839895;
export const FTS_TO_MS = 1 / MS_TO_FTS;


// ==========================================
// PRESSURE CONVERTERS
// ==========================================
export const paToBar = (pa, decimals = 2) => {
  if (pa === null || pa === undefined || isNaN(pa)) return '—';
  const val = Number(pa) * PA_TO_BAR;
  return decimals !== undefined ? val.toFixed(decimals) : val;
};

export const barToPa = (bar) => Number(bar) * BAR_TO_PA;

export const barToPsi = (bar, decimals = 2) => {
  if (bar === null || bar === undefined || isNaN(bar)) return '—';
  const val = Number(bar) * BAR_TO_PSI;
  return decimals !== undefined ? val.toFixed(decimals) : val;
};

export const psiToBar = (psi) => Number(psi) * PSI_TO_BAR;

export const paToPsi = (pa, decimals = 2) => {
  if (pa === null || pa === undefined || isNaN(pa)) return '—';
  const val = Number(pa) * PA_TO_PSI;
  return decimals !== undefined ? val.toFixed(decimals) : val;
};

export const psiToPa = (psi) => Number(psi) * PSI_TO_PA;


// ==========================================
// FLOW CONVERTERS
// ==========================================
export const m3sToLmin = (m3s, decimals = 1) => {
  if (m3s === null || m3s === undefined || isNaN(m3s)) return '—';
  const val = Number(m3s) * M3S_TO_LMIN;
  return decimals !== undefined ? val.toFixed(decimals) : val;
};

export const lminToM3s = (lmin) => Number(lmin) * LMIN_TO_M3S;

export const lminToGpm = (lmin, decimals = 1) => {
  if (lmin === null || lmin === undefined || isNaN(lmin)) return '—';
  const val = Number(lmin) * LMIN_TO_GPM;
  return decimals !== undefined ? val.toFixed(decimals) : val;
};

export const gpmToLmin = (gpm) => Number(gpm) * GPM_TO_LMIN;

export const m3sToGpm = (m3s, decimals = 1) => {
  if (m3s === null || m3s === undefined || isNaN(m3s)) return '—';
  const val = Number(m3s) * M3S_TO_GPM;
  return decimals !== undefined ? val.toFixed(decimals) : val;
};

export const gpmToM3s = (gpm) => Number(gpm) * GPM_TO_M3S;

export const lminToM3h = (lmin, decimals = 2) => {
  if (lmin === null || lmin === undefined || isNaN(lmin)) return '—';
  const val = Number(lmin) * LMIN_TO_M3H;
  return decimals !== undefined ? val.toFixed(decimals) : val;
};

export const m3hToLmin = (m3h) => Number(m3h) * M3H_TO_LMIN;


// ==========================================
// TEMPERATURE CONVERTERS
// ==========================================
export const kToC = (k, decimals = 1) => {
  if (k === null || k === undefined || isNaN(k)) return '—';
  const val = Number(k) - 273.15;
  return decimals !== undefined ? val.toFixed(decimals) : val;
};

export const cToK = (c) => Number(c) + 273.15;

export const cToF = (c, decimals = 1) => {
  if (c === null || c === undefined || isNaN(c)) return '—';
  const val = Number(c) * 1.8 + 32;
  return decimals !== undefined ? val.toFixed(decimals) : val;
};

export const fToC = (f) => (Number(f) - 32) / 1.8;

export const kToF = (k, decimals = 1) => {
  if (k === null || k === undefined || isNaN(k)) return '—';
  const val = (Number(k) - 273.15) * 1.8 + 32;
  return decimals !== undefined ? val.toFixed(decimals) : val;
};

export const fToK = (f) => (Number(f) - 32) / 1.8 + 273.15;


// ==========================================
// POWER CONVERTERS
// ==========================================
export const kwToHp = (kw, decimals = 2) => {
  if (kw === null || kw === undefined || isNaN(kw)) return '—';
  const val = Number(kw) * KW_TO_HP;
  return decimals !== undefined ? val.toFixed(decimals) : val;
};

export const hpToKw = (hp) => Number(hp) * HP_TO_KW;

// Heat duty: kW in the model, BTU/h in imperial display (HP is for shaft power)
export const kwToBtuh = (kw, decimals = 0) => {
  if (kw === null || kw === undefined || isNaN(kw)) return '—';
  const val = Number(kw) * KW_TO_BTUH;
  return decimals !== undefined ? val.toFixed(decimals) : val;
};

export const btuhToKw = (btuh) => Number(btuh) / KW_TO_BTUH;

export const wToHp = (w, decimals = 2) => {
  if (w === null || w === undefined || isNaN(w)) return '—';
  const val = (Number(w) / 1000) * KW_TO_HP;
  return decimals !== undefined ? val.toFixed(decimals) : val;
};

export const hpToW = (hp) => Number(hp) * HP_TO_KW * 1000;


// ==========================================
// LENGTH, DIAMETER & ROUGHNESS CONVERTERS
// ==========================================
export const mmToM = (mm) => Number(mm) / 1000;
export const mToMm = (m, decimals = 2) => {
  if (m === null || m === undefined || isNaN(m)) return '—';
  const val = Number(m) * 1000;
  return decimals !== undefined ? val.toFixed(decimals) : val;
};

export const mToFt = (m, decimals = 2) => {
  if (m === null || m === undefined || isNaN(m)) return '—';
  const val = Number(m) * M_TO_FT;
  return decimals !== undefined ? val.toFixed(decimals) : val;
};

export const ftToM = (ft) => Number(ft) * FT_TO_M;

export const mmToIn = (mm, decimals = 3) => {
  if (mm === null || mm === undefined || isNaN(mm)) return '—';
  const val = Number(mm) * MM_TO_IN;
  return decimals !== undefined ? val.toFixed(decimals) : val;
};

export const inToMm = (inch) => Number(inch) * IN_TO_MM;

export const mToIn = (m, decimals = 3) => {
  if (m === null || m === undefined || isNaN(m)) return '—';
  const val = Number(m) * M_TO_IN;
  return decimals !== undefined ? val.toFixed(decimals) : val;
};

export const inToM = (inch) => Number(inch) * IN_TO_M;


// ==========================================
// VELOCITY CONVERTERS
// ==========================================
export const msToFts = (ms, decimals = 2) => {
  if (ms === null || ms === undefined || isNaN(ms)) return '—';
  const val = Number(ms) * MS_TO_FTS;
  return decimals !== undefined ? val.toFixed(decimals) : val;
};

export const ftsToMs = (fts) => Number(fts) * FTS_TO_MS;


// ==========================================
// SYSTEM-AWARE FORMATTERS & LABELS
// ==========================================

export const UNIT_SYSTEMS = {
  METRIC: 'metric',
  IMPERIAL: 'imperial'
};

export const UNIT_LABELS = {
  [UNIT_SYSTEMS.METRIC]: {
    pressure: 'bar',
    pressureAbs: 'bar a',
    pressureGauge: 'bar g',
    pressureDiff: 'bar',
    flow: 'L/min',
    flowM3h: 'm³/h',
    temperature: '°C',
    temperatureAbs: 'K',
    power: 'kW',
    heatDuty: 'kW',
    length: 'm',
    diameter: 'mm',
    diameterNps: 'in',
    roughness: 'm',
    velocity: 'm/s'
  },
  [UNIT_SYSTEMS.IMPERIAL]: {
    pressure: 'psi',
    pressureAbs: 'psia',
    pressureGauge: 'psig',
    pressureDiff: 'psi',
    flow: 'gpm',
    flowM3h: 'gpm',
    temperature: '°F',
    temperatureAbs: '°R',
    power: 'HP',
    heatDuty: 'BTU/h',
    length: 'ft',
    diameter: 'in',
    diameterNps: 'in',
    roughness: 'in',
    velocity: 'ft/s'
  }
};

/**
 * Get unit string for a given physical quantity and system.
 */
export const getUnitLabel = (quantity, unitSystem = UNIT_SYSTEMS.METRIC) => {
  const system = unitSystem === UNIT_SYSTEMS.IMPERIAL ? UNIT_SYSTEMS.IMPERIAL : UNIT_SYSTEMS.METRIC;
  return UNIT_LABELS[system][quantity] || '';
};

// ==========================================
// PRESSURE BASIS (absolute / gauge) & FLOW UNIT SETTINGS
// ==========================================
// The backend works in absolute Pa and L/min. The pressure basis and the metric flow unit are display
// settings only: the helpers below convert on the way out and back in, stored values never change.

export const PRESSURE_BASES = { ABSOLUTE: 'absolute', GAUGE: 'gauge' };
export const FLOW_UNITS = { LMIN: 'lmin', M3H: 'm3h' };
export const DEFAULT_ATM_PA = 101325;

export const normalizePressureBasis = (basis) => (basis === PRESSURE_BASES.GAUGE ? PRESSURE_BASES.GAUGE : PRESSURE_BASES.ABSOLUTE);
export const normalizeFlowUnit = (flowUnit) => (flowUnit === FLOW_UNITS.M3H ? FLOW_UNITS.M3H : FLOW_UNITS.LMIN);

const validAtm = (atmPa) => {
  const n = Number(atmPa);
  return atmPa === null || atmPa === undefined || atmPa === '' || !Number.isFinite(n) ? DEFAULT_ATM_PA : n;
};
const isImperialSystem = (unitSystem) => unitSystem === UNIT_SYSTEMS.IMPERIAL;
const missing = (v) => v === null || v === undefined || v === '' || isNaN(v);

/** Unit label of an absolute-pressure readout in the chosen basis: "bar a", "bar g", "psia", "psig". */
export const pressureBasisLabel = (unitSystem = UNIT_SYSTEMS.METRIC, basis = PRESSURE_BASES.ABSOLUTE) => {
  const labels = UNIT_LABELS[isImperialSystem(unitSystem) ? UNIT_SYSTEMS.IMPERIAL : UNIT_SYSTEMS.METRIC];
  return normalizePressureBasis(basis) === PRESSURE_BASES.GAUGE ? labels.pressureGauge : labels.pressureAbs;
};

/** Unit label of a flow readout: "L/min" or "m³/h" (metric), "gpm" (imperial). */
export const flowUnitLabel = (unitSystem = UNIT_SYSTEMS.METRIC, flowUnit = FLOW_UNITS.LMIN) => {
  if (isImperialSystem(unitSystem)) return UNIT_LABELS[UNIT_SYSTEMS.IMPERIAL].flow;
  return normalizeFlowUnit(flowUnit) === FLOW_UNITS.M3H ? UNIT_LABELS[UNIT_SYSTEMS.METRIC].flowM3h : UNIT_LABELS[UNIT_SYSTEMS.METRIC].flow;
};

/**
 * Absolute pressure (Pa) as a number in the display unit (bar or psi) and basis.
 * Gauge subtracts the site atmospheric pressure. Returns null for a missing value.
 */
export const absPaToDisplayPressure = (pa, { unitSystem = UNIT_SYSTEMS.METRIC, basis = PRESSURE_BASES.ABSOLUTE, atmPa = DEFAULT_ATM_PA } = {}) => {
  if (missing(pa)) return null;
  const shifted = Number(pa) - (normalizePressureBasis(basis) === PRESSURE_BASES.GAUGE ? validAtm(atmPa) : 0);
  return shifted * (isImperialSystem(unitSystem) ? PA_TO_PSI : PA_TO_BAR);
};

/** Pressure typed in the display unit and basis back to absolute Pa (inverse of absPaToDisplayPressure). */
export const displayPressureToAbsPa = (value, { unitSystem = UNIT_SYSTEMS.METRIC, basis = PRESSURE_BASES.ABSOLUTE, atmPa = DEFAULT_ATM_PA } = {}) => {
  const pa = Number(value) * (isImperialSystem(unitSystem) ? PSI_TO_PA : BAR_TO_PA);
  return pa + (normalizePressureBasis(basis) === PRESSURE_BASES.GAUGE ? validAtm(atmPa) : 0);
};

/** Format an absolute pressure given in Pa in the chosen basis (no unit text). */
export const formatAbsPressureFromPa = (valPa, unitSystem = UNIT_SYSTEMS.METRIC, basis = PRESSURE_BASES.ABSOLUTE, atmPa = DEFAULT_ATM_PA, decimals = 2) => {
  const v = absPaToDisplayPressure(valPa, { unitSystem, basis, atmPa });
  return v === null ? '—' : v.toFixed(decimals);
};

/** Same as formatAbsPressureFromPa for an absolute pressure given in bar. */
export const formatAbsPressureFromBar = (valBar, unitSystem = UNIT_SYSTEMS.METRIC, basis = PRESSURE_BASES.ABSOLUTE, atmPa = DEFAULT_ATM_PA, decimals = 2) => {
  if (missing(valBar)) return '—';
  return formatAbsPressureFromPa(Number(valBar) * BAR_TO_PA, unitSystem, basis, atmPa, decimals);
};

/** Format a pressure DIFFERENCE (given in bar): never offset by the atmosphere, whatever the basis. */
export const formatDiffPressureFromBar = (valBar, unitSystem = UNIT_SYSTEMS.METRIC, decimals = 2) => {
  if (missing(valBar)) return '—';
  if (isImperialSystem(unitSystem)) {
    return barToPsi(valBar, decimals);
  }
  return Number(valBar).toFixed(decimals);
};

/** Format a pressure DIFFERENCE (given in Pa): never offset by the atmosphere, whatever the basis. */
export const formatDiffPressureFromPa = (valPa, unitSystem = UNIT_SYSTEMS.METRIC, decimals = 2) => {
  if (missing(valPa)) return '—';
  if (isImperialSystem(unitSystem)) {
    return paToPsi(valPa, decimals);
  }
  return paToBar(valPa, decimals);
};

/** Gauge-only pressure (relief set / burst pressure, given in bar g) with its unit: "18.99 bar g" / "275.4 psig". */
export const formatGaugeBarWithUnit = (valBarg, unitSystem = UNIT_SYSTEMS.METRIC, decimals = 2) => {
  if (missing(valBarg)) return '—';
  const imperial = isImperialSystem(unitSystem);
  return `${formatDiffPressureFromBar(valBarg, unitSystem, imperial ? 1 : decimals)} ${pressureBasisLabel(unitSystem, PRESSURE_BASES.GAUGE)}`;
};

// Small flows get extra decimals so a split such as 0.85 + 0.84 does not look like a mass imbalance
// (m³/h numbers are 0.06 times the L/min ones, so the thresholds there are 1 and 10)
const flowDecimals = (displayed, decimals, flowUnit = FLOW_UNITS.LMIN) => {
  if (decimals !== undefined) return decimals;
  const abs = Math.abs(Number(displayed));
  if (flowUnit === FLOW_UNITS.M3H) return abs < 1 ? 3 : abs < 10 ? 2 : 1;
  return abs < 10 ? 2 : 1;
};

/** Flow in L/min as a number in the display unit (gpm in imperial, m³/h or L/min in metric). */
export const lminToDisplayFlow = (lmin, unitSystem = UNIT_SYSTEMS.METRIC, flowUnit = FLOW_UNITS.LMIN) => {
  if (missing(lmin)) return null;
  if (isImperialSystem(unitSystem)) return Number(lmin) * LMIN_TO_GPM;
  return Number(lmin) * (normalizeFlowUnit(flowUnit) === FLOW_UNITS.M3H ? LMIN_TO_M3H : 1);
};

/** Flow typed in the display unit back to L/min (inverse of lminToDisplayFlow). */
export const displayFlowToLmin = (value, unitSystem = UNIT_SYSTEMS.METRIC, flowUnit = FLOW_UNITS.LMIN) => {
  if (isImperialSystem(unitSystem)) return gpmToLmin(value);
  return normalizeFlowUnit(flowUnit) === FLOW_UNITS.M3H ? m3hToLmin(value) : Number(value);
};

/**
 * Format a flow rate (given in L/min) to the selected unit system and metric flow unit.
 * Without explicit decimals: more decimals for small values.
 */
export const formatFlowFromLmin = (valLmin, unitSystem = UNIT_SYSTEMS.METRIC, decimals, flowUnit = FLOW_UNITS.LMIN) => {
  if (missing(valLmin)) return '—';
  const unit = isImperialSystem(unitSystem) ? FLOW_UNITS.LMIN : normalizeFlowUnit(flowUnit);
  const shown = lminToDisplayFlow(valLmin, unitSystem, unit);
  return shown.toFixed(flowDecimals(shown, decimals, unit));
};

/** Format a flow rate (given in m³/s) to the selected unit system and metric flow unit. */
export const formatFlowFromM3s = (valM3s, unitSystem = UNIT_SYSTEMS.METRIC, decimals, flowUnit = FLOW_UNITS.LMIN) => {
  if (missing(valM3s)) return '—';
  return formatFlowFromLmin(Number(valM3s) * M3S_TO_LMIN, unitSystem, decimals, flowUnit);
};

/**
 * Format a temperature (given in °C) to the selected unit system.
 */
export const formatTempFromC = (valC, unitSystem = UNIT_SYSTEMS.METRIC, decimals = 1) => {
  if (valC === null || valC === undefined || isNaN(valC)) return '—';
  if (unitSystem === UNIT_SYSTEMS.IMPERIAL) {
    return cToF(valC, decimals);
  }
  return Number(valC).toFixed(decimals);
};

/**
 * Format a temperature (given in K) to the selected unit system.
 */
export const formatTempFromK = (valK, unitSystem = UNIT_SYSTEMS.METRIC, decimals = 1) => {
  if (valK === null || valK === undefined || isNaN(valK)) return '—';
  if (unitSystem === UNIT_SYSTEMS.IMPERIAL) {
    return kToF(valK, decimals);
  }
  return kToC(valK, decimals);
};

/**
 * Format a velocity (given in m/s) to the selected unit system.
 */
export const formatVelocityFromMs = (valMs, unitSystem = UNIT_SYSTEMS.METRIC, decimals = 2) => {
  if (valMs === null || valMs === undefined || isNaN(valMs)) return '—';
  if (unitSystem === UNIT_SYSTEMS.IMPERIAL) {
    return msToFts(valMs, decimals);
  }
  return Number(valMs).toFixed(decimals);
};

/**
 * Format a heat duty (given in kW) to the selected unit system (kW or BTU/h).
 */
export const formatHeatDutyFromKw = (valKw, unitSystem = UNIT_SYSTEMS.METRIC, decimals = 1) => {
  if (valKw === null || valKw === undefined || isNaN(valKw)) return '—';
  if (unitSystem === UNIT_SYSTEMS.IMPERIAL) {
    return kwToBtuh(valKw, 0);
  }
  return Number(valKw).toFixed(decimals);
};

/**
 * Format power (given in kW) to the selected unit system.
 */
export const formatPowerFromKw = (valKw, unitSystem = UNIT_SYSTEMS.METRIC, decimals = 2) => {
  if (valKw === null || valKw === undefined || isNaN(valKw)) return '—';
  if (unitSystem === UNIT_SYSTEMS.IMPERIAL) {
    return kwToHp(valKw, decimals);
  }
  return Number(valKw).toFixed(decimals);
};
