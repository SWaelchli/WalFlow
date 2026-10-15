// F2-28 / F2-22: cheap "did anything real change?" keys for the diagram.
//
// React Flow replaces a node object on every drag frame and selection change, so effects that depend on
// `nodes` run constantly. These keys change only when content the consumer cares about changes: the solver
// message ignores positions and selection, the saved file ignores selection only. Each node, edge and case is
// stringified once per object (WeakMap), so a drag frame costs one node, not the whole diagram.
import { stableStringify } from './resultHash';
import { NODE_RUNTIME_KEYS, EDGE_RUNTIME_KEYS, CASE_RESULT_KEYS } from './diagramFile';

// React Flow bookkeeping that is not part of the diagram
const NODE_VIEW_KEYS = ['selected', 'dragging', 'measured', 'width', 'height', 'positionAbsolute', 'resizing'];
const EDGE_VIEW_KEYS = ['selected'];

const omit = (obj, keys) => {
  if (!obj) return obj;
  const out = {};
  Object.keys(obj).forEach((k) => { if (!keys.includes(k)) out[k] = obj[k]; });
  return out;
};

const cache = (store, key, build) => {
  let value = store.get(key);
  if (value === undefined) {
    value = build(key);
    store.set(key, value);
  }
  return value;
};

const solverNodes = new WeakMap();
const solverEdges = new WeakMap();
const fileNodes = new WeakMap();
const fileEdges = new WeakMap();
const cases = new WeakMap();

const caseSig = (c) => cache(cases, c, () => stableStringify(omit(c, CASE_RESULT_KEYS)));
const settingsSig = (g) => stableStringify(g || {});

// Components and pipes as the solver sees them: no position, selection, results or runtime callbacks
const solverNodeSig = (n) => cache(solverNodes, n, () => stableStringify([n.id, n.type, omit(n.data, NODE_RUNTIME_KEYS)]));
const solverEdgeSig = (e) => cache(solverEdges, e, () => stableStringify([
  e.id, e.source, e.target, e.sourceHandle ?? null, e.targetHandle ?? null, omit(e.data, EDGE_RUNTIME_KEYS),
]));

// Components and pipes as saved in a file or draft: everything but selection and measuring
const fileNodeSig = (n) => cache(fileNodes, n, () => stableStringify({ ...omit(n, NODE_VIEW_KEYS), data: omit(n.data, NODE_RUNTIME_KEYS) }));
const fileEdgeSig = (e) => cache(fileEdges, e, () => stableStringify({ ...omit(e, EDGE_VIEW_KEYS), data: omit(e.data, EDGE_RUNTIME_KEYS) }));

const join = (parts) => parts.join('\u0001');

/** Changes when the solver message (graph, settings, cases, active case) changes; not on drag or selection. */
export const solverMessageKey = ({ nodes = [], edges = [], globalSettings, cases: caseList = [], activeCaseId }) => join([
  join(nodes.map(solverNodeSig)),
  join(edges.map(solverEdgeSig)),
  settingsSig(globalSettings),
  join(caseList.map(caseSig)),
  String(activeCaseId),
]);

/** Changes when what a save would write changes (layout included); not on selection, results or measuring. */
export const persistKey = ({ nodes = [], edges = [], globalSettings, cases: caseList = [], activeCaseId }) => join([
  join(nodes.map(fileNodeSig)),
  join(edges.map(fileEdgeSig)),
  settingsSig(globalSettings),
  join(caseList.map(caseSig)),
  String(activeCaseId),
]);

