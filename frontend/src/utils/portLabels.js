/** "Port 3" for the 0-based neutral port index 2. */
export const portNumberLabel = (k) => `Port ${k + 1}`;

// Sensing ports of role-port equipment that differ from the default inlet-0 / outlet-0
const ROLE_SENSING_PORTS = { three_way_tcv: ['inlet-0', 'inlet-1', 'outlet-0'] };

/**
 * Role sensing ports (inlet-k / outlet-k) of a role-port component type, in display order. Not for neutral-port
 * types (junctions, boundaries, NEUTRAL_TYPES): their port-k lists come from their own layout or port count.
 */
export const sensingPortsFor = (type) => ROLE_SENSING_PORTS[type] || ['inlet-0', 'outlet-0'];

/** Label of a sensing pin on a component of this type: "Port 3", "Inlet", "Inlet 2", "Outlet". */
export const sensingPinLabel = (type, handle) => sensingPortLabel(handle, sensingPortsFor(type));

/**
 * Label of a sensing-pin toggle: "Port 3" on a neutral port, otherwise "Inlet" / "Outlet", numbered 1-based
 * ("Inlet 2") only when the component has more than one port of that role.
 * @param {string} handle handle id such as "inlet-1" or "port-2"
 * @param {string[]} ports every sensing port id of the component
 */
export function sensingPortLabel(handle, ports) {
  const m = /^(inlet|outlet|port)-(\d+)$/.exec(String(handle ?? ''));
  if (!m) return String(handle ?? '');
  const idx = Number(m[2]);
  if (m[1] === 'port') return portNumberLabel(idx);
  const base = m[1] === 'inlet' ? 'Inlet' : 'Outlet';
  return ports.filter((p) => p.startsWith(`${m[1]}-`)).length > 1 ? `${base} ${idx + 1}` : base;
}

/**
 * User-visible name of a hydraulic port: "Port 3" on a neutral port (junction, orifice, filter, ...; handle ids are
 * 0-based), "Suction" / "Discharge" on pumps, otherwise "Inlet" / "Outlet" (with a number when the component has
 * several).
 * @param {{type?: string}} node
 * @param {string} handle handle id such as "inlet-0" or "port-2"
 */
export function portTitle(node, handle) {
  const role = /^(inlet|outlet)-\d+$/.exec(String(handle ?? ''))?.[1];
  if (role && String(node?.type ?? '').endsWith('pump')) return role === 'inlet' ? 'Suction' : 'Discharge';
  return sensingPinLabel(node?.type, handle);
}
