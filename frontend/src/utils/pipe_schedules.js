/**
 * Pipe schedule standards (catalog `pipe_schedule` fitting standards) and bore lookups.
 * API standards come first; the bundled ASME / DIN EN datasets cover any code the API did not return.
 */
import { ASME_B36_10M_SCHEDULES } from '../constants/asme_b16_9_data';
import { DIN_EN_PIPE_SCHEDULES } from '../constants/din_en_pipe_data';

export const ASME_SCHEDULE_STANDARD = 'ASME_B36_10M_SCHEDULES';
export const DIN_SCHEDULE_STANDARD = 'DIN_EN_PIPE_SCHEDULES';
export const DEFAULT_SCHEDULE_STANDARD = ASME_SCHEDULE_STANDARD;

const BUNDLED_SCHEDULE_STANDARDS = [
  { code: ASME_SCHEDULE_STANDARD, name: 'ASME B36.10M / B36.19M Pipe Schedules', dimensions: ASME_B36_10M_SCHEDULES },
  { code: DIN_SCHEDULE_STANDARD, name: 'DIN EN 10220 / EN ISO 1127 Pipe Dimensions', dimensions: DIN_EN_PIPE_SCHEDULES }
];

// Display order of the designations; others follow in catalog order
const SCHEDULE_ORDER = ['STD', '40', '80', 'XS', '160', 'Normal', 'Heavy', 'ISO 1127'];

// Default designation per standard (the normal wall)
const DEFAULT_SCHEDULES = { [ASME_SCHEDULE_STANDARD]: 'STD', [DIN_SCHEDULE_STANDARD]: 'Normal' };

// Nearest wall series in the other standard, for switching between ASME and DIN EN
const EQUIVALENT_SCHEDULES = {
  STD: 'Normal', '40': 'Normal', XS: 'Heavy', '80': 'Heavy', '160': 'Heavy', '10S': 'ISO 1127', '5S': 'ISO 1127',
  Normal: 'STD', Heavy: 'XS', 'ISO 1127': 'STD'
};

/** Catalog schedule standards (API first, bundled datasets for any code the API did not return). */
export function getScheduleStandardOptions(apiStandards = []) {
  const options = (apiStandards || [])
    .filter(s => s.fitting_type === 'pipe_schedule' && Array.isArray(s.dimensions))
    .map(s => ({ code: s.code, name: s.name, dimensions: s.dimensions }));
  BUNDLED_SCHEDULE_STANDARDS.forEach(b => {
    if (!options.some(o => o.code === b.code)) options.push(b);
  });
  return options;
}

const findStandard = (code, options) => (options || BUNDLED_SCHEDULE_STANDARDS).find(o => o.code === code)
  || BUNDLED_SCHEDULE_STANDARDS.find(o => o.code === code)
  || null;

/** True when the code names a schedule standard with dimension data (e.g. not 'CUSTOM'). */
export function isKnownScheduleStandard(code, options) {
  return !!findStandard(code, options);
}

/** Size rows of a schedule standard; unknown codes resolve to ASME B36.10M. */
export function getScheduleDataset(code, options) {
  return (findStandard(code, options) || findStandard(DEFAULT_SCHEDULE_STANDARD)).dimensions;
}

export function getScheduleStandardName(code, options) {
  return findStandard(code, options)?.name || code;
}

/** Schedule standard implied by a reducer fitting standard (DIN EN reducers sit on DIN EN pipe). */
export function scheduleStandardForReducer(reducerCode) {
  return String(reducerCode || '').startsWith('DIN_EN') ? DIN_SCHEDULE_STANDARD : ASME_SCHEDULE_STANDARD;
}

export function defaultScheduleFor(code) {
  return DEFAULT_SCHEDULES[code] || 'STD';
}

/** Schedule designations in the usual order (STD, 40, 80, XS, 160, Normal, Heavy, ISO 1127, then others). */
export function orderSchedules(keys) {
  return [...SCHEDULE_ORDER.filter(k => keys.includes(k)), ...keys.filter(k => !SCHEDULE_ORDER.includes(k))];
}

/** Designations a standard lists for a DN, in the usual order. Empty for unknown sizes. */
export function listSchedules(dn, code, options) {
  const size = getScheduleDataset(code, options).find(s => Number(s.dn) === Number(dn));
  return size ? orderSchedules(Object.keys(size.schedules || {})) : [];
}

/** Exact bore lookup for a DN and designation — no silent fallback to another schedule. */
export function getScheduleBore(dn, sch, code = DEFAULT_SCHEDULE_STANDARD, options) {
  const standard = findStandard(code, options) || findStandard(DEFAULT_SCHEDULE_STANDARD);
  const size = standard.dimensions.find(s => Number(s.dn) === Number(dn));
  const schObj = size?.schedules?.[sch];
  if (!size || !schObj) return null;
  return {
    dn: Number(size.dn),
    nps: size.nps,
    od_mm: size.od_mm,
    wt_mm: schObj.wt_mm,
    id_mm: schObj.id_mm,
    sch,
    standard: standard.code,
    source: standard.name
  };
}

/**
 * The designation to use for `sch` in standard `code` at a DN: `sch` itself when listed,
 * else its counterpart (STD ↔ Normal, XS ↔ Heavy, 10S ↔ ISO 1127), else the standard's default.
 * Returns null when the standard does not list the DN at all.
 */
export function equivalentSchedule(sch, code, dn, options) {
  const available = listSchedules(dn, code, options);
  if (available.length === 0) return null;
  if (available.includes(sch)) return sch;
  const counterpart = EQUIVALENT_SCHEDULES[sch];
  if (counterpart && available.includes(counterpart)) return counterpart;
  const fallback = defaultScheduleFor(code);
  return available.includes(fallback) ? fallback : available[0];
}

/** DN of a standard's dataset closest to `dn` (same DN when listed). */
export function nearestListedDn(dn, code, options) {
  const dns = getScheduleDataset(code, options).map(s => Number(s.dn));
  if (dns.length === 0) return Number(dn);
  return dns.reduce((best, d) => (Math.abs(d - dn) < Math.abs(best - dn) ? d : best), dns[0]);
}
