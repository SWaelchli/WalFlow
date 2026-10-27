import { describe, it, expect } from 'vitest';
import { summarizeStats, deriveRunState } from './runStatus';

const okStats = (extra = {}) => ({
  success: true, num_edges: 3, system_size: 5, controls_converged: true, properties_converged: true,
  saturated_controllers: [], physical_validity: { valid: true, issues: [] }, ...extra,
});
const base = { isConnected: true, loginRequired: false, isSimulating: false, stats: null, runError: null, resultsStale: false };

describe('summarizeStats', () => {
  it('returns null without stats', () => {
    expect(summarizeStats(null)).toBeNull();
  });

  it('a clean run is ok', () => {
    expect(summarizeStats(okStats())).toMatchObject({ level: 'ok', headline: 'Converged', notes: [] });
  });

  it('a failed run carries the solver message', () => {
    const s = summarizeStats({ success: false, error: 'No pressure reference: ...' });
    expect(s.level).toBe('failed');
    expect(s.detail).toMatch(/No pressure reference/);
  });

  it('zero equations is not reported as converged', () => {
    const s = summarizeStats(okStats({ num_edges: 0, system_size: 0 }));
    expect(s.level).toBe('nothing');
    expect(s.headline).toBe('Nothing to solve');
  });

  it('physical validity issues become warnings naming the component', () => {
    const s = summarizeStats(okStats({
      physical_validity: { valid: false, issues: [
        { node_id: 'p1', node: 'Pump 1', port: 'inlet-0', reason: 'below_vapor_pressure', pressure_bara: 0.01 },
        { node_id: 'p2', node: 'Pump 2', port: 'inlet-0', reason: 'below_vapor_pressure', pressure_bara: 0.01 },
        { node_id: 'o1', node: 'Orifice 1', port: 'port-1', reason: 'below_vapor_pressure', pressure_bara: 0.01 },
      ] },
    }));
    expect(s.level).toBe('warning');
    expect(s.notes).toHaveLength(1);
    expect(s.notes[0].text).toMatch(/Pump 1 inlet 0, Pump 2 inlet 0, Orifice 1 Port 2/);
    expect(s.notes[0].nodeId).toBe('p1');
  });

  it('flags unsettled loops, saturated regulators and non-finite values', () => {
    const s = summarizeStats(okStats({
      controls_converged: false, properties_converged: false, non_finite_count: 2,
      saturated_controllers: [
        { id: 'r1', name: 'PRV 1', state: 'wide_open' },
        { id: 'r2', name: 'BPR 2', state: 'lock_up' },
      ],
    }));
    expect(s.notes.map(n => n.text).join('|')).toMatch(/Control loops did not settle/);
    expect(s.notes.map(n => n.text).join('|')).toMatch(/PRV 1 is wide open/);
    expect(s.notes.map(n => n.text).join('|')).not.toMatch(/BPR 2/);
    expect(s.notes.map(n => n.text).join('|')).toMatch(/2 value\(s\)/);
  });
});

describe('deriveRunState', () => {
  it('prefers connection problems over results', () => {
    expect(deriveRunState({ ...base, isConnected: false, stats: okStats() }).state).toBe('offline');
    expect(deriveRunState({ ...base, isConnected: false, loginRequired: true }).state).toBe('signin');
  });

  it('shows running before anything else once connected', () => {
    expect(deriveRunState({ ...base, isSimulating: true, stats: okStats() }).state).toBe('running');
  });

  it('walks through idle, converged, warning, stale, failed, nothing', () => {
    expect(deriveRunState(base).state).toBe('idle');
    expect(deriveRunState({ ...base, stats: okStats() }).state).toBe('converged');
    expect(deriveRunState({ ...base, stats: okStats({ properties_converged: false }) }).state).toBe('warning');
    expect(deriveRunState({ ...base, stats: okStats(), resultsStale: true }).state).toBe('stale');
    expect(deriveRunState({ ...base, stats: { success: false, error: 'x' } }).state).toBe('failed');
    expect(deriveRunState({ ...base, runError: 'boom' }).state).toBe('failed');
    expect(deriveRunState({ ...base, stats: okStats({ system_size: 0, num_edges: 0 }) }).state).toBe('nothing');
  });
});
