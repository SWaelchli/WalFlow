import { portTitle, portNumberLabel } from './portLabels';
import { junctionPortCount, junctionPortIds, MIN_JUNCTION_PORTS, MAX_JUNCTION_PORTS } from './junctionLayout';
import { boundaryPortCount, BOUNDARY_PORT_TYPES, MIN_BOUNDARY_PORTS, MAX_BOUNDARY_PORTS } from './boundaryLayout';

// Checks a drawing before it is sent to the solver.
// Errors block the run; warnings let it run but are listed so the user can look at them.

const single = { inlets: ['inlet-0'], outlets: ['outlet-0'] };
// Neutral ports: a pipe may run in either direction (see NEUTRAL_TYPES)
const TWO_PORT = { inlets: [], outlets: [], either: ['port-0', 'port-1'] };

/** Hydraulic ports per component type (handle ids as rendered by the node components). */
export const PORTS_BY_TYPE = {
  tank: { inlets: [], outlets: [], either: junctionPortIds(1) },
  pump: single,
  centrifugal_pump: single,
  volumetric_pump: single,
  orifice: TWO_PORT,
  linear_control_valve: single,
  remote_control_valve: single,
  check_valve: single,
  check_valve_orifice: single,
  pressure_safety_valve: single,
  psv: single,
  rupture_disc: single,
  linear_regulator: single,
  filter: TWO_PORT,
  heat_exchanger: single,
  calibrated_restriction: TWO_PORT,
  reducer: single,
  expander: single,
  // Boundaries: 1 to 8 neutral ports following data.num_ports (see portsOf)
  pressure_boundary: { inlets: [], outlets: [], either: junctionPortIds(1) },
  flow_boundary: { inlets: [], outlets: [], either: junctionPortIds(1) },
  // `either` ports take a pipe running in either direction; the count follows data.num_ports (see portsOf)
  junction: { inlets: [], outlets: [], either: junctionPortIds(3) },
  measure_point: TWO_PORT,
  three_way_tcv: { inlets: ['inlet-0', 'inlet-1'], outlets: ['outlet-0'] },
  text_bubble: { inlets: [], outlets: [] },
  instrument: { inlets: [], outlets: [] },
};

// Boundaries fix a pressure or a flow; an unused port on them is normal.
const BOUNDARY_TYPES = new Set(['tank', 'pressure_boundary', 'flow_boundary']);
// Relief devices may discharge to atmosphere, so an unconnected outlet is not reported.
const VENTING_TYPES = new Set(['pressure_safety_valve', 'psv', 'rupture_disc']);
// Not part of the hydraulic network: notes, and instrument bubbles (they only read results)
const NOTE_TYPES = new Set(['text_bubble', 'instrument']);

/** Ports of one node: PORTS_BY_TYPE, with the port count of a junction or boundary taken from its data. */
export const portsOf = (node) => {
  if (BOUNDARY_PORT_TYPES.has(node?.type)) return { inlets: [], outlets: [], either: junctionPortIds(boundaryPortCount(node.data)) };
  if (node?.type === 'junction') return { inlets: [], outlets: [], either: junctionPortIds(junctionPortCount(node.data)) };
  return { either: [], ...PORTS_BY_TYPE[node?.type] };
};

export const ERROR_CODES = ['empty_drawing', 'unknown_type', 'unknown_endpoint', 'invalid_port', 'port_shared', 'invalid_num_ports', 'flow_split_port_open', 'flow_boundary_direction'];

const isSignalEdge = (e) => String(e?.data?.type ?? '').toUpperCase() === 'SIGNAL'
  || String(e?.sourceHandle ?? '').startsWith('signal-')
  || String(e?.targetHandle ?? '').startsWith('signal-');

const nodeName = (n) => String(n?.data?.label || n?.data?.tag || n?.id || 'component');
const edgeName = (e) => String(e?.data?.label || e?.label || e?.id || 'pipe');
// Junction ports are shown 1-based, as in the rest of the UI ("port-2" -> "Port 3")
const portName = (handle) => (/^port-\d+$/.test(String(handle ?? '')) ? portTitle(null, handle) : String(handle ?? '').replace('-', ' '));

// Python float() rejects hex/binary/octal text that Number() would read
const PLAIN_DECIMAL = /^\s*[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?\s*$/i;

/** True when num_ports is missing or a whole number min..max (default 3..8 of a junction; a numeric string such as "4" counts, as in the solver). */
export const validPortCount = (raw, min = MIN_JUNCTION_PORTS, max = MAX_JUNCTION_PORTS) => {
  if (raw === undefined) return true;
  if (typeof raw === 'string' ? !PLAIN_DECIMAL.test(raw) : typeof raw !== 'number') return false;
  const n = Number(raw);
  return Number.isInteger(n) && n >= min && n <= max;
};

export const PORT_TAKEN_MESSAGE = 'This port already has a pipe. Use a junction to branch a line.';

const isSignalHandle = (h) => String(h ?? '').startsWith('signal-');
const SIGNAL_INPUTS = new Set(['signal-in', 'signal-in-ref']);

// Components whose two ports (port-0, port-1) have no role: which side is upstream follows from the solved flow
export const NEUTRAL_TYPES = new Set(['orifice', 'calibrated_restriction', 'filter', 'measure_point']);

export const SAME_ROLE_MESSAGE = 'Two outlets (or two inlets) cannot be joined: a line runs from an outlet to an inlet.';

/** True for a port that looks neutral: a port of a junction, a boundary or a neutral component. */
export const isNeutralPort = (node, handle) => (node?.type === 'junction' || BOUNDARY_PORT_TYPES.has(node?.type) || NEUTRAL_TYPES.has(node?.type)) && /^port-\d+$/.test(String(handle ?? ''));

/** 'inlet' | 'outlet' for a role port, null for a neutral port or an unknown handle. */
const roleOf = (node, handle) => {
  // A flow boundary looks neutral but is stored by its direction: a supply is the pipe source, a draw the target
  if (node?.type === 'flow_boundary' && /^port-\d+$/.test(String(handle ?? ''))) return node.data?.flow_direction === 'draw' ? 'inlet' : 'outlet';
  if (isNeutralPort(node, handle)) return null;
  const h = String(handle ?? '');
  return h.startsWith('outlet-') ? 'outlet' : h.startsWith('inlet-') ? 'inlet' : null;
};
const isHydraulicHandle = (h) => /^(inlet|outlet|port)-\d+$/.test(String(h ?? ''));

/**
 * Direction of a connection the canvas reports (it runs in loose mode so any port connects either way).
 * Any two hydraulic ports may be joined except two ports of the same role (outlet-outlet, inlet-inlet).
 * A role port decides the stored direction (a role outlet is the source, a role inlet the target; a drag the other
 * way is swapped); a flow boundary counts as an outlet when it supplies and as an inlet when it draws.
 * Between two neutral ports the pipe is kept as drawn. A signal line runs from a sensing pin
 * to a `signal-in*` input.
 * @param {object[]} nodes
 * @returns {{ok: boolean, connection?: object, message?: string}} the connection to store, or ok false (with the reason, if known)
 */
export function normalizeConnection(nodes, conn) {
  const { source, target, sourceHandle, targetHandle } = conn || {};
  if (!source || !target || source === target && sourceHandle === targetHandle) return { ok: false };
  const sSig = isSignalHandle(sourceHandle);
  const tSig = isSignalHandle(targetHandle);
  if (sSig || tSig) {
    if (!(sSig && tSig)) return { ok: false };
    let connection = null;
    if (SIGNAL_INPUTS.has(sourceHandle) && !SIGNAL_INPUTS.has(targetHandle)) {
      connection = { source: target, target: source, sourceHandle: targetHandle, targetHandle: sourceHandle };
    } else if (SIGNAL_INPUTS.has(targetHandle) && !SIGNAL_INPUTS.has(sourceHandle)) {
      connection = conn;
    }
    if (!connection) return { ok: false };
    return { ok: true, connection };
  }
  if (!isHydraulicHandle(sourceHandle) || !isHydraulicHandle(targetHandle)) return { ok: false };
  const byId = new Map(nodes.map(n => [n.id, n]));
  const rs = roleOf(byId.get(source), sourceHandle);
  const rt = roleOf(byId.get(target), targetHandle);
  if (rs && rs === rt) return { ok: false, message: SAME_ROLE_MESSAGE };
  const swapped = { source: target, target: source, sourceHandle: targetHandle, targetHandle: sourceHandle };
  return { ok: true, connection: rs === 'inlet' || rt === 'outlet' ? swapped : conn };
}

/**
 * Turns every hydraulic pipe on a node around (source and target, with their handles). Signal lines are kept.
 * Used when a flow boundary changes between supply and draw.
 */
export function flipBoundaryEdges(edges, nodeId) {
  return edges.map((e) => {
    if (isSignalEdge(e) || (e.source !== nodeId && e.target !== nodeId)) return e;
    // Results of a turned pipe (inlet and outlet values) would show swapped, so they are dropped until the next run
    const { telemetry: _telemetry, ...data } = e.data || {};
    return { ...e, data, source: e.target, target: e.source, sourceHandle: e.targetHandle, targetHandle: e.sourceHandle };
  });
}

/**
 * Message when turning the pipes of a flow boundary around would put a pipe on a role port (a pump inlet, a valve
 * outlet ...), whose direction is fixed; null when the change is possible.
 * @param {string} newDirection 'supply' | 'draw'
 */
export function flipBlockedMessage(nodes, edges, nodeId, newDirection) {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const self = byId.get(nodeId);
  for (const e of edges) {
    if (isSignalEdge(e) || e.source === e.target) continue;
    const source = e.source === nodeId;
    if (!source && e.target !== nodeId) continue;
    const far = byId.get(source ? e.target : e.source);
    const farHandle = source ? e.targetHandle : e.sourceHandle;
    const role = roleOf(far, farHandle);
    if (!role) continue;
    const verb = source ? 'feeds' : 'is fed by';
    return `Cannot switch '${nodeName(self)}' to ${newDirection}: its pipe ${verb} the ${role} of '${nodeName(far)}'. Reconnect it first.`;
  }
  return null;
}

/**
 * Rule for a new hydraulic connection: one pipe per port, a junction port counting at either end of a pipe.
 * Signal links are not restricted.
 * @returns {{ok: boolean, message?: string}}
 */
export function checkNewConnection(edges, { source, target, sourceHandle, targetHandle }) {
  if (isSignalHandle(sourceHandle) || isSignalHandle(targetHandle)) return { ok: true };
  const ends = [[source, sourceHandle || 'outlet-0'], [target, targetHandle || 'inlet-0']];
  const taken = edges.some((e) => !isSignalEdge(e) && ends.some(([nodeId, handle]) => (
    (e.source === nodeId && (e.sourceHandle || 'outlet-0') === handle)
    || (e.target === nodeId && (e.targetHandle || 'inlet-0') === handle)
  )));
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

  // The solver accepts only a whole number of ports from 3 to 8 (missing means 3)
  components.filter(n => n.type === 'junction').forEach((n) => {
    if (!validPortCount(n.data?.num_ports)) {
      add(errors, 'error', 'invalid_num_ports',
        `${nodeName(n)} has an invalid number of ports. Set a whole number from ${MIN_JUNCTION_PORTS} to ${MAX_JUNCTION_PORTS}.`, [n.id]);
    }
  });
  // Tank and boundaries take 1 to 8 ports (missing means 1)
  components.filter(n => BOUNDARY_PORT_TYPES.has(n.type)).forEach((n) => {
    if (!validPortCount(n.data?.num_ports, MIN_BOUNDARY_PORTS, MAX_BOUNDARY_PORTS)) {
      add(errors, 'error', 'invalid_num_ports',
        `${nodeName(n)} has an invalid number of ports. Set a whole number from ${MIN_BOUNDARY_PORTS} to ${MAX_BOUNDARY_PORTS}.`, [n.id]);
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
    // A supplying flow boundary is the pipe source, a drawing one the pipe target
    [[src, 'supply'], [tgt, 'draw']].forEach(([node, mode]) => {
      if (node.type !== 'flow_boundary' || !usable.has(node.id)) return;
      const dir = node.data?.flow_direction === 'draw' ? 'draw' : 'supply';
      if (dir === mode) return;
      add(errors, 'error', 'flow_boundary_direction',
        `Flow boundary '${nodeName(node)}' ${dir === 'draw' ? 'draws' : 'supplies'} flow, so its pipes must ${dir === 'draw' ? 'run into it' : 'run out of it'}.`, [node.id], [e.id]);
    });
    const ends = [
      { node: src, handle: e.sourceHandle || 'outlet-0', dir: 'outlets' },
      { node: tgt, handle: e.targetHandle || 'inlet-0', dir: 'inlets' },
    ];
    ends.forEach(({ node, handle, dir }) => {
      if (!usable.has(node.id)) return;
      const ports = portsOf(node);
      if (!ports[dir].includes(handle) && !ports.either.includes(handle)) {
        add(errors, 'error', 'invalid_port',
          `${edgeName(e)} uses ${/^port-\d+$/.test(handle) ? portName(handle) : `port "${handle}"`} which ${nodeName(node)} does not have.`, [node.id], [e.id]);
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
      `${list.length} pipes are attached to ${portName(handle)} of ${nodeName(node)}. A port takes one pipe; use a junction to branch.`,
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
    const ports = portsOf(n);
    const used = [...ports.inlets, ...ports.outlets, ...ports.either].filter(h => (portUse.get(`${n.id}|${h}`) || []).length > 0);
    if (used.length === 0) {
      add(warnings, 'warning', 'isolated_node', `${nodeName(n)} is not connected to anything and is ignored by the solver.`, [n.id]);
      return;
    }
    // An equal share needs a pipe at every port (the solver rejects a free port); a set flow per port ignores it
    if (n.type === 'flow_boundary' && n.data?.flow_split === 'total_split') {
      const count = boundaryPortCount(n.data);
      const free = ports.either.findIndex(h => !(portUse.get(`${n.id}|${h}`) || []).length);
      if (free >= 0 && used.length < count) {
        add(errors, 'error', 'flow_split_port_open',
          `${nodeName(n)}: Port ${free + 1} has no pipe. With the flow distributed equally every port needs a pipe: connect it, lower the number of ports or select another flow split.`, [n.id]);
      }
    }
    // An unpiped junction port is simply ignored; boundaries fix a pressure or flow
    if (BOUNDARY_TYPES.has(n.type) || n.type === 'junction') return;
    const outlets = VENTING_TYPES.has(n.type) ? [] : ports.outlets;
    const open = [...ports.inlets, ...outlets, ...ports.either].filter(h => !(portUse.get(`${n.id}|${h}`) || []).length);
    if (open.length) {
      add(warnings, 'warning', 'open_port',
        `${nodeName(n)}: ${open.map(portName).join(', ')} ${open.length > 1 ? 'are' : 'is'} not connected and is treated as a closed end.`, [n.id]);
    }
  });

  // A sensing line from a junction or boundary port without a pipe senses nothing; the solver ignores that line
  edges.forEach((e) => {
    const m = /^signal-port-(\d+)$/.exec(String(e.sourceHandle ?? ''));
    const host = m && byId.get(e.source);
    if (!host || !(host.type === 'junction' || BOUNDARY_PORT_TYPES.has(host.type)) || !usable.has(host.id)) return;
    if ((portUse.get(`${host.id}|port-${m[1]}`) || []).length) return;
    add(warnings, 'warning', 'signal_port_unpiped',
      `${edgeName(e)} senses ${portNumberLabel(Number(m[1]))} of ${nodeName(host)}, which has no pipe, so the receiving instrument or valve senses nothing there.`,
      [host.id], [e.id]);
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
        'A group of connected components has no tank, pressure boundary or flow boundary, so it has no pressure reference and cannot be solved meaningfully.', ids);
    }
  });

  // Instruments only read results; an input without a signal line from a pin shows no value
  const wired = (inst, handle) => edges.some(e => e.target === inst.id && e.targetHandle === handle && byId.has(e.source));
  nodes.filter(n => n.type === 'instrument').forEach((inst) => {
    const plus = wired(inst, 'signal-in');
    if (inst.data?.variable !== 'dP') {
      if (!plus) add(warnings, 'warning', 'instrument_unwired', `${nodeName(inst)} is not wired to a measuring pin and shows no value.`, [inst.id]);
      return;
    }
    const minus = wired(inst, 'signal-in-ref');
    if (!plus && !minus) {
      add(warnings, 'warning', 'instrument_unwired', `${nodeName(inst)} is not wired to a measuring pin and shows no value.`, [inst.id]);
    } else if (!plus || !minus) {
      add(warnings, 'warning', 'instrument_dp_one_input',
        `${nodeName(inst)} measures a pressure difference but only its ${plus ? '(+)' : '(−)'} input is wired, so it shows no value.`, [inst.id]);
    }
  });

  return { errors, warnings };
}
