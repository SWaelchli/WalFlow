// Canvas readouts are "not calculated" (null -> "—") until a run has produced telemetry,
// never 0 bar or 0 L/min. A pressure drop is shown as a positive "ΔP" in the neutral text colour.

const portValue = (telemetry, side, field) => {
  const v = telemetry?.[side]?.[0]?.[field];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};

/** Pressure difference in Pa (inlet minus outlet, so a drop is positive), or null. */
export const pressureDrop = (telemetry) => {
  const pIn = portValue(telemetry, 'inlets', 'pressure');
  const pOut = portValue(telemetry, 'outlets', 'pressure');
  return pIn !== null && pOut !== null ? pIn - pOut : null;
};

/** Pressure gain across a pump in Pa, or null. */
export const pressureRise = (telemetry) => {
  const d = pressureDrop(telemetry);
  return d === null ? null : -d;
};

export const outletFlow = (telemetry) => portValue(telemetry, 'outlets', 'flow_rate');

// Components with two neutral ports (orifice, calibrated restriction, filter, measure point) have them in
// telemetry.ports; flow_rate is positive into the component through that port.
export const NO_FLOW_M3S = 1e-9;

/**
 * Upstream and downstream port of a two-port component: the upstream one has the positive flow_rate
 * (port 0 when there is no flow). Null when there is no result.
 * @returns {{up: object, down: object, upIdx: number, downIdx: number, flow: number} | null} flow is |Q| in m3/s
 */
export const neutralPorts = (telemetry) => {
  const [p0, p1] = telemetry?.ports || [];
  if (!p0 || !p1) return null;
  const upIdx = (p1.flow_rate ?? 0) - (p0.flow_rate ?? 0) > 2 * NO_FLOW_M3S ? 1 : 0;
  const up = upIdx === 0 ? p0 : p1;
  return { up, down: upIdx === 0 ? p1 : p0, upIdx, downIdx: 1 - upIdx, flow: Math.abs(up.flow_rate ?? 0) };
};

/** Pressure difference in Pa across a two-port component (upstream minus downstream), or null. */
export const neutralDrop = (telemetry) => {
  const s = neutralPorts(telemetry);
  const [pUp, pDown] = [s?.up.pressure, s?.down.pressure];
  return Number.isFinite(pUp) && Number.isFinite(pDown) ? pUp - pDown : null;
};

/** Pressure in Pa at port 0 of a two-port component (a measure point senses its node pressure), or null. */
export const nodePressure = (telemetry) => {
  const p = telemetry?.ports?.find(Boolean)?.pressure;   // the first piped port (a free port reports null)
  return Number.isFinite(p) ? p : null;
};
