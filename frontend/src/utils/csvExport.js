const BOM = '﻿';

const PLAIN_NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/**
 * RFC 4180 field: quoted when it holds a comma, double quote, CR or LF; inner quotes doubled.
 * Strings starting with = + - @ tab or CR get a leading ' (spreadsheet formula injection), unless
 * they are plain numbers; number values are never prefixed.
 */
export function csvEscape(value) {
  let s = value === null || value === undefined ? '' : String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s) && !PLAIN_NUMBER.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV text for a header row and data rows: UTF-8 BOM first, comma separated, CRLF line endings. */
export function buildCsv(headers, rows) {
  return BOM + [headers, ...rows].map(row => row.map(csvEscape).join(',')).join('\r\n');
}

/** Case name made safe for a Windows file name; empty when nothing usable is left. */
export function sanitizeFileSegment(name) {
  return String(name ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f\s]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** `walflow_export_<case>_<tab>.csv`; the case segment is left out when the name sanitises to nothing. */
export function buildCsvFileName(caseName, tab) {
  const segment = sanitizeFileSegment(caseName);
  return segment ? `walflow_export_${segment}_${tab}.csv` : `walflow_export_${tab}.csv`;
}
