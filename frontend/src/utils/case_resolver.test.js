import { describe, it, expect } from 'vitest';
import { getCaseTelemetrySet, getEffectiveNodeData, getEffectiveEdgeData, updateCaseTelemetry } from './case_resolver';

const tel = (p) => ({ nodes: { psv: { inlets: [{ pressure: p }], outlets: [] } }, edges: {} });

describe('relief case views (F1-08)', () => {
  const relieved = tel(250000);
  const unmitigated = tel(840000);
  const peak = tel(400000);
  const caseWithPeak = { id: 'case_base', is_base: true, telemetry: relieved, telemetry_unmitigated: unmitigated, telemetry_peak: peak };

  it('shows the solved peak snapshot, not a scaled unmitigated state', () => {
    expect(getCaseTelemetrySet(caseWithPeak, 'peak')).toBe(peak);
    const data = getEffectiveNodeData({ id: 'psv', data: {} }, [caseWithPeak], 'case_base', 'peak');
    expect(data.telemetry.inlets[0].pressure).toBe(400000);
  });

  it('falls back to the relieved state when the peak is the relieved state', () => {
    expect(getCaseTelemetrySet({ ...caseWithPeak, telemetry_peak: null }, 'peak')).toBe(relieved);
  });

  it('selects relieved and unmitigated sets', () => {
    expect(getCaseTelemetrySet(caseWithPeak, 'mitigated')).toBe(relieved);
    expect(getCaseTelemetrySet(caseWithPeak, 'unmitigated_global')).toBe(unmitigated);
  });

  it('replaces a stale peak snapshot on a new run', () => {
    const [updated] = updateCaseTelemetry([caseWithPeak], 'case_base', relieved, {}, unmitigated, null);
    expect(updated.telemetry_peak).toBeNull();
  });
});

describe('F2-07: results come from the case only', () => {
  const solved = { id: 'case_base', is_base: true, telemetry: tel(250000) };
  const unsolved = { id: 'case_2', is_base: false, overrides: { nodes: {} } };

  it('does not show another case results (or old node telemetry) under an unsolved case', () => {
    const node = { id: 'psv', data: { telemetry: tel(999).nodes.psv } };
    expect(getEffectiveNodeData(node, [solved, unsolved], 'case_2').telemetry).toBeUndefined();
    const edge = { id: 'e1', data: { telemetry: { inlets: [] } } };
    expect(getEffectiveEdgeData(edge, [solved, unsolved], 'case_2').telemetry).toBeUndefined();
  });

  it('stores the input hash with the results', () => {
    const [updated] = updateCaseTelemetry([solved], 'case_base', tel(1), { k: 1 }, null, null, 'h1');
    expect(updated.result_hash).toBe('h1');
  });
});
