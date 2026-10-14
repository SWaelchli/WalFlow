import { describe, it, expect } from 'vitest';
import { getCaseTelemetrySet, getEffectiveNodeData, updateCaseTelemetry } from './case_resolver';

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
