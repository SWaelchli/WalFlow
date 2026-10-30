import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import SetupPanel from './SetupPanel';
import PressureSafetyValveDetails from '../details/PressureSafetyValveDetails';
import RuptureDiscDetails from '../details/RuptureDiscDetails';
import { UnitProvider } from '../../context/UnitContext';
import { UNIT_SYSTEMS } from '../../utils/converters';

vi.mock('axios', () => ({ default: { get: vi.fn(() => Promise.resolve({ data: [] })) } }));

afterEach(() => { cleanup(); localStorage.clear(); });

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
    expect(screen.getAllByText(/Set Pressure \(bar g\)/).length).toBe(2);   // label and alert
    expect(screen.getByRole('alert').textContent).toMatch(/Set Pressure \(bar g\) missing.*had 20 bar a/);
  });

  it('warns when an older rupture disc only has a burst pressure in bar(a)', () => {
    renderInspector(disc({ burst_pressure_bar: 30 }));
    expect(screen.getByRole('alert').textContent).toMatch(/Burst Pressure \(bar g\) missing.*had 30 bar a/);
  });

  it('stores a set pressure typed in psig as barg', () => {
    const onUpdate = renderInspector(psv({ set_pressure_barg: 10 }), UNIT_SYSTEMS.IMPERIAL);
    expect(screen.getByText(/Set Pressure \(psig\)/)).toBeTruthy();
    const input = screen.getByDisplayValue('145.04');
    fireEvent.change(input, { target: { value: '290' } });
    fireEvent.blur(input);
    expect(onUpdate.mock.calls.at(-1)[1].set_pressure_barg).toBeCloseTo(19.995, 2);
  });

  it('shows the pop valve reseat pressure in gauge', () => {
    renderInspector(psv({ set_pressure_barg: 10, action_mode: 'pop_action', blowdown_pct: 7 }));
    expect(screen.getByText(/Reseats at 9\.30 bar g/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each([['absolute'], ['gauge']])('keeps the stored gauge set pressure and its bar g label under the %s basis', (basis) => {
    localStorage.setItem('walflow_pressure_basis', basis);
    renderInspector(psv({ set_pressure_barg: 7.5 }));
    expect(screen.getByText(/Set Pressure \(bar g\)/)).toBeTruthy();
    expect(screen.getByDisplayValue('7.5')).toBeTruthy();
  });
  it.each([['absolute'], ['gauge']])('keeps the rupture disc burst pressure in bar g under the %s basis', (basis) => {
    localStorage.setItem('walflow_pressure_basis', basis);
    renderInspector(disc({ burst_pressure_barg: 12 }));
    expect(screen.getByText(/Burst Pressure \(bar g\)/)).toBeTruthy();
    expect(screen.getByDisplayValue('12')).toBeTruthy();
  });
});

describe('relief line pressure under the pressure basis', () => {
  // 4 bar a at the inlet, 1.01325 bar atmosphere implied by set pressure 5 bar g = 6.01325 bar a
  const inlet = [{ pressure: 400000 }];
  const detailsText = (Component, node, label) => {
    render(<UnitProvider initialUnitSystem={UNIT_SYSTEMS.METRIC}><Component node={node} /></UnitProvider>);
    return screen.getByText(label).nextSibling.textContent;
  };
  const psvNode = psv({ set_pressure_barg: 5, telemetry: { status: 'closed', set_pressure_bara: 6.01325, inlets: inlet, outlets: [{ flow_rate: 0 }] } });
  const discNode = disc({ burst_pressure_barg: 5, telemetry: { status: 'intact', set_pressure_bara: 6.01325, inlets: inlet, outlets: [{ flow_rate: 0 }] } });

  it.each([
    ['absolute', /^4\.00 bar a \(2\.99 bar g\)$/],
    ['gauge', /^2\.99 bar g$/],
  ])('shows the PSV inlet pressure under the %s basis', (basis, expected) => {
    localStorage.setItem('walflow_pressure_basis', basis);
    expect(detailsText(PressureSafetyValveDetails, psvNode, 'Inlet pressure')).toMatch(expected);
  });

  it.each([
    ['absolute', /^4\.00 bar a \(2\.99 bar g\)$/],
    ['gauge', /^2\.99 bar g$/],
  ])('shows the rupture disc mitigated line pressure under the %s basis', (basis, expected) => {
    localStorage.setItem('walflow_pressure_basis', basis);
    expect(detailsText(RuptureDiscDetails, discNode, 'Mitigated Line Pressure:')).toMatch(expected);
  });
});
