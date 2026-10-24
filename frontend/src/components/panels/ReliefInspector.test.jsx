import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import SetupPanel from './SetupPanel';
import { UnitProvider } from '../../context/UnitContext';
import { UNIT_SYSTEMS } from '../../utils/converters';

vi.mock('axios', () => ({ default: { get: vi.fn(() => Promise.resolve({ data: [] })) } }));

afterEach(cleanup);

const renderInspector = (node, unitSystem = UNIT_SYSTEMS.METRIC) => {
  const onUpdate = vi.fn();
  render(
    <UnitProvider initialUnitSystem={unitSystem}>
      <SetupPanel node={node} onUpdate={onUpdate} />
    </UnitProvider>
  );
  return onUpdate;
};

const psv = (data) => ({ id: 'psv', type: 'pressure_safety_valve', position: { x: 0, y: 0 }, data: { label: 'PSV-1', ...data } });
const disc = (data) => ({ id: 'rd', type: 'rupture_disc', position: { x: 0, y: 0 }, data: { label: 'RD-1', ...data } });

describe('relief set pressure in gauge', () => {
  it('warns when an older PSV only has a set pressure in bar(a)', () => {
    renderInspector(psv({ set_pressure_bar: 20 }));
    expect(screen.getAllByText(/Set Pressure \(barg\)/).length).toBe(2);   // label and alert
    expect(screen.getByRole('alert').textContent).toMatch(/Set Pressure \(barg\) missing.*had 20 bar\(a\)/);
  });

  it('warns when an older rupture disc only has a burst pressure in bar(a)', () => {
    renderInspector(disc({ burst_pressure_bar: 30 }));
    expect(screen.getByRole('alert').textContent).toMatch(/Burst Pressure \(barg\) missing.*had 30 bar\(a\)/);
  });

  it('stores a set pressure typed in psig as barg', () => {
    const onUpdate = renderInspector(psv({ set_pressure_barg: 10 }), UNIT_SYSTEMS.IMPERIAL);
    expect(screen.getByText(/Set Pressure \(psig\)/)).toBeTruthy();
    const input = screen.getByDisplayValue('145.0');
    fireEvent.change(input, { target: { value: '290' } });
    fireEvent.blur(input);
    expect(onUpdate.mock.calls.at(-1)[1].set_pressure_barg).toBeCloseTo(19.995, 2);
  });

  it('shows the pop valve reseat pressure in gauge', () => {
    renderInspector(psv({ set_pressure_barg: 10, action_mode: 'pop_action', blowdown_pct: 7 }));
    expect(screen.getByText(/Reseats at 9\.30 barg/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
