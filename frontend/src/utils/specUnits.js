/**
 * Unit handling for the pipe class library: values are stored in mm, bar and °C,
 * and shown / typed in the active unit system (in, psi, °F when imperial).
 */
import { MM_TO_IN, IN_TO_MM, BAR_TO_PSI, PSI_TO_BAR, fToC } from './converters';

const round = (v, decimals) => Number(Number(v).toFixed(decimals));

export function specUnits(isImperial) {
  return {
    length: isImperial ? 'in' : 'mm',
    pressure: isImperial ? 'psi' : 'bar',
    temperature: isImperial ? '°F' : '°C',
    /** mm → display value (in: 3 decimals) */
    lengthOut: (mm) => (mm === null || mm === undefined || mm === '' ? '' : (isImperial ? round(mm * MM_TO_IN, 3) : Number(mm))),
    /** bar → display value (psi: 1 decimal) */
    pressureOut: (bar) => (bar === null || bar === undefined || bar === '' ? '' : (isImperial ? round(bar * BAR_TO_PSI, 1) : Number(bar))),
    /** °C → display value (°F: 1 decimal) */
    temperatureOut: (c) => (c === null || c === undefined || c === '' ? '' : (isImperial ? round(Number(c) * 1.8 + 32, 1) : Number(c))),
    /** typed text → mm, or null when the text is not a number */
    lengthIn: (text) => parseOrNull(text, v => (isImperial ? v * IN_TO_MM : v)),
    /** typed text → bar, or null */
    pressureIn: (text) => parseOrNull(text, v => (isImperial ? v * PSI_TO_BAR : v)),
    /** typed text → °C, or null */
    temperatureIn: (text) => parseOrNull(text, v => (isImperial ? fToC(v) : v)),
  };
}

function parseOrNull(text, convert) {
  if (text === null || text === undefined || String(text).trim() === '') return null;
  const v = Number(text);
  return Number.isFinite(v) ? convert(v) : null;
}
