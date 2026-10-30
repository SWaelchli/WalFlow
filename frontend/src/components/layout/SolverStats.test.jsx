import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import SolverStats from './SolverStats';

afterEach(cleanup);

describe('SolverStats', () => {
  it('says so without data', () => {
    render(<SolverStats stats={null} batchStats={null} />);
    expect(screen.getByText('No simulation data yet.')).toBeTruthy();
  });

  it('shows the figures of the last run', () => {
    const stats = {
      success: true, time_ms: 12.34, system_size: 7, num_edges: 3, outer_iterations: 2, total_inner_iterations: 9,
      controls_converged: true, properties_converged: true, saturated_controllers: [], physical_validity: { valid: true, issues: [] },
      max_residual: 1.5e-9, solver_method: 'sparse_newton',
    };
    render(<SolverStats stats={stats} batchStats={null} />);
    expect(screen.getByText('12.3 ms')).toBeTruthy();
    expect(screen.getByText('7 Eq.')).toBeTruthy();
    expect(screen.getByText('Sparse Newton')).toBeTruthy();
    expect(screen.getByText('1.50e-9')).toBeTruthy();
  });
});
