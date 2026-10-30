import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import CommandBar from './CommandBar';
import { makeCommandCtx } from '../../test/commandCtx';

afterEach(cleanup);

describe('CommandBar', () => {
  it('Run Simulation runs the run command', () => {
    const ctx = makeCommandCtx();
    render(<CommandBar ctx={ctx} />);
    fireEvent.click(screen.getByRole('button', { name: /Run Simulation/ }));
    expect(ctx.actions.run).toHaveBeenCalledTimes(1);
  });

  it('Run is disabled while simulating and does not run', () => {
    const ctx = makeCommandCtx({ isSimulating: true });
    render(<CommandBar ctx={ctx} />);
    const run = screen.getByRole('button', { name: /Solving/ });
    expect(run.disabled).toBe(true);
    fireEvent.click(run);
    expect(ctx.actions.run).not.toHaveBeenCalled();
  });

  it('panel toggles reflect their state in aria-pressed', () => {
    const results = { collapsed: false, toggleCollapsed: () => {} };
    render(<CommandBar ctx={makeCommandCtx({ sidePaneOpen: true, hasInspectorTarget: true, inspectorCollapsed: true, getResults: () => results })} />);
    const pressed = (name) => screen.getByRole('button', { name }).getAttribute('aria-pressed');
    expect(pressed('Side pane')).toBe('true');
    expect(pressed('Results panel')).toBe('true');
    expect(pressed('Inspector')).toBe('false');
  });

  it('Undo is disabled with a reason on a read-only drawing and does not run', () => {
    const ctx = makeCommandCtx({ isReadOnly: true });
    render(<CommandBar ctx={ctx} />);
    const undo = screen.getByRole('button', { name: 'Undo' });
    expect(undo.getAttribute('aria-disabled')).toBe('true');
    expect(undo.getAttribute('title')).toMatch(/read-only/);
    fireEvent.click(undo);
    expect(ctx.actions.undo).not.toHaveBeenCalled();
  });
});
