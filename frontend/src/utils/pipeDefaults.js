/**
 * Default pipe data for new connections and display resolution for pipes
 * saved without catalog references (older files).
 */
import {
  DEFAULT_SCHEDULE_STANDARD,
  getScheduleBore,
  getScheduleDataset,
  isKnownScheduleStandard,
  equivalentSchedule,
  nearestListedDn
} from './pipe_schedules';

export const DEFAULT_PIPE_DN = 50;
export const DEFAULT_PIPE_SCH = 'STD';
export const DEFAULT_PIPE_LENGTH_M = 25.0;
export const DEFAULT_ROUGHNESS_MM = 0.045; // matches the solver fallback
// Bore of a new manual pipe when no schedule catalog is loaded (backend unreachable)
const FALLBACK_PIPE_ID_M = 0.05;

// Stored IDs within this tolerance of a catalog schedule count as that schedule
const ID_MATCH_TOLERANCE_MM = 0.05;

const classSizeToPipeData = (pc, size) => {
  const data = {
    pipe_class_id: pc.id,
    pipe_class_code: pc.code,
    ...sizeDimensions(size)
  };
  if (pc.roughness_mm !== undefined && pc.roughness_mm !== null) {
    data.roughness_mm = pc.roughness_mm;
  }
  return data;
};

const manualPipeData = (dn, sch) => {
  const s = getScheduleBore(dn, sch, DEFAULT_SCHEDULE_STANDARD);
  return {
    pipe_class_id: 'manual',
    pipe_class_code: 'CUSTOM',
    ...(s ? scheduleDimensions(s) : { diameter_m: FALLBACK_PIPE_ID_M }),
    roughness_mm: DEFAULT_ROUGHNESS_MM,
  };
};

// Dimensions only (what changes when the size of the current class or the schedule changes).
// The catalog of the class size is recorded so a switch to manual keeps the same wall series.
const sizeDimensions = (size) => ({
  schedule_standard_code: size.catalog || null,
  standardDn: size.dn,
  standardSch: size.sch || 'STD',
  outer_diameter_mm: size.od_mm,
  wall_thickness_mm: size.wt_mm,
  diameter_m: (size.od_mm - 2.0 * size.wt_mm) / 1000.0,
});

// Manual pipes also record which schedule standard their size and schedule refer to
function scheduleDimensions(s) {
  return {
    schedule_standard_code: s.standard,
    standardDn: s.dn,
    standardSch: s.sch,
    outer_diameter_mm: s.od_mm,
    wall_thickness_mm: s.wt_mm,
    diameter_m: s.id_mm / 1000.0,
  };
}

// Bore of a size in a schedule standard; a schedule the standard does not list maps to its counterpart
function scheduleBoreFor(dn, sch, code, options) {
  const mapped = equivalentSchedule(sch, code, dn, options);
  return mapped ? getScheduleBore(dn, mapped, code, options) : null;
}

// The pipe data changes below are shared by the inspector (PipeSelector) and the pipe table (DataList).
// Each returns the patch to apply to the pipe, or null when the choice cannot be applied.

/**
 * Switch to manual (custom) dimensions at the given size and schedule of a schedule catalog
 * (default ASME B36.10M); the nearest listed size is used when the catalog lacks the DN, and a schedule
 * it does not list maps to its counterpart. Roughness stays as it is. Null when no catalog is loaded.
 */
export function manualSelectionPatch(dn, sch, scheduleCode = DEFAULT_SCHEDULE_STANDARD, options) {
  const code = isKnownScheduleStandard(scheduleCode, options) ? scheduleCode : DEFAULT_SCHEDULE_STANDARD;
  const size = nearestListedDn(Number(dn) || DEFAULT_PIPE_DN, code, options);
  const s = scheduleBoreFor(size, sch || DEFAULT_PIPE_SCH, code, options)
    || getScheduleBore(DEFAULT_PIPE_DN, DEFAULT_PIPE_SCH, DEFAULT_SCHEDULE_STANDARD, options);
  return s ? { pipe_class_id: 'manual', pipe_class_code: 'CUSTOM', ...scheduleDimensions(s) } : null;
}

/** A pipe class was chosen: keep the current size when the class has it, otherwise the class's first size. */
export function classSelectionPatch(pc, currentDn) {
  if (!pc || !Array.isArray(pc.sizes) || pc.sizes.length === 0) return null;
  const size = pc.sizes.find(s => s.dn === currentDn) || pc.sizes[0];
  return classSizeToPipeData(pc, size);
}

/** A size of the current pipe class was chosen. */
export function classSizePatch(pc, dn) {
  const size = pc?.sizes?.find(s => s.dn === Number(dn));
  return size ? sizeDimensions(size) : null;
}

/** A size or schedule of a schedule standard was chosen (manual pipes). Null for a size the standard lacks. */
export function schedulePatch(dn, sch, scheduleCode = DEFAULT_SCHEDULE_STANDARD, options) {
  const s = scheduleBoreFor(dn, sch, scheduleCode, options);
  return s ? scheduleDimensions(s) : null;
}

/**
 * Pipe sizing for a newly connected hydraulic pipe: DN50 STD.
 * - First available pipe class, if it lists DN50.
 * - Otherwise manual ASME B36.10M DN50 STD (a 50 mm bore when no catalog is loaded).
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

// Preferred names when two schedules of a size share a bore (e.g. STD = 40)
const PREFERRED_SCHEDULES = ['STD', 'XS', 'Normal', 'Heavy'];

/**
 * Finds the size/schedule of a schedule standard (default ASME B36.10M) whose inner diameter matches `idMeters`.
 * Returns { dn, sch } or null when no schedule is within tolerance.
 */
export function matchScheduleByInnerDiameter(idMeters, scheduleCode = DEFAULT_SCHEDULE_STANDARD, options) {
  if (!(idMeters > 0)) return null;
  const idMm = idMeters * 1000.0;
  let best = null;
  let bestDiff = Infinity;
  for (const size of getScheduleDataset(scheduleCode, options)) {
    // Integer-like keys ("40", "80") iterate before "STD"; prefer STD/XS names on equal bores
    for (const [sch, s] of Object.entries(size.schedules)) {
      const diff = Math.abs(s.id_mm - idMm);
      const isTie = Math.abs(diff - bestDiff) < 1e-9;
      if ((diff < bestDiff && !isTie) || (isTie && PREFERRED_SCHEDULES.includes(sch))) {
        bestDiff = diff;
        best = { dn: size.dn, sch };
      }
    }
  }
  return bestDiff <= ID_MATCH_TOLERANCE_MM ? best : null;
}

/** DN whose normal-wall (STD / Normal) inner diameter is closest to `idMeters` (for select boxes). */
export function nearestDnByInnerDiameter(idMeters, scheduleCode = DEFAULT_SCHEDULE_STANDARD, options) {
  if (!(idMeters > 0)) return DEFAULT_PIPE_DN;
  const idMm = idMeters * 1000.0;
  let best = DEFAULT_PIPE_DN;
  let bestDiff = Infinity;
  for (const size of getScheduleDataset(scheduleCode, options)) {
    const std = size.schedules.STD || size.schedules['40'] || size.schedules.Normal;
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
 * The catalogue pipe class a pipe refers to, or null for manual / unknown references.
 * Matches the class id first, then its code (older files and examples stored the code).
 */
export function findPipeClass(pipeClasses, classId) {
  if (!classId || classId === 'manual') return null;
  const list = pipeClasses || [];
  return list.find(c => c.id === classId) || list.find(c => c.code === classId) || null;
}

/**
 * How a pipe's sizing is shown in the inspector and the DataList.
 * Pipes without a class reference show as Manual; pipes without a stored
 * DN show the matching schedule, or as a custom inner diameter. Never writes data.
 */
export function resolvePipeSelection(data = {}, options) {
  const classId = data.pipe_class_id || 'manual';
  const scheduleStandard = pipeScheduleStandard(data, options);
  if (data.standardDn) {
    return { classId, dn: Number(data.standardDn), sch: data.standardSch || 'STD', isCustomId: false, scheduleStandard };
  }
  const match = matchScheduleByInnerDiameter(data.diameter_m, scheduleStandard, options);
  if (match) {
    return { classId, dn: match.dn, sch: match.sch, isCustomId: false, scheduleStandard };
  }
  return { classId, dn: nearestDnByInnerDiameter(data.diameter_m, scheduleStandard, options), sch: null, isCustomId: true, scheduleStandard };
}

/** Schedule catalog a pipe's size refers to (files without one are ASME B36.10M). */
export function pipeScheduleStandard(data = {}, options) {
  const code = data.schedule_standard_code;
  return code && isKnownScheduleStandard(code, options) ? code : DEFAULT_SCHEDULE_STANDARD;
}
