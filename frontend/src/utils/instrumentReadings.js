// Instrument bubbles read the solved state at a sensing pin; they never feed back into the solver.
// Values and alarm limits are kept in fixed base units: bar (gauge or absolute), bar, L/min, °C, m/s, cSt.
import { barToPsi, psiToBar, lminToGpm, gpmToLmin, cToF, fToC, msToFts, ftsToMs } from './converters';
import { nextNumberedTag } from './autoTag';

export const INSTRUMENT_VARIABLES = {
  P: { letters: 'PIT', name: 'Pressure' },
  dP: { letters: 'PDIT', name: 'Pressure difference' },
  Q: { letters: 'FIT', name: 'Flow rate' },
  T: { letters: 'TIT', name: 'Temperature' },
  v: { letters: 'VI', name: 'Fluid velocity' },
  nu: { letters: 'νI', name: 'Kinematic viscosity' },
};

export const ALARM_KEYS = ['alarm_ll', 'alarm_l', 'alarm_h', 'alarm_hh'];
const DEFAULT_ATM_PA = 101325;

export const instrumentLetters = (variable) => (INSTRUMENT_VARIABLES[variable] || INSTRUMENT_VARIABLES.P).letters;

/** Data of a new instrument measuring `variable`, tagged after the labels already on the canvas. */
export const defaultInstrumentData = (variable, existingLabels) => ({
  label: nextNumberedTag(instrumentLetters(variable), existingLabels),
  variable,
  pressure_basis: 'gauge',
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

/** "signal-inlet-0" -> { side: 'inlets', idx: 0, handle: 'inlet-0' } */
const parsePin = (sourceHandle) => {
  const m = /^signal-(inlet|outlet)-(\d+)$/.exec(String(sourceHandle ?? ''));
  return m ? { side: `${m[1]}s`, idx: Number(m[2]), handle: `${m[1]}-${m[2]}` } : null;
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
  return host?.type === 'measure_point' ? name : `${name} · ${input.handle.replace('-', ' ')}`;
};

const finite = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// Inside diameter (m) of the pipe on a port; for a tap that is the inlet-side pipe, since its pin senses inlet-0
const pipeDiameterAt = (input, edges) => {
  const isInlet = input.side === 'inlets';
  const pipe = edges.find((e) => !isSignalEdge(e) && (isInlet
    ? e.target === input.nodeId && e.targetHandle === input.handle
    : e.source === input.nodeId && e.sourceHandle === input.handle));
  const d = Number(pipe?.data?.diameter_m);
  return d > 0 ? d : null;
};

/**
 * Reading of one instrument in base units, or null when it is not wired or there is no result.
 * @param telemetrySet one case's telemetry ({ nodes: { id: { inlets, outlets } } })
 */
export function readInstrument(instrument, edges, telemetrySet, atmosphericPa = DEFAULT_ATM_PA) {
  const data = instrument?.data || {};
  const input = instrumentInput(instrument?.id, edges);
  if (!input) return null;
  const port = telemetrySet?.nodes?.[input.nodeId]?.[input.side]?.[input.idx];
  if (!port) return null;

  switch (data.variable) {
    case 'dP': {
      const ref = instrumentInput(instrument.id, edges, 'signal-in-ref');
      const refPort = ref && telemetrySet?.nodes?.[ref.nodeId]?.[ref.side]?.[ref.idx];
      const p1 = finite(port.pressure);
      const p2 = finite(refPort?.pressure);
      return p1 !== null && p2 !== null ? (p1 - p2) / 1e5 : null;
    }
    case 'Q': {
      const q = finite(port.flow_rate);
      return q === null ? null : q * 60000;
    }
    case 'T': {
      const t = finite(port.temperature);
      return t === null ? null : t - 273.15;
    }
    case 'v': {
      const q = finite(port.flow_rate);
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
    const value = readInstrument(n, edges, telemetrySet, atmosphericPa);
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

export const limitToDisplay = (variable, base, isImperial) => {
  const v = limit(base);
  if (v === null) return '';
  return isImperial && CONVERT[variable] ? CONVERT[variable][0](v) : v;
};

export const limitFromDisplay = (variable, input, isImperial) => {
  const v = limit(input);
  if (v === null) return null;
  return isImperial && CONVERT[variable] ? CONVERT[variable][1](v) : v;
};

/** Unit of a reading/limit for display. */
export const instrumentUnit = (variable, basis, isImperial) => {
  switch (variable) {
    case 'dP': return isImperial ? 'psi' : 'bar';
    case 'Q': return isImperial ? 'gpm' : 'L/min';
    case 'T': return isImperial ? '°F' : '°C';
    case 'v': return isImperial ? 'ft/s' : 'm/s';
    case 'nu': return 'cSt';
    default:
      if (isImperial) return basis === 'absolute' ? 'psi(a)' : 'psi(g)';
      return basis === 'absolute' ? 'bar(a)' : 'bar(g)';
  }
};

/** Reading formatted for the badge: { text, unit }; "—" without a value. Small ΔP shows in mbar. */
export function formatReading(variable, value, basis, isImperial) {
  if (value === null || value === undefined) return { text: '—', unit: instrumentUnit(variable, basis, isImperial) };
  if (variable === 'dP' && !isImperial && Math.abs(value) < 0.1) return { text: (value * 1000).toFixed(1), unit: 'mbar' };
  const shown = limitToDisplay(variable, value, isImperial);
  const decimals = { P: 2, dP: 3, Q: 1, T: 1, v: 2, nu: 2 }[variable] ?? 2;
  return { text: Number(shown).toFixed(decimals), unit: instrumentUnit(variable, basis, isImperial) };
}
