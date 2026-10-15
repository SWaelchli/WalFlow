import { getEffectiveEdgeData } from './case_resolver';

// Range shown when there is nothing to scale to (no results yet, or all values equal)
const FALLBACK_RANGE = {
  pressure: { min: 0.0, max: 6.0 },
  temperature: { min: 20.0, max: 60.0 },
  volumeflow: { min: 0.0, max: 200.0 },
  velocity: { min: 0.0, max: 10.0 },
};

// Value of the heatmap quantity at one end of a pipe (bar, °C, L/min or m/s), or null without a result
const portValue = (mode, port, pipeData) => {
  if (!port) return null;
  switch (mode) {
    case 'pressure': return port.pressure != null ? port.pressure / 100000.0 : null;
    case 'temperature': return port.temperature != null ? port.temperature - 273.15 : null;
    case 'volumeflow': return port.flow_rate != null ? Math.abs(port.flow_rate * 60000.0) : null;
    case 'velocity': {
      const dia = pipeData?.diameter || 0.1;
      const area = (Math.PI * dia ** 2) / 4.0;
      return (port.flow_rate != null && area > 0) ? Math.abs(port.flow_rate) / area : null;
    }
    default: return null;
  }
};

/**
 * Colour range of the pipe heatmap, from the results of the pipes in the chosen cases.
 * @param {{edges: object[], cases: object[], activeCaseId: string, telemetryMode: string, mode: string,
 *          allCases: boolean, round?: boolean}} args
 *   allCases: scan every case (global scale) instead of only the active one
 *   round:    round to 0.1 (used when the range becomes the editable custom range)
 */
export function computeHeatmapRange({ edges, cases, activeCaseId, telemetryMode, mode, allCases, round = false }) {
  if (!mode || mode === 'default') return { min: 0, max: 1 };

  const targets = (allCases && cases && cases.length > 0) ? cases : [{ id: activeCaseId }];
  let min = Infinity;
  let max = -Infinity;
  targets.forEach((c) => {
    edges.forEach((e) => {
      const effective = getEffectiveEdgeData(e, cases, c.id, telemetryMode);
      const tele = effective.telemetry || e.data?.telemetry || {};
      [tele.inlets?.[0], tele.outlets?.[0]].forEach((port) => {
        const v = portValue(mode, port, e.data);
        if (v !== null) {
          min = Math.min(min, v);
          max = Math.max(max, v);
        }
      });
    });
  });

  if (min === Infinity || max === -Infinity || Math.abs(max - min) < 1e-4) {
    return FALLBACK_RANGE[mode] || { min: 0, max: 1 };
  }
  return round
    ? { min: Math.max(0, parseFloat(min.toFixed(1))), max: parseFloat(max.toFixed(1)) }
    : { min: Math.max(0, min), max };
}
