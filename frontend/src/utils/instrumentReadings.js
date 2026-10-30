// Instrument bubbles read the solved state at a sensing pin; they never feed back into the solver.
// Values and alarm limits are kept in fixed base units: bar (gauge or absolute), bar, L/min, °C, m/s, cSt.
import { barToPsi, psiToBar, lminToGpm, gpmToLmin, lminToM3h, m3hToLmin, cToF, fToC, msToFts, ftsToMs, FLOW_UNITS, DEFAULT_ATM_PA, pressureBasisLabel, flowUnitLabel } from './converters';
import { nextNumberedTag } from './autoTag';
import { portNumberLabel } from './portLabels';
import { NEUTRAL_TYPES } from './networkValidation';

export const INSTRUMENT_VARIABLES = {
  P: { letters: 'PIT', name: 'Pressure' },
  dP: { letters: 'PDIT', name: 'Pressure difference' },
  Q: { letters: 'FIT', name: 'Flow rate' },
  T: { letters: 'TIT', name: 'Temperature' },
  v: { letters: 'VI', name: 'Fluid velocity' },
  nu: { letters: 'νI', name: 'Kinematic viscosity' },
};

export const ALARM_KEYS = ['alarm_ll', 'alarm_l', 'alarm_h', 'alarm_hh'];

export const instrumentLetters = (variable) => (INSTRUMENT_VARIABLES[variable] || INSTRUMENT_VARIABLES.P).letters;

/**
 * Data of a new instrument measuring `variable`, tagged after the labels already on the canvas.
 * The pressure basis starts on the global setting; each instrument keeps its own choice afterwards.
 */
export const defaultInstrumentData = (variable, existingLabels, pressureBasis = 'gauge') => ({
  label: nextNumberedTag(instrumentLetters(variable), existingLabels),
  variable,
  pressure_basis: pressureBasis === 'absolute' ? 'absolute' : 'gauge',
  alarm_ll: null, alarm_l: null, alarm_h: null, alarm_hh: null,
});

/** New tag when the variable changes; a hand-written tag is kept. */
export const retagForVariable = (label, oldVariable, newVariable, existingLabels) => {
  const old = instrumentLetters(oldVariable);
  const isAuto = String(label ?? '').startsWith(`${old} `) && /^\d+$/.test(String(label).slice(old.length + 1));
  return isAuto || !label ? nextNumberedTag(instrumentLetters(newVariable), existingLabels) : label;
};

const isSignalEdge = (e) => String(e?.data?.type ?? '').toUpperCase() === 'SIGNAL'
  || String(e?.sourceHandle ?? '').startsWith('signal-');

/** "signal-inlet-0" -> { side: 'inlets', idx: 0, handle: 'inlet-0' }; a junction pin "signal-port-2" -> side 'ports' */
const parsePin = (sourceHandle) => {
  const m = /^signal-(inlet|outlet|port)-(\d+)$/.exec(String(sourceHandle ?? ''));
  if (!m) return null;
  const side = m[1] === 'port' ? 'ports' : `${m[1]}s`;
  return { side, idx: Number(m[2]), handle: `${m[1]}-${m[2]}` };
};

/** Where an instrument input is wired: { nodeId, side, idx, handle } or null. */
export const instrumentInput = (instrumentId, edges, targetHandle = 'signal-in') => {
  const edge = edges.find((e) => e.target === instrumentId && e.targetHandle === targetHandle && isSignalEdge(e));
  const pin = edge && parsePin(edge.sourceHandle);
  return pin ? { nodeId: edge.source, ...pin } : null;
};

/** "Measurement Tap 1" for a tap's own pin, "P-101 · outlet 0" for a pin on a component; null when unwired. */
export const describeInstrumentInput = (input, nodes) => {
  if (!input) return null;
  const host = nodes.find((n) => n.id === input.nodeId);
  const name = host?.data?.label || input.nodeId;
  if (host?.type === 'measure_point') return name;
  // A junction port is shown 1-based ("Port 3" for port-2), like the rest of the UI
  const port = input.side === 'ports' ? portNumberLabel(input.idx) : input.handle.replace('-', ' ');
  return `${name} · ${port}`;
};

const finite = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// Inside diameter (m) of the pipe on a port; a port holds one pipe, which may be stored in either direction
const pipeDiameterAt = (input, edges) => {
  const pipe = edges.find((e) => !isSignalEdge(e) && (
    (e.target === input.nodeId && e.targetHandle === input.handle)
    || (e.source === input.nodeId && e.sourceHandle === input.handle)));
  const d = Number(pipe?.data?.diameter_m);
  return d > 0 ? d : null;
};

/**
 * Reading of one instrument in base units, or null when it is not wired or there is no result.
 * @param telemetrySet one case's telemetry ({ nodes: { id: { inlets, outlets } } })
 */
export function readInstrument(instrument, edges, telemetrySet, atmosphericPa = DEFAULT_ATM_PA, nodes = null) {
  const data = instrument?.data || {};
  const input = instrumentInput(instrument?.id, edges);
  if (!input) return null;
  const ports = telemetrySet?.nodes?.[input.nodeId]?.[input.side];
  const port = ports?.[input.idx];
  if (!port) return null;
  // On a two-port neutral component a flow reads the flow through it (Port 1 to Port 2), whichever port is tapped;
  // flow_rate is positive into the port, so Port 2's (when Port 1 is free) counts negative
  // Only neutral in-line parts do this; a tank, boundary or junction with two ports reads the tapped port's own flow
  const hostType = nodes?.find((n) => n.id === input.nodeId)?.type;
  const throughFlow = input.side === 'ports' && ports.length === 2 && NEUTRAL_TYPES.has(hostType)
    ? (ports[0] ? ports[0].flow_rate : -ports[1].flow_rate)
    : port.flow_rate;

  switch (data.variable) {
    case 'dP': {
      const ref = instrumentInput(instrument.id, edges, 'signal-in-ref');
      const refPort = ref && telemetrySet?.nodes?.[ref.nodeId]?.[ref.side]?.[ref.idx];
      const p1 = finite(port.pressure);
      const p2 = finite(refPort?.pressure);
      return p1 !== null && p2 !== null ? (p1 - p2) / 1e5 : null;
    }
    case 'Q': {
      const q = finite(throughFlow);
      return q === null ? null : q * 60000;
    }
    case 'T': {
      const t = finite(port.temperature);
      return t === null ? null : t - 273.15;
    }
    case 'v': {
      const q = finite(throughFlow);
      const d = pipeDiameterAt(input, edges);
      return q === null || d === null ? null : q / (Math.PI * d * d / 4);
    }
    case 'nu': {
      const mu = finite(port.viscosity);
      const rho = finite(port.density);
      return mu === null || !rho ? null : (mu / rho) * 1e6;
    }
    default: {
      const p = finite(port.pressure);
      if (p === null) return null;
      return (data.pressure_basis === 'absolute' ? p : p - atmosphericPa) / 1e5;
    }
  }
}

const limit = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/** 'HH' | 'H' | 'L' | 'LL' | null for a reading against the instrument's limits (blank limit = off). */
export function alarmState(value, data = {}) {
  if (value === null || value === undefined) return null;
  const ll = limit(data.alarm_ll), l = limit(data.alarm_l), h = limit(data.alarm_h), hh = limit(data.alarm_hh);
  if (hh !== null && value >= hh) return 'HH';
  if (ll !== null && value <= ll) return 'LL';
  if (h !== null && value >= h) return 'H';
  if (l !== null && value <= l) return 'L';
  return null;
}

/** Message when the set limits are not in the order LL < L < H < HH, else null. */
export function limitOrderError(data = {}) {
  const set = ALARM_KEYS.map((k) => [k, limit(data[k])]).filter(([, v]) => v !== null);
  for (let i = 1; i < set.length; i += 1) {
    if (!(set[i - 1][1] < set[i][1])) return 'Alarm limits must rise in the order LL < L < H < HH.';
  }
  return null;
}

/**
 * Readings of all instruments for one case: Map id -> { value, state }.
 * Instruments with no reading are included with value null so the canvas shows "—".
 */
export function readInstruments(nodes, edges, telemetrySet, atmosphericPa = DEFAULT_ATM_PA) {
  const out = new Map();
  nodes.forEach((n) => {
    if (n.type !== 'instrument') return;
    const value = readInstrument(n, edges, telemetrySet, atmosphericPa, nodes);
    out.set(n.id, { value, state: alarmState(value, n.data) });
  });
  return out;
}

// Base unit <-> display unit for alarm limit inputs (cSt has no imperial unit in the app)
const CONVERT = {
  P: [(v) => Number(barToPsi(v, 3)), psiToBar],
  dP: [(v) => Number(barToPsi(v, 3)), psiToBar],
  Q: [(v) => Number(lminToGpm(v, 2)), gpmToLmin],
  T: [(v) => Number(cToF(v, 1)), fToC],
  v: [(v) => Number(msToFts(v, 2)), ftsToMs],
};

const isM3h = (variable, isImperial, flowUnit) => variable === 'Q' && !isImperial && flowUnit === FLOW_UNITS.M3H;

export const limitToDisplay = (variable, base, isImperial, flowUnit) => {
  const v = limit(base);
  if (v === null) return '';
  if (isM3h(variable, isImperial, flowUnit)) return Number(lminToM3h(v, 4));
  return isImperial && CONVERT[variable] ? CONVERT[variable][0](v) : v;
};

export const limitFromDisplay = (variable, input, isImperial, flowUnit) => {
  const v = limit(input);
  if (v === null) return null;
  if (isM3h(variable, isImperial, flowUnit)) return m3hToLmin(v);
  return isImperial && CONVERT[variable] ? CONVERT[variable][1](v) : v;
};

/** Unit of a reading/limit for display. Pressure follows the instrument's own basis; flow the global flow unit. */
export const instrumentUnit = (variable, basis, isImperial, flowUnit) => {
  const system = isImperial ? 'imperial' : 'metric';
  switch (variable) {
    case 'dP': return isImperial ? 'psi' : 'bar';
    case 'Q': return flowUnitLabel(system, flowUnit);
    case 'T': return isImperial ? '°F' : '°C';
    case 'v': return isImperial ? 'ft/s' : 'm/s';
    case 'nu': return 'cSt';
    default:
      return pressureBasisLabel(system, basis === 'absolute' ? 'absolute' : 'gauge');
  }
};

/** Reading formatted for the badge: { text, unit }; "—" without a value. Small ΔP shows in mbar. */
export function formatReading(variable, value, basis, isImperial, flowUnit) {
  if (value === null || value === undefined) return { text: '—', unit: instrumentUnit(variable, basis, isImperial, flowUnit) };
  if (variable === 'dP' && !isImperial && Math.abs(value) < 0.1) return { text: (value * 1000).toFixed(1), unit: 'mbar' };
  const shown = limitToDisplay(variable, value, isImperial, flowUnit);
  const decimals = isM3h(variable, isImperial, flowUnit)
    ? (Math.abs(shown) < 1 ? 3 : 2)
    : ({ P: 2, dP: 3, Q: 1, T: 1, v: 2, nu: 2 }[variable] ?? 2);
  return { text: Number(shown).toFixed(decimals), unit: instrumentUnit(variable, basis, isImperial, flowUnit) };
}
