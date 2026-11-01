import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { checkDiagramFile, stripResults } from './diagramFile';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = join(__dirname, '..', 'data', 'examples');

const BENCHMARK_FILES = [
  'Example_Large_Reference_Network.wlf',
  'Example_Jeppson_48Pipe_Network.wlf',
  'Example_API_614_LOS.wlf',
  'Example_Chilled_Water_Loop.wlf',
];

/**
 * Simulates stripResults and node/edge ID & handler mapping executed during loadData.
 */
function stripAndMapDiagram(data) {
  const clean = stripResults({ nodes: data.nodes, edges: data.edges, cases: data.cases || [] });

  const seenNodeIds = new Set();
  const restoredNodes = clean.nodes.map((node, idx) => {
    let uniqueId = node.id || `node_${idx}`;
    while (seenNodeIds.has(uniqueId)) {
      uniqueId = `node_${Math.random().toString(36).substring(2, 9)}`;
    }
    seenNodeIds.add(uniqueId);
    return {
      ...node,
      id: uniqueId,
      data: {
        ...node.data,
        rotation: node.data?.rotation || 0,
      },
    };
  });

  const seenEdgeIds = new Set();
  const restoredEdges = clean.edges.map((edge, idx) => {
    let uniqueId = edge.id || `edge_${idx}`;
    while (seenEdgeIds.has(uniqueId)) {
      uniqueId = `edge_${Math.random().toString(36).substring(2, 9)}`;
    }
    seenEdgeIds.add(uniqueId);
    return {
      ...edge,
      id: uniqueId,
      label: edge.data?.label || uniqueId,
    };
  });

  return { restoredNodes, restoredEdges, cleanCases: clean.cases };
}

describe('diagram loading performance benchmark', () => {
  it('measures validation and processing times for shipped reference examples', () => {
    const WARMUP_ROUNDS = 20;
    const MEASURE_ROUNDS = 100;
    const results = [];

    for (const filename of BENCHMARK_FILES) {
      const filePath = join(EXAMPLES_DIR, filename);
      const rawContent = readFileSync(filePath, 'utf-8');
      const diagram = JSON.parse(rawContent);

      // Verify diagram passes validation
      const check = checkDiagramFile(diagram);
      expect(check.ok).toBe(true);

      const nodeCount = diagram.nodes?.length ?? 0;
      const edgeCount = diagram.edges?.length ?? 0;

      // Warmup JIT
      for (let i = 0; i < WARMUP_ROUNDS; i++) {
        checkDiagramFile(diagram);
        stripAndMapDiagram(diagram);
      }

      // 1. Measure single checkDiagramFile validation
      const tVal1Start = performance.now();
      for (let i = 0; i < MEASURE_ROUNDS; i++) {
        checkDiagramFile(diagram);
      }
      const val1Ms = (performance.now() - tVal1Start) / MEASURE_ROUNDS;

      // 2. Measure redundant 2x checkDiagramFile validation (current load pattern)
      const tVal2Start = performance.now();
      for (let i = 0; i < MEASURE_ROUNDS; i++) {
        checkDiagramFile(diagram);
        checkDiagramFile(diagram);
      }
      const val2xMs = (performance.now() - tVal2Start) / MEASURE_ROUNDS;

      // 3. Measure stripResults and node/edge mapping processing time
      const tStripStart = performance.now();
      for (let i = 0; i < MEASURE_ROUNDS; i++) {
        stripAndMapDiagram(diagram);
      }
      const stripMapMs = (performance.now() - tStripStart) / MEASURE_ROUNDS;

      // Total processing time (single validation + strip & mapping)
      const totalMs = val1Ms + stripMapMs;

      // Functional verification of output
      const mapped = stripAndMapDiagram(diagram);
      expect(mapped.restoredNodes.length).toBe(nodeCount);
      expect(mapped.restoredEdges.length).toBe(edgeCount);

      results.push({
        filename,
        nodeCount,
        edgeCount,
        val1Ms,
        val2xMs,
        stripMapMs,
        totalMs,
      });
    }

    // Format concise benchmark table
    const header = [
      'File'.padEnd(36),
      'Nodes'.padStart(6),
      'Edges'.padStart(6),
      'Val 1x (ms)'.padStart(12),
      'Val 2x (ms)'.padStart(12),
      'Strip/Map (ms)'.padStart(15),
      'Total (ms)'.padStart(11),
    ].join(' | ');

    const separator = '-'.repeat(header.length);

    const rows = results.map((r) => [
      r.filename.padEnd(36),
      String(r.nodeCount).padStart(6),
      String(r.edgeCount).padStart(6),
      r.val1Ms.toFixed(3).padStart(12),
      r.val2xMs.toFixed(3).padStart(12),
      r.stripMapMs.toFixed(3).padStart(15),
      r.totalMs.toFixed(3).padStart(11),
    ].join(' | '));

    console.log('\n--- Diagram Loading Performance Benchmark ---');
    console.log(header);
    console.log(separator);
    rows.forEach((row) => console.log(row));
    console.log(separator);
    console.log(`* Measured over ${MEASURE_ROUNDS} iterations per file with high-precision timer.\n`);
  });
});
