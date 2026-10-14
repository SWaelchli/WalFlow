// F2-07: results are stored per case together with a hash of the inputs they were solved from.
// When the current inputs hash differently, the results are labelled as out of date.

// Fields that do not influence the solution (appearance, notes, display units, runtime callbacks).
const IGNORED_DATA_KEYS = new Set([
  'telemetry', 'onRotate', 'onChange', 'hasCaseOverrides', 'rotation', 'label',
  'title', 'text', 'fontSize',
]);
const IGNORED_NODE_TYPES = new Set(['text_bubble', 'note']);
const IGNORED_GLOBAL_KEYS = new Set(['unit_system']);

const stableStringify = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).filter(k => typeof value[k] !== 'function' && value[k] !== undefined).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
};

// cyrb53: small non-cryptographic 53-bit string hash
const hashString = (str) => {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
};

const pickData = (data, ignored) => {
  const out = {};
  Object.keys(data || {}).forEach(k => { if (!ignored.has(k)) out[k] = data[k]; });
  return out;
};

/** Hash of everything the solver sees for one case: components, pipes, global settings and that case's overrides. */
export const computeCaseInputHash = ({ nodes = [], edges = [], globalSettings = {}, cases = [] }, caseId) => {
  const c = cases.find(x => x.id === caseId);
  const payload = {
    n: nodes
      .filter(n => !IGNORED_NODE_TYPES.has(n.type))
      .map(n => [n.id, n.type, pickData(n.data, IGNORED_DATA_KEYS)]),
    e: edges.map(e => [e.id, e.source, e.target, e.sourceHandle ?? null, e.targetHandle ?? null, pickData(e.data, IGNORED_DATA_KEYS)]),
    g: pickData(globalSettings, IGNORED_GLOBAL_KEYS),
    o: c && !c.is_base ? (c.overrides || null) : null,
  };
  return hashString(stableStringify(payload));
};

/** { [caseId]: hash } for every case. */
export const computeCaseInputHashes = (graph) => {
  const out = {};
  (graph.cases || []).forEach(c => { out[c.id] = computeCaseInputHash(graph, c.id); });
  return out;
};

/** A case holds results that were solved from other inputs than the current ones. */
export const isCaseResultStale = (c, currentHashes) => {
  if (!c || !(c.telemetry || c.kpis)) return false;
  return c.result_hash !== currentHashes?.[c.id];
};
