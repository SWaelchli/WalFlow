/** "Port 3" for the 0-based neutral port index 2. */
export const portNumberLabel = (k) => `Port ${k + 1}`;

/**
 * User-visible name of a hydraulic port: "Port 3" on a neutral port (junction, orifice, filter, ...; handle ids are
 * 0-based), "Suction" / "Discharge" on pumps, otherwise "Inlet" / "Outlet" (with a number when the component has
 * several).
 * @param {{type?: string}} node
 * @param {string} handle handle id such as "inlet-0" or "port-2"
 */
export function portTitle(node, handle) {
  const m = /^(inlet|outlet|port)-(\d+)$/.exec(String(handle ?? ''));
  if (!m) return String(handle ?? '');
  const idx = Number(m[2]);
  if (m[1] === 'port') return portNumberLabel(idx);
  if (String(node?.type ?? '').endsWith('pump')) return m[1] === 'inlet' ? 'Suction' : 'Discharge';
  const base = m[1] === 'inlet' ? 'Inlet' : 'Outlet';
  return node?.type === 'three_way_tcv' && m[1] === 'inlet' ? `${base} ${idx + 1}` : base;
}
