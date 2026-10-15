// F3-04 / F2-19: checks a drawing before it is sent to the solver.
// Errors block the run; warnings let it run but are listed so the user can look at them.

const single = { inlets: ['inlet-0'], outlets: ['outlet-0'] };

/** Hydraulic ports per component type (handle ids as rendered by the node components). */
export const PORTS_BY_TYPE = {
  tank: single,
  pump: single,
  centrifugal_pump: single,
  volumetric_pump: single,
  orifice: single,
  linear_control_valve: single,
  remote_control_valve: single,
  check_valve: single,
  check_valve_orifice: single,
  pressure_safety_valve: single,
  psv: single,
  rupture_disc: single,
  linear_regulator: single,
  filter: single,
  heat_exchanger: single,
  calibrated_restriction: single,
  reducer: single,
  expander: single,
  pressure_source: single,
  flow_source: { inlets: [], outlets: ['outlet-0'] },
  splitter: { inlets: ['inlet-0'], outlets: ['outlet-0', 'outlet-1'] },
  mixer: { inlets: ['inlet-0', 'inlet-1'], outlets: ['outlet-0'] },
  three_way_tcv: { inlets: ['inlet-0', 'inlet-1'], outlets: ['outlet-0'] },
  text_bubble: { inlets: [], outlets: [] },
};

// Boundaries fix a pressure or a flow; an unused port on them is normal.
const BOUNDARY_TYPES = new Set(['tank', 'pressure_source', 'flow_source']);
// Relief devices may discharge to atmosphere, so an unconnected outlet is not reported.
const VENTING_TYPES = new Set(['pressure_safety_valve', 'psv', 'rupture_disc']);
const NOTE_TYPES = new Set(['text_bubble']);

export const ERROR_CODES = ['empty_drawing', 'unknown_type', 'unknown_endpoint', 'invalid_port', 'port_shared'];

const isSignalEdge = (e) => String(e?.data?.type ?? '').toUpperCase() === 'SIGNAL'
  || String(e?.sourceHandle ?? '').startsWith('signal-')
  || String(e?.targetHandle ?? '').startsWith('signal-');

const nodeName = (n) => String(n?.data?.label || n?.data?.tag || n?.id || 'component');
const edgeName = (e) => String(e?.data?.label || e?.label || e?.id || 'pipe');
const portName = (handle) => String(handle ?? '').replace('-', ' ');

export const PORT_TAKEN_MESSAGE = 'This port already has a pipe. Use a splitter or mixer to branch a line.';

/**
 * Rule for a new hydraulic connection (F2-19): one pipe per port. Signal links are not restricted.
 * @returns {{ok: boolean, message?: string}}
 */
export function checkNewConnection(edges, { source, target, sourceHandle, targetHandle }) {
  if (String(sourceHandle ?? '').startsWith('signal-') || String(targetHandle ?? '').startsWith('signal-')) return { ok: true };
  const taken = edges.some((e) => !isSignalEdge(e) && (
    (e.source === source && (e.sourceHandle || 'outlet-0') === (sourceHandle || 'outlet-0'))
    || (e.target === target && (e.targetHandle || 'inlet-0') === (targetHandle || 'inlet-0'))
  ));
  return taken ? { ok: false, message: PORT_TAKEN_MESSAGE } : { ok: true };
}

/**
 * @param {{nodes: object[], edges: object[]}} diagram
 * @param {Set<string>|null} knownTypes node types the canvas can render (null skips the check)
 * @returns {{errors: object[], warnings: object[]}} findings `{ code, severity, message, nodeIds, edgeIds }`
 */
export function validateNetwork({ nodes = [], edges = [] }, knownTypes = null) {
  const errors = [];
  const warnings = [];
  const add = (list, severity, code, message, nodeIds = [], edgeIds = []) => {
    list.push({ code, severity, message, nodeIds, edgeIds });
  };

  const components = nodes.filter(n => !NOTE_TYPES.has(n.type));
  if (components.length === 0) {
    add(errors, 'error', 'empty_drawing', 'The drawing has no components. Drag components from the library onto the canvas first.');
    return { errors, warnings };
  }

  const byId = new Map(nodes.map(n => [n.id, n]));
  const usable = new Set(); // nodes whose type is known; port checks only make sense for these
  components.forEach((n) => {
    if (!PORTS_BY_TYPE[n.type] || (knownTypes && !knownTypes.has(n.type))) {
      add(errors, 'error', 'unknown_type', `${nodeName(n)} has an unknown component type "${n.type}". Replace or delete it.`, [n.id]);
    } else {
      usable.add(n.id);
    }
  });

  const hydraulic = edges.filter(e => !isSignalEdge(e));
  const portUse = new Map(); // "nodeId|handle" -> edges using that port
  const useOf = (nodeId, handle) => {
    const key = `${nodeId}|${handle ?? ''}`;
    if (!portUse.has(key)) portUse.set(key, []);
    return portUse.get(key);
  };

  hydraulic.forEach((e) => {
    const src = byId.get(e.source);
    const tgt = byId.get(e.target);
    if (!src || !tgt) {
      add(errors, 'error', 'unknown_endpoint', `${edgeName(e)} is attached to a component that no longer exists.`, [], [e.id]);
      return;
    }
    const ends = [
      { node: src, handle: e.sourceHandle || 'outlet-0', dir: 'outlets' },
      { node: tgt, handle: e.targetHandle || 'inlet-0', dir: 'inlets' },
    ];
    ends.forEach(({ node, handle, dir }) => {
      if (!usable.has(node.id)) return;
      if (!PORTS_BY_TYPE[node.type][dir].includes(handle)) {
        add(errors, 'error', 'invalid_port',
          `${edgeName(e)} uses port "${handle}" which ${nodeName(node)} does not have.`, [node.id], [e.id]);
        return;
      }
      useOf(node.id, handle).push(e);
    });
  });

  portUse.forEach((list, key) => {
    if (list.length < 2) return;
    const [nodeId, handle] = key.split('|');
    const node = byId.get(nodeId);
    add(errors, 'error', 'port_shared',
      `${list.length} pipes are attached to ${portName(handle)} of ${nodeName(node)}. A port takes one pipe; use a splitter or mixer to branch.`,
      [nodeId], list.map(e => e.id));
  });

  // Warnings: open ports, self-loops, isolated nodes, groups without a pressure or flow boundary
  hydraulic.forEach((e) => {
    if (e.source === e.target && usable.has(e.source)) {
      add(warnings, 'warning', 'self_loop',
        `${edgeName(e)} connects ${nodeName(byId.get(e.source))} to itself. This recirculation loop is solved, but is usually a mistake.`,
        [e.source], [e.id]);
    }
  });

  const connectedNodes = new Set();
  hydraulic.forEach((e) => { connectedNodes.add(e.source); connectedNodes.add(e.target); });

  components.forEach((n) => {
    if (!usable.has(n.id)) return;
    const ports = PORTS_BY_TYPE[n.type];
    const used = [...ports.inlets, ...ports.outlets].filter(h => (portUse.get(`${n.id}|${h}`) || []).length > 0);
    if (used.length === 0) {
      add(warnings, 'warning', 'isolated_node', `${nodeName(n)} is not connected to anything and is ignored by the solver.`, [n.id]);
      return;
    }
    if (BOUNDARY_TYPES.has(n.type)) return;
    const outlets = VENTING_TYPES.has(n.type) ? [] : ports.outlets;
    const open = [...ports.inlets, ...outlets].filter(h => !(portUse.get(`${n.id}|${h}`) || []).length);
    if (open.length) {
      add(warnings, 'warning', 'open_port',
        `${nodeName(n)}: ${open.map(portName).join(', ')} ${open.length > 1 ? 'are' : 'is'} not connected and is treated as a closed end.`, [n.id]);
    }
  });

  // Groups of connected components need at least one boundary that fixes pressure or flow
  const parent = new Map([...usable].map(id => [id, id]));
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  hydraulic.forEach((e) => {
    if (usable.has(e.source) && usable.has(e.target)) parent.set(find(e.source), find(e.target));
  });
  const groups = new Map();
  [...usable].filter(id => connectedNodes.has(id)).forEach((id) => {
    const root = find(id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(id);
  });
  groups.forEach((ids) => {
    if (!ids.some(id => BOUNDARY_TYPES.has(byId.get(id).type))) {
      add(warnings, 'warning', 'no_boundary',
        'A group of connected components has no tank, pressure source or flow source, so it has no pressure reference and cannot be solved meaningfully.', ids);
    }
  });

  return { errors, warnings };
}
