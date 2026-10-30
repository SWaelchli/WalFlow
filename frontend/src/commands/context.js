/** Pins of a component an instrument can be wired to: a tap's own pin, or the sensing pins switched on at a component. */
export function instrumentPinsOf(node) {
  if (node.type === 'instrument') return [];
  if (node.type === 'measure_point') return ['port-0'];
  return Object.entries(node.data?.sensing || {}).filter(([, on]) => on).map(([port]) => port);
}
