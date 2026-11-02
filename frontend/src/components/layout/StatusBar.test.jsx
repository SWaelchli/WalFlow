import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ReactFlowProvider } from 'reactflow';
import StatusBar from './StatusBar';
import { UnitProvider } from '../../context/UnitContext';
import { makeCommandCtx } from '../../test/commandCtx';

afterEach(cleanup);

const chip = { status: { state: 'idle', label: 'Not run yet', tone: 'neutral' }, open: false, onToggle: () => {}, onClose: () => {} };

function setup(props = {}, ctxOver = {}, unitSystem = 'metric') {
  const ctx = makeCommandCtx(ctxOver);
  render(
    <UnitProvider initialUnitSystem={unitSystem}>
      <ReactFlowProvider>
        <StatusBar ctx={ctx} chip={chip} activeCaseName="Base" warningCount={0} hasErrors={false} onOpenWarnings={() => {}} onOpenUnits={() => {}} {...props} />
      </ReactFlowProvider>
    </UnitProvider>,
  );
  return ctx;
}

describe('StatusBar', () => {
  it('hides the warnings and selection slots at zero', () => {
    setup();
    expect(screen.getByText('Not run yet')).toBeTruthy();
    expect(screen.queryByText(/warning|problem/)).toBeNull();
    expect(screen.queryByText(/selected/)).toBeNull();
  });

  it('shows counts: problems when there are errors, the selection size, and opens the warnings', () => {
    const onOpenWarnings = vi.fn();
    setup({ warningCount: 2, hasErrors: true, onOpenWarnings }, { selection: { nodes: [{}, {}], edges: [{}] } });
    fireEvent.click(screen.getByRole('button', { name: /2 problems/ }));
    expect(onOpenWarnings).toHaveBeenCalledTimes(1);
    expect(screen.getByText('3 selected')).toBeTruthy();
  });

  it('the case slot is static text, zoom fits the view, units open the settings', () => {
    const onOpenUnits = vi.fn();
    const ctx = setup({ onOpenUnits });
    expect(screen.getByText('Case: Base')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Case: Base/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /percent, fit view/ }));
    expect(ctx.actions.fitView).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'bar a · L/min · °C' }));
    expect(onOpenUnits).toHaveBeenCalledTimes(1);
  });

  it('displays pressure, flow, and temperature units in the units slot for metric and imperial', () => {
    setup({}, {}, 'metric');
    expect(screen.getByRole('button', { name: 'bar a · L/min · °C' })).toBeTruthy();
    cleanup();
    setup({}, {}, 'imperial');
    expect(screen.getByRole('button', { name: /psia · gpm · °F/i })).toBeTruthy();
  });
});
