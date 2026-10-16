import { DEFAULT_PIPE_LENGTH_M } from './pipeDefaults';

// Size of the measurement tap symbol, so the dropped tap is centred on the clicked point.
const TAP_W = 40;
const TAP_H = 20;

const isSignal = (edge) => String(edge?.data?.type ?? '').toUpperCase() === 'SIGNAL';

/** A pipe can take a tap; a signal line cannot. */
export const canInsertTap = (edge) => !!edge && !isSignal(edge);

/**
 * Splits pipe `edgeId` in two halves with a measurement tap between them.
 * The upstream half keeps the pipe's id and label; the downstream half is a copy of the pipe
 * (same diameter, roughness, pipe class) named `downstreamLabel`. Results of the old pipe are dropped.
 * @returns {{nodes: object[], edges: object[], tap: object} | null} null when the edge is not a pipe
 */
export function splitEdgeWithTap({ nodes, edges, edgeId, position, tapId, tapData, downstreamEdgeId, downstreamLabel }) {
  const edge = edges.find((e) => e.id === edgeId);
  if (!canInsertTap(edge)) return null;

  const { telemetry: _telemetry, ...pipeData } = edge.data || {};
  const halfLength = Number(pipeData.length ?? DEFAULT_PIPE_LENGTH_M) / 2;

  const tap = {
    id: tapId,
    type: 'measure_point',
    position: { x: position.x - TAP_W / 2, y: position.y - TAP_H / 2 },
    selected: true,
    data: tapData,
  };
  const upstream = {
    ...edge,
    selected: false,
    target: tapId,
    targetHandle: 'inlet-0',
    data: { ...pipeData, length: halfLength },
  };
  const downstream = {
    ...edge,
    id: downstreamEdgeId,
    label: downstreamLabel,
    selected: false,
    source: tapId,
    sourceHandle: 'outlet-0',
    data: { ...pipeData, label: downstreamLabel, length: halfLength },
  };

  return {
    nodes: nodes.map((n) => ({ ...n, selected: false })).concat(tap),
    edges: edges.flatMap((e) => (e.id === edgeId ? [upstream, downstream] : [{ ...e, selected: false }])),
    tap,
  };
}
