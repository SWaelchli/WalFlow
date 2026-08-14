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
  if (pa === null || pa === undefined || isNaN(pa)) return '0.00';
  const val = Number(pa) * PA_TO_BAR;
  return decimals !== undefined ? val.toFixed(decimals) : val;
};

export const barToPa = (bar) => Number(bar) * BAR_TO_PA;

export const barToPsi = (bar, decimals = 2) => {
  if (bar === null || bar === undefined || isNaN(bar)) return '0.00';
  const val = Number(bar) * BAR_TO_PSI;
  return decimals !== undefined ? val.toFixed(decimals) : val;
};

export const psiToBar = (psi) => Number(psi) * PSI_TO_BAR;

export const paToPsi = (pa, decimals = 2) => {
  if (pa === null || pa === undefined || isNaN(pa)) return '0.00';
  const val = Number(pa) * PA_TO_PSI;
  return decimals !== undefined ? val.toFixed(decimals) : val;
};

export const psiToPa = (psi) => Number(psi) * PSI_TO_PA;


// ==========================================
// FLOW CONVERTERS
// ==========================================
export const m3sToLmin = (m3s, decimals = 1) => {
  if (m3s === null || m3s === undefined || isNaN(m3s)) return '0.0';
  const val = Number(m3s) * M3S_TO_LMIN;
  return decimals !== undefined ? val.toFixed(decimals) : val;
};

export const lminToM3s = (lmin) => Number(lmin) * LMIN_TO_M3S;

export const lminToGpm = (lmin, decimals = 1) => {
  if (lmin === null || lmin === undefined || isNaN(lmin)) return '0.0';
  const val = Number(lmin) * LMIN_TO_GPM;
  return decimals !== undefined ? val.toFixed(decimals) : val;
};

export const gpmToLmin = (gpm) => Number(gpm) * GPM_TO_LMIN;

export const m3sToGpm = (m3s, decimals = 1) => {
  if (m3s === null || m3s === undefined || isNaN(m3s)) return '0.0';
  const val = Number(m3s) * M3S_TO_GPM;
  return decimals !== undefined ? val.toFixed(decimals) : val;
};

export const gpmToM3s = (gpm) => Number(gpm) * GPM_TO_M3S;

export const lminToM3h = (lmin, decimals = 2) => {
  if (lmin === null || lmin === undefined || isNaN(lmin)) return '0.00';
  const val = Number(lmin) * LMIN_TO_M3H;
  return decimals !== undefined ? val.toFixed(decimals) : val;
};

export const m3hToLmin = (m3h) => Number(m3h) * M3H_TO_LMIN;


// ==========================================
// TEMPERATURE CONVERTERS
// ==========================================
export const kToC = (k, decimals = 1) => {
  if (k === null || k === undefined || isNaN(k)) return '0.0';
  const val = Number(k) - 273.15;
  return decimals !== undefined ? val.toFixed(decimals) : val;
};

export const cToK = (c) => Number(c) + 273.15;

export const cToF = (c, decimals = 1) => {
  if (c === null || c === undefined || isNaN(c)) return '0.0';
  const val = Number(c) * 1.8 + 32;
  return decimals !== undefined ? val.toFixed(decimals) : val;
};

export const fToC = (f) => (Number(f) - 32) / 1.8;

export const kToF = (k, decimals = 1) => {
  if (k === null || k === undefined || isNaN(k)) return '0.0';
  const val = (Number(k) - 273.15) * 1.8 + 32;
  return decimals !== undefined ? val.toFixed(decimals) : val;
};

export const fToK = (f) => (Number(f) - 32) / 1.8 + 273.15;


// ==========================================
// POWER CONVERTERS
// ==========================================
export const kwToHp = (kw, decimals = 2) => {
  if (kw === null || kw === undefined || isNaN(kw)) return '0.00';
  const val = Number(kw) * KW_TO_HP;
  return decimals !== undefined ? val.toFixed(decimals) : val;
};

export const hpToKw = (hp) => Number(hp) * HP_TO_KW;

export const wToHp = (w, decimals = 2) => {
  if (w === null || w === undefined || isNaN(w)) return '0.00';
  const val = (Number(w) / 1000) * KW_TO_HP;
  return decimals !== undefined ? val.toFixed(decimals) : val;
};

export const hpToW = (hp) => Number(hp) * HP_TO_KW * 1000;


// ==========================================
// LENGTH, DIAMETER & ROUGHNESS CONVERTERS
// ==========================================
export const mmToM = (mm) => Number(mm) / 1000;
export const mToMm = (m, decimals = 2) => {
  if (m === null || m === undefined || isNaN(m)) return '0.00';
  const val = Number(m) * 1000;
  return decimals !== undefined ? val.toFixed(decimals) : val;
};

export const mToFt = (m, decimals = 2) => {
  if (m === null || m === undefined || isNaN(m)) return '0.00';
  const val = Number(m) * M_TO_FT;
  return decimals !== undefined ? val.toFixed(decimals) : val;
};

export const ftToM = (ft) => Number(ft) * FT_TO_M;

export const mmToIn = (mm, decimals = 3) => {
  if (mm === null || mm === undefined || isNaN(mm)) return '0.000';
  const val = Number(mm) * MM_TO_IN;
  return decimals !== undefined ? val.toFixed(decimals) : val;
};

export const inToMm = (inch) => Number(inch) * IN_TO_MM;

export const mToIn = (m, decimals = 3) => {
  if (m === null || m === undefined || isNaN(m)) return '0.000';
  const val = Number(m) * M_TO_IN;
  return decimals !== undefined ? val.toFixed(decimals) : val;
};

export const inToM = (inch) => Number(inch) * IN_TO_M;


// ==========================================
// VELOCITY CONVERTERS
// ==========================================
export const msToFts = (ms, decimals = 2) => {
  if (ms === null || ms === undefined || isNaN(ms)) return '0.00';
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
    pressureAbs: 'bar(a)',
    pressureDiff: 'bar(d)',
    flow: 'L/min',
    flowM3h: 'm³/h',
    temperature: '°C',
    temperatureAbs: 'K',
    power: 'kW',
    length: 'm',
    diameter: 'mm',
    diameterNps: 'in',
    roughness: 'm',
    velocity: 'm/s'
  },
  [UNIT_SYSTEMS.IMPERIAL]: {
    pressure: 'psi',
    pressureAbs: 'psi(a)',
    pressureDiff: 'psi(d)',
    flow: 'gpm',
    flowM3h: 'gpm',
    temperature: '°F',
    temperatureAbs: '°R',
    power: 'HP',
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

/**
 * Format a pressure value (given in bar) to the selected unit system.
 */
export const formatPressureFromBar = (valBar, unitSystem = UNIT_SYSTEMS.METRIC, decimals = 2) => {
  if (valBar === null || valBar === undefined || isNaN(valBar)) return '—';
  if (unitSystem === UNIT_SYSTEMS.IMPERIAL) {
    return barToPsi(valBar, decimals);
  }
  return Number(valBar).toFixed(decimals);
};

/**
 * Format a pressure value (given in Pa) to the selected unit system.
 */
export const formatPressureFromPa = (valPa, unitSystem = UNIT_SYSTEMS.METRIC, decimals = 2) => {
  if (valPa === null || valPa === undefined || isNaN(valPa)) return '—';
  if (unitSystem === UNIT_SYSTEMS.IMPERIAL) {
    return paToPsi(valPa, decimals);
  }
  return paToBar(valPa, decimals);
};

/**
 * Format a flow rate (given in L/min) to the selected unit system.
 */
export const formatFlowFromLmin = (valLmin, unitSystem = UNIT_SYSTEMS.METRIC, decimals = 1) => {
  if (valLmin === null || valLmin === undefined || isNaN(valLmin)) return '—';
  if (unitSystem === UNIT_SYSTEMS.IMPERIAL) {
    return lminToGpm(valLmin, decimals);
  }
  return Number(valLmin).toFixed(decimals);
};

/**
 * Format a flow rate (given in m³/s) to the selected unit system.
 */
export const formatFlowFromM3s = (valM3s, unitSystem = UNIT_SYSTEMS.METRIC, decimals = 1) => {
  if (valM3s === null || valM3s === undefined || isNaN(valM3s)) return '—';
  if (unitSystem === UNIT_SYSTEMS.IMPERIAL) {
    return m3sToGpm(valM3s, decimals);
  }
  return m3sToLmin(valM3s, decimals);
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
 * Format power (given in kW) to the selected unit system.
 */
export const formatPowerFromKw = (valKw, unitSystem = UNIT_SYSTEMS.METRIC, decimals = 2) => {
  if (valKw === null || valKw === undefined || isNaN(valKw)) return '—';
  if (unitSystem === UNIT_SYSTEMS.IMPERIAL) {
    return kwToHp(valKw, decimals);
  }
  return Number(valKw).toFixed(decimals);
};
