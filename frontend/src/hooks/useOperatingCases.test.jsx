import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useOperatingCases } from './useOperatingCases';

afterEach(cleanup);

const tel = (p) => ({ nodes: { a: { inlets: [{ pressure: p }], outlets: [] } }, edges: {} });
const solved = (id) => ({ id, telemetry: tel(1), telemetry_unmitigated: tel(2), telemetry_peak: tel(3), kpis: { k: 1 }, result_hash: 'old' });

describe('batch results', () => {
  it('clear a failed case, merge a successful one in the same batch and leave other cases untouched', () => {
    const { result } = renderHook(() => useOperatingCases({ nodes: [] }));
    const untouched = solved('c3');
    act(() => { result.current.setCases([solved('c1'), solved('c2'), untouched]); });

    act(() => {
      result.current.handleBatchResultsTelemetry([
        { case_id: 'c1', status: 'error', error_message: 'no convergence' },
        { case_id: 'c2', status: 'success', telemetry: tel(9), kpis: { k: 9 } },
      ], { c1: 'h1', c2: 'h2' });
    });

    const [c1, c2, c3] = result.current.cases;
    expect(c1).toMatchObject({ telemetry: null, telemetry_unmitigated: null, telemetry_peak: null, kpis: null, result_hash: null });
    expect(c2.telemetry).toEqual(tel(9));
    expect(c2).toMatchObject({ kpis: { k: 9 }, result_hash: 'h2', telemetry_peak: null });
    expect(c3).toEqual(untouched);
  });
});
