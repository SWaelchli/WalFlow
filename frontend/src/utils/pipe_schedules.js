/**
 * Pipe schedule catalogs (fitting standards of type `pipe_schedule`) and bore lookups.
 * The catalogs live only in the database: options come from the catalog API (`useFittingStandards`),
 * and helpers called without options use the rows already loaded into its cache.
 */
import { getCachedFittingStandards } from '../hooks/useFittingStandards';

export const ASME_SCHEDULE_STANDARD = 'ASME_B36_10M_SCHEDULES';
export const ASME_STAINLESS_SCHEDULE_STANDARD = 'ASME_B36_19M_SCHEDULES';
export const DIN_SCHEDULE_STANDARD = 'DIN_EN_PIPE_SCHEDULES';
export const DEFAULT_SCHEDULE_STANDARD = ASME_SCHEDULE_STANDARD;

// Display order of the designations; others follow in catalog order
const SCHEDULE_ORDER = [
  'STD', '10', '20', '30', '40', '60', '80', 'XS', '160',
  '5S', '10S', '40S', '80S',
  'Normal', 'Heavy', 'ISO 1127'
];

// Default designation per standard (the normal wall)
const DEFAULT_SCHEDULES = {
  [ASME_SCHEDULE_STANDARD]: 'STD',
  [ASME_STAINLESS_SCHEDULE_STANDARD]: '10S',
  [DIN_SCHEDULE_STANDARD]: 'Normal'
};

// Nearest wall series in the other standards, in order of preference, for switching standards
const EQUIVALENT_SCHEDULES = {
  STD: ['Normal', '40S'], '40': ['Normal', '40S'], XS: ['Heavy', '80S'], '80': ['Heavy', '80S'], '160': ['Heavy'],
  '5S': ['ISO 1127'], '10S': ['ISO 1127'], '40S': ['40', 'STD', 'Normal'], '80S': ['80', 'XS', 'Heavy'],
  Normal: ['STD', '40S'], Heavy: ['XS', '80S'], 'ISO 1127': ['10S', 'STD']
};

/** Display name of a schedule designation, as the catalog view shows it: '40' → 'Sch 40', '10S' → 'Sch 10S', 'STD' stays. */
export function scheduleLabel(sch) {
  if (sch === null || sch === undefined || sch === '') return '—';
  return /^\d/.test(String(sch)) ? `Sch ${sch}` : String(sch);
}

/** Pipe schedule catalogs of the API rows (`useFittingStandards('pipe_schedule')`). */
export function getScheduleStandardOptions(apiStandards = []) {
  return (apiStandards || [])
    .filter(s => s.fitting_type === 'pipe_schedule' && Array.isArray(s.dimensions))
    .map(s => ({ code: s.code, name: s.name, dimensions: s.dimensions }));
}

const loadedOptions = () => getScheduleStandardOptions(getCachedFittingStandards('pipe_schedule'));

const findStandard = (code, options) => (options || loadedOptions()).find(o => o.code === code) || null;

/** True when the catalog with this code is loaded. */
export function isKnownScheduleStandard(code, options) {
  return !!findStandard(code, options);
}

/** Size rows of a schedule catalog; [] when it is not loaded. */
export function getScheduleDataset(code, options) {
  return findStandard(code, options)?.dimensions || [];
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

/** Designations a catalog lists for a DN, in the usual order. Empty for unknown sizes. */
export function listSchedules(dn, code, options) {
  const size = getScheduleDataset(code, options).find(s => Number(s.dn) === Number(dn));
  return size ? orderSchedules(Object.keys(size.schedules || {})) : [];
}

/** Exact bore lookup for a DN and designation — no silent fallback to another schedule or catalog. */
export function getScheduleBore(dn, sch, code = DEFAULT_SCHEDULE_STANDARD, options) {
  const standard = findStandard(code, options);
  const size = standard?.dimensions.find(s => Number(s.dn) === Number(dn));
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
 * The designation to use for `sch` in catalog `code` at a DN: `sch` itself when listed,
 * else its first listed counterpart (STD ↔ Normal, XS ↔ Heavy, 10S ↔ ISO 1127, 40S → 40), else the
 * catalog's default. Returns null when the catalog does not list the DN at all.
 */
export function equivalentSchedule(sch, code, dn, options) {
  const available = listSchedules(dn, code, options);
  if (available.length === 0) return null;
  if (available.includes(sch)) return sch;
  const counterpart = (EQUIVALENT_SCHEDULES[sch] || []).find(c => available.includes(c));
  if (counterpart) return counterpart;
  const fallback = defaultScheduleFor(code);
  return available.includes(fallback) ? fallback : available[0];
}

/** DNs listed by any of the catalogs, ascending. */
export function catalogDns(codes, options) {
  const dns = new Set();
  (codes || []).forEach(code => getScheduleDataset(code, options).forEach(r => dns.add(Number(r.dn))));
  return [...dns].sort((a, b) => a - b);
}

/**
 * Schedules a pipe class may use at a DN, one group per selected catalog that lists the DN:
 * [{ code, name, schedules: ['5S', '10S', …] }]. Only the class's own catalogs are offered.
 */
export function classScheduleChoices(dn, codes, options) {
  return (codes || [])
    .map(code => ({ code, name: getScheduleStandardName(code, options), schedules: listSchedules(dn, code, options) }))
    .filter(group => group.schedules.length > 0);
}

/** DN of a catalog's dataset closest to `dn` (same DN when listed). */
export function nearestListedDn(dn, code, options) {
  const dns = getScheduleDataset(code, options).map(s => Number(s.dn));
  if (dns.length === 0) return Number(dn);
  return dns.reduce((best, d) => (Math.abs(d - dn) < Math.abs(best - dn) ? d : best), dns[0]);
}

/** Schedule catalog codes a pipe class selects, default first (older API rows carry one code). */
export function classScheduleCodes(pipeClass) {
  if (!pipeClass) return [];
  if (Array.isArray(pipeClass.schedule_standard_codes) && pipeClass.schedule_standard_codes.length) return pipeClass.schedule_standard_codes;
  return pipeClass.schedule_standard_code ? [pipeClass.schedule_standard_code] : [];
}

/** Reducer catalog codes a pipe class selects, default first. */
export function classReducerCodes(pipeClass) {
  if (!pipeClass) return [];
  if (Array.isArray(pipeClass.reducer_standard_codes) && pipeClass.reducer_standard_codes.length) return pipeClass.reducer_standard_codes;
  return pipeClass.reducer_standard_code ? [pipeClass.reducer_standard_code] : [];
}
