// The backend stores times as UTC but sends them as ISO strings without a zone; read them as UTC.
export function parseServerTime(s) {
  if (!s) return null;
  const str = String(s);
  const hasZone = /Z$/i.test(str) || /[+-]\d{2}:\d{2}$/.test(str);
  return new Date(hasZone ? str : `${str}Z`);
}
