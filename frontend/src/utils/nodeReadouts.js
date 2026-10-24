// Canvas readouts are "not calculated" (null -> "—") until a run has produced telemetry,
// never 0 bar or 0 L/min. A pressure drop is shown as a positive "ΔP" in the neutral text colour.

const portValue = (telemetry, side, field) => {
  const v = telemetry?.[side]?.[0]?.[field];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};

/** Inlet and outlet pressure in Pa, or null when there is no result. */
export const portPressures = (telemetry) => ({
  pIn: portValue(telemetry, 'inlets', 'pressure'),
  pOut: portValue(telemetry, 'outlets', 'pressure'),
});

/** Pressure difference in Pa (inlet minus outlet, so a drop is positive), or null. */
export const pressureDrop = (telemetry) => {
  const { pIn, pOut } = portPressures(telemetry);
  return pIn !== null && pOut !== null ? pIn - pOut : null;
};

/** Pressure gain across a pump in Pa, or null. */
export const pressureRise = (telemetry) => {
  const d = pressureDrop(telemetry);
  return d === null ? null : -d;
};

export const outletFlow = (telemetry) => portValue(telemetry, 'outlets', 'flow_rate');
