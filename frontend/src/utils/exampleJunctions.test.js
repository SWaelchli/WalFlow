import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { junctionLayout, junctionPortCount } from './junctionLayout';

const SIDE_ANGLE = { right: 0, bottom: 90, left: 180, top: 270 };

// The removed mixer/splitter types and malformed junction wiring would only show when the file is opened
const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const files = [
  ...readdirSync(join(dataDir, 'examples')).filter((f) => f.endsWith('.wlf')).map((f) => join(dataDir, 'examples', f)),
  join(dataDir, 'GreetingCanvas.wlf'),
];

describe('shipped diagrams use junctions correctly', () => {
  it.each(files)('%s has no mixer or splitter and wires junction ports once each', (file) => {
    const { nodes, edges } = JSON.parse(readFileSync(file, 'utf-8'));
    expect(nodes.filter((n) => n.type === 'mixer' || n.type === 'splitter')).toEqual([]);
    const junctions = new Map(nodes.filter((n) => n.type === 'junction').map((n) => [n.id, n.data.num_ports ?? 3]));
    const used = new Set();
    edges.filter((e) => !String(e.sourceHandle).startsWith('signal-') && !String(e.targetHandle).startsWith('signal-')).forEach((e) => {
      [[e.source, e.sourceHandle], [e.target, e.targetHandle]].forEach(([id, handle]) => {
        if (!junctions.has(id)) return;
        const k = /^port-(\d+)$/.exec(handle);
        expect(k, `${e.id}: ${id} ${handle}`).not.toBeNull();
        expect(Number(k[1]), `${e.id}: ${id} ${handle}`).toBeLessThan(junctions.get(id));
        expect(used.has(`${id}|${handle}`), `${id} ${handle} has two pipes`).toBe(false);
        used.add(`${id}|${handle}`);
      });
    });
  });

  it.each(files)('%s lets every junction pipe leave on the side facing its other end', (file) => {
    const { nodes, edges } = JSON.parse(readFileSync(file, 'utf-8'));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    edges.forEach((e) => {
      [[e.source, e.sourceHandle, e.target], [e.target, e.targetHandle, e.source]].forEach(([id, handle, otherId]) => {
        const node = byId.get(id);
        const other = byId.get(otherId);
        const k = /^port-(\d+)$/.exec(handle);
        if (node?.type !== 'junction' || !k || !other) return;
        const { size, ports } = junctionLayout(junctionPortCount(node.data));
        const side = ports[Number(k[1])].side;
        const dir = ((SIDE_ANGLE[side] + (node.data.rotation ?? 0)) * Math.PI) / 180;
        // other end by its top-left position: coarse, the rule only forbids a pipe that leaves backwards
        const [vx, vy] = [other.position.x - (node.position.x + size / 2), other.position.y - (node.position.y + size / 2)];
        const cos = (Math.cos(dir) * vx + Math.sin(dir) * vy) / Math.hypot(vx, vy);
        expect(cos, `${e.id}: ${id} ${handle} leaves away from ${otherId}`).toBeGreaterThanOrEqual(-0.2);
      });
    });
  });
});

describe('shipped diagrams use neutral boundary ports', () => {
  const OLD_TYPES = ['flow_source', 'pressure_source'];
  const BOUNDARIES = ['tank', 'pressure_boundary', 'flow_boundary'];
  const hydraulic = (e) => !String(e.sourceHandle).startsWith('signal-') && !String(e.targetHandle).startsWith('signal-');

  it.each(files)('%s has no old type names and no inlet-0/outlet-0 on a tank or boundary', (file) => {
    const { nodes, edges } = JSON.parse(readFileSync(file, 'utf-8'));
    expect(nodes.filter((n) => OLD_TYPES.includes(n.type))).toEqual([]);
    const isBoundary = new Map(nodes.map((n) => [n.id, BOUNDARIES.includes(n.type)]));
    edges.filter(hydraulic).forEach((e) => {
      [[e.source, e.sourceHandle], [e.target, e.targetHandle]].forEach(([id, handle]) => {
        if (isBoundary.get(id)) expect(handle, `${e.id}: ${id}`).toMatch(/^port-\d+$/);
      });
    });
    nodes.filter((n) => BOUNDARIES.includes(n.type)).forEach((n) => {
      expect(n.data, n.id).not.toHaveProperty('source_flow_lmin');
      expect(n.data, n.id).not.toHaveProperty('source_pressure_bara');
    });
  });

  it.each(files)('%s stores a flow boundary as the pipe source when it supplies and the target when it draws', (file) => {
    const { nodes, edges } = JSON.parse(readFileSync(file, 'utf-8'));
    const draws = new Map(nodes.filter((n) => n.type === 'flow_boundary').map((n) => [n.id, n.data.flow_direction === 'draw']));
    edges.filter(hydraulic).forEach((e) => {
      if (draws.has(e.source)) expect(draws.get(e.source), `${e.id}: ${e.source} is a draw but starts the pipe`).toBe(false);
      if (draws.has(e.target)) expect(draws.get(e.target), `${e.id}: ${e.target} supplies but ends the pipe`).toBe(true);
    });
  });
});
