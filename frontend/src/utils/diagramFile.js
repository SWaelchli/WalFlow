import { FILE_FORMAT_VERSION, APP_VERSION } from '../constants';

// Simulation results live only in memory (per case). They are never written to files, drafts, cloud
// saves or solver messages (F2-22); a diagram is re-solved after loading.
export const CASE_RESULT_KEYS = ['telemetry', 'telemetry_unmitigated', 'telemetry_peak', 'kpis', 'stats', 'result_hash', '_scalingInfo'];
export const NODE_RUNTIME_KEYS = ['telemetry', 'onRotate', 'onChange', 'hasCaseOverrides'];
export const EDGE_RUNTIME_KEYS = ['telemetry'];

const omit = (obj, keys) => {
  if (!obj) return obj;
  const out = { ...obj };
  keys.forEach(k => { delete out[k]; });
  return out;
};

export const stripCaseResults = (c) => omit(c, CASE_RESULT_KEYS);
export const stripNodeRuntime = (n) => ({ ...n, data: omit(n.data, NODE_RUNTIME_KEYS) });
export const stripEdgeRuntime = (e) => ({ ...e, data: omit(e.data, EDGE_RUNTIME_KEYS) });

/** True if the case holds solver results. */
export const hasCaseResults = (c) => Boolean(c && (c.telemetry || c.kpis));

/** Nodes, edges and cases without results or runtime-only fields (what a file or solver message may carry). */
export const stripResults = ({ nodes = [], edges = [], cases = [] }) => ({
  nodes: nodes.map(stripNodeRuntime),
  edges: edges.map(stripEdgeRuntime),
  cases: cases.map(stripCaseResults),
});

/** Graph payload for the solver (WebSocket update/run, batch). */
export const toSolverGraph = ({ nodes, edges, globalSettings, cases, activeCaseId }) => {
  const clean = stripResults({ nodes, edges, cases });
  return {
    nodes: clean.nodes,
    edges: clean.edges,
    global_settings: globalSettings,
    cases: clean.cases,
    active_case_id: activeCaseId,
  };
};

/** Content of a .wlf file, a cloud save or a local draft (without results). */
export const serializeDiagram = ({ nodes, edges, globalSettings, cases, activeCaseId }, extra = {}) => {
  const clean = stripResults({ nodes, edges, cases });
  return {
    version: FILE_FORMAT_VERSION,
    app_version: APP_VERSION,
    format: 'walflow',
    created_at: new Date().toISOString(),
    active_case_id: activeCaseId,
    cases: clean.cases,
    nodes: clean.nodes,
    edges: clean.edges,
    globalSettings,
    ...extra,
  };
};

/**
 * F0-02: one version check for every load path (import, drop, example, cloud, project, draft).
 * Older formats are intentionally not converted. Returns an error message, or null when the file is accepted.
 */
export const checkFormatVersion = (data) => {
  const found = data && typeof data === 'object' && data.version != null ? String(data.version) : null;
  if (found === FILE_FORMAT_VERSION) return null;
  return `This file uses format ${found ?? 'unknown (no version)'}, but this version of WalFlow needs format ${FILE_FORMAT_VERSION}. `
    + 'Older files are not converted; please re-create the diagram or open it with a matching WalFlow release.';
};

const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * F2-10: structural check of a diagram before it reaches the canvas.
 * Returns a list of problems (empty when the diagram is usable).
 */
export const validateDiagramStructure = (data, knownNodeTypes = null) => {
  const problems = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return ['The file is not a WalFlow diagram (expected a JSON object).'];
  }
  if (!Array.isArray(data.nodes)) problems.push('"nodes" is missing or is not a list.');
  if (!Array.isArray(data.edges)) problems.push('"edges" is missing or is not a list.');
  if (problems.length) return problems;

  const ids = new Set();
  data.nodes.forEach((n, i) => {
    const where = `Node #${i + 1}`;
    if (!n || typeof n !== 'object') { problems.push(`${where} is not an object.`); return; }
    if (typeof n.id !== 'string' || !n.id) problems.push(`${where} has no id.`);
    else if (ids.has(n.id)) problems.push(`Node id "${n.id}" appears more than once.`);
    else ids.add(n.id);
    if (typeof n.type !== 'string') problems.push(`${where} (${n.id ?? '?'}) has no type.`);
    else if (knownNodeTypes && !knownNodeTypes.has(n.type)) problems.push(`${where} (${n.id ?? '?'}) has an unknown type "${n.type}".`);
    if (!n.position || !isFiniteNumber(n.position.x) || !isFiniteNumber(n.position.y)) {
      problems.push(`${where} (${n.id ?? '?'}) has no valid position.`);
    }
    if (n.data != null && (typeof n.data !== 'object' || Array.isArray(n.data))) {
      problems.push(`${where} (${n.id ?? '?'}) has invalid data.`);
    }
  });

  data.edges.forEach((e, i) => {
    const where = `Pipe #${i + 1}`;
    if (!e || typeof e !== 'object') { problems.push(`${where} is not an object.`); return; }
    if (!ids.has(e.source)) problems.push(`${where} (${e.id ?? '?'}) starts at an unknown component "${e.source}".`);
    if (!ids.has(e.target)) problems.push(`${where} (${e.id ?? '?'}) ends at an unknown component "${e.target}".`);
  });

  if (data.cases != null && !Array.isArray(data.cases)) problems.push('"cases" is not a list.');
  if (data.globalSettings != null && (typeof data.globalSettings !== 'object' || Array.isArray(data.globalSettings))) {
    problems.push('"globalSettings" is not an object.');
  }
  return problems;
};

/**
 * Combined gate for a diagram that is about to be loaded: format version first, then structure.
 * Returns { ok: true } or { ok: false, message }.
 */
export const checkDiagramFile = (data, knownNodeTypes = null) => {
  const versionError = checkFormatVersion(data);
  if (versionError) return { ok: false, message: versionError };
  const problems = validateDiagramStructure(data, knownNodeTypes);
  if (problems.length) {
    const shown = problems.slice(0, 5).map(p => `• ${p}`).join('\n');
    const more = problems.length > 5 ? `\n…and ${problems.length - 5} more.` : '';
    return { ok: false, message: `This file cannot be loaded:\n${shown}${more}` };
  }
  return { ok: true };
};
