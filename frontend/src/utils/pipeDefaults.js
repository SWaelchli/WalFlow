/**
 * Default pipe data for new connections and display resolution for pipes
 * saved without catalog references (older files).
 */
import { ASME_B36_10M_SCHEDULES, getPipeScheduleDetails } from '../constants/asme_b16_9_data';

export const DEFAULT_PIPE_DN = 50;
export const DEFAULT_PIPE_SCH = 'STD';
export const DEFAULT_PIPE_LENGTH_M = 25.0;
export const DEFAULT_ROUGHNESS_MM = 0.045; // matches the solver fallback

// Stored IDs within this tolerance of a B36.10M schedule count as that schedule
const ID_MATCH_TOLERANCE_MM = 0.05;

const classSizeToPipeData = (pc, size) => {
  const data = {
    pipe_class_id: pc.id,
    pipe_class_code: pc.code,
    standardDn: size.dn,
    standardSch: size.sch || 'STD',
    outer_diameter_mm: size.od_mm,
    wall_thickness_mm: size.wt_mm,
    diameter: (size.od_mm - 2.0 * size.wt_mm) / 1000.0
  };
  if (pc.roughness_mm !== undefined && pc.roughness_mm !== null) {
    data.roughness_mm = pc.roughness_mm;
    data.roughness = pc.roughness_mm / 1000.0;
  }
  return data;
};

const manualPipeData = (dn, sch) => {
  const s = getPipeScheduleDetails(dn, sch);
  return {
    pipe_class_id: 'manual',
    pipe_class_code: 'CUSTOM',
    standardDn: s.dn,
    standardSch: s.sch,
    outer_diameter_mm: s.od_mm,
    wall_thickness_mm: s.wt_mm,
    diameter: s.id_mm / 1000.0,
    roughness_mm: DEFAULT_ROUGHNESS_MM,
    roughness: DEFAULT_ROUGHNESS_MM / 1000.0
  };
};

/**
 * Pipe sizing for a newly connected hydraulic pipe: DN50 STD.
 * - First available pipe class, if it lists DN50.
 * - Otherwise manual ASME B36.10M DN50 STD.
 * - If custom pipes are not allowed, the size closest to DN50 in the first class.
 */
export function getDefaultPipeData(pipeClasses = [], allowCustomPipes = true) {
  const firstClass = (pipeClasses || []).find(c => Array.isArray(c.sizes) && c.sizes.length > 0);
  if (firstClass) {
    const dn50 = firstClass.sizes.find(s => Number(s.dn) === DEFAULT_PIPE_DN);
    if (dn50) return classSizeToPipeData(firstClass, dn50);
    if (!allowCustomPipes) {
      const nearest = [...firstClass.sizes].sort(
        (a, b) => Math.abs(a.dn - DEFAULT_PIPE_DN) - Math.abs(b.dn - DEFAULT_PIPE_DN) || a.dn - b.dn
      )[0];
      return classSizeToPipeData(firstClass, nearest);
    }
  }
  return manualPipeData(DEFAULT_PIPE_DN, DEFAULT_PIPE_SCH);
}

/**
 * Finds the B36.10M size/schedule whose inner diameter matches `idMeters`.
 * Returns { dn, sch } or null when no schedule is within tolerance.
 */
export function matchScheduleByInnerDiameter(idMeters) {
  if (!(idMeters > 0)) return null;
  const idMm = idMeters * 1000.0;
  let best = null;
  let bestDiff = Infinity;
  for (const size of ASME_B36_10M_SCHEDULES) {
    // Integer-like keys ("40", "80") iterate before "STD"; prefer STD/XS names on equal bores
    for (const [sch, s] of Object.entries(size.schedules)) {
      const diff = Math.abs(s.id_mm - idMm);
      const isTie = Math.abs(diff - bestDiff) < 1e-9;
      if ((diff < bestDiff && !isTie) || (isTie && (sch === 'STD' || sch === 'XS'))) {
        bestDiff = diff;
        best = { dn: size.dn, sch };
      }
    }
  }
  return bestDiff <= ID_MATCH_TOLERANCE_MM ? best : null;
}

/** DN whose STD inner diameter is closest to `idMeters` (for select boxes). */
export function nearestDnByInnerDiameter(idMeters) {
  if (!(idMeters > 0)) return DEFAULT_PIPE_DN;
  const idMm = idMeters * 1000.0;
  let best = DEFAULT_PIPE_DN;
  let bestDiff = Infinity;
  for (const size of ASME_B36_10M_SCHEDULES) {
    const std = size.schedules.STD || size.schedules['40'];
    if (!std) continue;
    const diff = Math.abs(std.id_mm - idMm);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = size.dn;
    }
  }
  return best;
}

/**
 * How a pipe's sizing is shown in the inspector and the DataList.
 * Pipes without a class reference show as Manual; pipes without a stored
 * DN show the matching schedule, or as a custom inner diameter. Never writes data.
 */
export function resolvePipeSelection(data = {}) {
  const classId = data.pipe_class_id || 'manual';
  if (data.standardDn) {
    return { classId, dn: Number(data.standardDn), sch: data.standardSch || 'STD', isCustomId: false };
  }
  const match = matchScheduleByInnerDiameter(data.diameter);
  if (match) {
    return { classId, dn: match.dn, sch: match.sch, isCustomId: false };
  }
  return { classId, dn: nearestDnByInnerDiameter(data.diameter), sch: null, isCustomId: true };
}
