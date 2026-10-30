import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import StatusChip from './StatusChip';
import RunBanners from '../overlays/RunBanners';
import { summarizeStats } from '../../utils/runStatus';

afterEach(cleanup);

const status = { state: 'idle', label: 'Not run yet', tone: 'neutral' };
const err = { code: 'port_shared', severity: 'error', message: 'Two pipes on one port.', nodeIds: ['n1'], edgeIds: ['e1', 'e2'] };
const warn = { code: 'open_port', severity: 'warning', message: 'Orifice 1: outlet 0 is not connected.', nodeIds: ['o1'], edgeIds: [] };

describe('StatusChip', () => {
  it('shows the label and the finding count, collapsed by default', () => {
    render(<StatusChip status={status} errors={[err]} warnings={[warn]} open={false} onToggle={() => {}} onClose={() => {}} />);
    expect(screen.getByText('Not run yet')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('lists errors and warnings and selects the component on Show', () => {
    const onSelect = vi.fn();
    render(<StatusChip status={status} errors={[err]} warnings={[warn]} open onToggle={() => {}} onClose={() => {}} onSelect={onSelect} />);
    const panel = screen.getByRole('dialog');
    expect(panel.textContent).toMatch(/Error: Two pipes on one port\./);
    expect(panel.textContent).toMatch(/Warning: Orifice 1/);
    expect(panel.textContent).toMatch(/Errors must be fixed/);
    fireEvent.click(screen.getAllByRole('button', { name: 'Show' })[1]);
    expect(onSelect).toHaveBeenCalledWith('o1', 'Node');
  });

  it('says so when the model has no problems and closes on Escape', () => {
    const onClose = vi.fn();
    render(<StatusChip status={status} open onToggle={() => {}} onClose={onClose} />);
    expect(screen.getByText(/No problems found/)).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the raw solver text under the run error only when there is one', () => {
    const chip = (detail) => <StatusChip status={status} runError="Check Pipe 7." runErrorDetail={detail} open onToggle={() => {}} onClose={() => {}} />;
    const { rerender } = render(chip(null));
    expect(screen.queryByText('fsolve failed')).toBeNull();
    rerender(chip('fsolve failed'));
    expect(screen.getByText('fsolve failed')).toBeTruthy();
  });

  it('shows notes from the last run', () => {
    render(<StatusChip status={{ state: 'warning', label: 'Converged, 1 warning', tone: 'warn' }}
      notes={[{ severity: 'warning', text: 'PRV 1 is wide open.', nodeId: 'r1' }]}
      open onToggle={() => {}} onClose={() => {}} onSelect={() => {}} />);
    expect(screen.getByText(/PRV 1 is wide open/)).toBeTruthy();
  });
});

describe('RunBanners', () => {
  const stats = {
    success: true, num_edges: 2, system_size: 4, controls_converged: true, properties_converged: false,
    saturated_controllers: [], physical_validity: { valid: true, issues: [] },
  };

  it('shows a solver error and hides it after dismissing; a new error shows again', () => {
    const { rerender } = render(<RunBanners runError="Boom" runErrorId={1} summary={null} resultKey={null} />);
    expect(screen.getByRole('alert').textContent).toMatch(/Boom/);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss message' }));
    expect(screen.queryByRole('alert')).toBeNull();
    rerender(<RunBanners runError="Boom" runErrorId={2} summary={null} resultKey={null} />);
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('offers Show only with a target (selecting it by type) and Details only with a detail, collapsed on a new error', () => {
    const { rerender } = render(<RunBanners runError="Boom" runErrorId={1} summary={null} resultKey={null} />);
    expect(screen.queryByRole('button', { name: 'Show' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Details' })).toBeNull();

    const onSelect = vi.fn();
    const banner = (id) => (
      <RunBanners runError="Boom" runErrorId={id} runErrorTarget={{ type: 'Connection', id: 'e7', name: 'Pipe 7' }}
        runErrorDetail="fsolve failed" summary={null} resultKey={null} onSelect={onSelect} />
    );
    rerender(banner(1));
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(onSelect).toHaveBeenCalledWith('e7', 'Connection');

    expect(screen.queryByText('fsolve failed')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    expect(screen.getByText('fsolve failed')).toBeTruthy();
    rerender(banner(2));
    expect(screen.queryByText('fsolve failed')).toBeNull();
  });

  it('warns for a result with caveats, not for a clean one', () => {
    const clean = { ...stats, properties_converged: true };
    const { rerender } = render(<RunBanners summary={summarizeStats(clean)} resultKey={clean} />);
    expect(screen.queryByRole('status')).toBeNull();
    rerender(<RunBanners summary={summarizeStats(stats)} resultKey={stats} />);
    expect(screen.getByRole('status').textContent).toMatch(/Converged with warnings/);
  });

  it('does not call a run without equations converged', () => {
    const empty = { ...stats, num_edges: 0, system_size: 0 };
    render(<RunBanners summary={summarizeStats(empty)} resultKey={empty} />);
    expect(screen.getByRole('status').textContent).toMatch(/Nothing to solve/);
    expect(screen.queryByText(/balanced/)).toBeNull();
  });
});
