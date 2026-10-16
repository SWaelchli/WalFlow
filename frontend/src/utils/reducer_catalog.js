import {
  ASME_B16_9_REDUCERS,
  DIN_EN_10253_2_REDUCERS
} from '../constants/asme_b16_9_data';
import { getScheduleBore, isKnownScheduleStandard, scheduleStandardForReducer } from './pipe_schedules';

export const DEFAULT_REDUCER_STANDARD = 'ASME_B16_9_REDUCERS';
export const CUSTOM_REDUCER_STANDARD = 'CUSTOM';

// Bundled fallbacks, used when the catalog API is unreachable.
const BUNDLED_REDUCER_STANDARDS = [
  { code: 'ASME_B16_9_REDUCERS', name: 'ASME B16.9 Buttweld Reducers', dimensions: ASME_B16_9_REDUCERS },
  { code: 'DIN_EN_10253_2_REDUCERS', name: 'DIN EN 10253-2 Buttweld Reducers', dimensions: DIN_EN_10253_2_REDUCERS }
];

// Diagrams saved before the fitting catalog existed store short codes.
const LEGACY_CODES = {
  ASME_B16_9: 'ASME_B16_9_REDUCERS',
  DIN_EN_10253_2: 'DIN_EN_10253_2_REDUCERS'
};

/** Maps a stored node `standard` value to a catalog code ('CUSTOM' stays as is). */
export function normalizeReducerStandard(code) {
  if (!code) return DEFAULT_REDUCER_STANDARD;
  return LEGACY_CODES[code] || code;
}

/** Catalog reducer standards (API first, bundled datasets for any code the API did not return). */
export function getReducerStandardOptions(apiStandards = []) {
  const options = apiStandards
    .filter(s => s.fitting_type === 'reducer' && Array.isArray(s.dimensions))
    .map(s => ({ code: s.code, name: s.name, dimensions: s.dimensions }));
  BUNDLED_REDUCER_STANDARDS.forEach(b => {
    if (!options.some(o => o.code === b.code)) options.push(b);
  });
  return options;
}

export function getReducerDataset(code, options) {
  const normalized = normalizeReducerStandard(code);
  const match = options.find(o => o.code === normalized);
  return match ? match.dimensions : [];
}

export function getLargeEndDns(dataset) {
  return Array.from(new Set(dataset.map(r => Number(r.dn_large)))).sort((a, b) => a - b);
}

export function getSmallEndDns(dataset, dnLarge) {
  return dataset
    .filter(r => Number(r.dn_large) === Number(dnLarge))
    .map(r => Number(r.dn_small))
    .sort((a, b) => b - a);
}

export function findReducerEntry(dataset, dnLarge, dnSmall) {
  return dataset.find(r => Number(r.dn_large) === Number(dnLarge) && Number(r.dn_small) === Number(dnSmall)) || null;
}

/** Included cone angle (deg) from the two bores and the fitting length. */
export function coneAngleFromGeometry(dLargeMm, dSmallMm, lengthMm) {
  if (!(lengthMm > 0) || !(dLargeMm > dSmallMm)) return 0;
  return 2 * Math.atan((dLargeMm - dSmallMm) / (2 * lengthMm)) * 180 / Math.PI;
}

/** Exact schedule lookup in a schedule standard (default ASME B36.10M) — no silent fallback to STD. */
export function getExactScheduleBore(dn, sch, scheduleCode, scheduleOptions) {
  return getScheduleBore(dn, sch, scheduleCode, scheduleOptions);
}

/**
 * Schedule standard for one reducer end: the line's pipe class standard when it has dimension data,
 * otherwise the one implied by the reducer standard (DIN EN reducers → DIN EN pipe dimensions).
 */
export function endScheduleStandard(pipeClass, reducerCode, scheduleOptions) {
  const classCode = pipeClass?.schedule_standard_code;
  if (classCode && isKnownScheduleStandard(classCode, scheduleOptions)) return classCode;
  return scheduleStandardForReducer(normalizeReducerStandard(reducerCode));
}

/** The pipe class assigned to a connected line, if any. */
export function getEdgePipeClass(edge, pipeClasses = []) {
  const classId = edge?.data?.pipe_class_id;
  if (!classId || classId === 'manual') return null;
  return pipeClasses.find(c => c.id === classId || c.code === classId) || null;
}

/**
 * Resolves the bore for a DN / schedule, preferring the connected line's pipe class
 * (exact wall thickness, e.g. 10S stainless) over the schedule standard `scheduleCode`.
 * Returns null when neither source knows the size — callers must warn, never guess.
 */
export function resolveBore(dn, sch, pipeClass, scheduleCode, scheduleOptions) {
  const classSize = pipeClass?.sizes?.find(s => Number(s.dn) === Number(dn));
  if (classSize && classSize.od_mm > 2 * classSize.wt_mm) {
    return {
      dn: Number(dn),
      nps: classSize.nps,
      od_mm: classSize.od_mm,
      wt_mm: classSize.wt_mm,
      id_mm: Number((classSize.od_mm - 2 * classSize.wt_mm).toFixed(3)),
      sch: classSize.sch || sch,
      source: pipeClass.code
    };
  }
  return getExactScheduleBore(dn, sch, scheduleCode, scheduleOptions);
}

/** Label for a DN option: NPS for ASME tables, plain DN for metric catalogs. */
export function formatDnOption(dn, entryNps) {
  if (entryNps && !String(entryNps).toUpperCase().startsWith('DN')) return `${entryNps}" (DN${dn})`;
  return `DN${dn}`;
}
