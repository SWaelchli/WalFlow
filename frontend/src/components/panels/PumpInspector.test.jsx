import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import SetupPanel from './SetupPanel';
import PumpDetails from '../details/PumpDetails';
import { UnitProvider } from '../../context/UnitContext';
import { UNIT_SYSTEMS } from '../../utils/converters';

vi.mock('axios', () => ({ default: { get: vi.fn(() => Promise.resolve({ data: [] })) } }));
// recharts needs a measured container; the chart itself is not under test here
vi.mock('recharts', () => {
  const Stub = ({ children }) => <div>{children}</div>;
  return { ComposedChart: Stub, Line: Stub, XAxis: Stub, YAxis: Stub, CartesianGrid: Stub, ResponsiveContainer: Stub, Scatter: Stub, Legend: Stub };
});

afterEach(cleanup);

const pumpNode = (data, type = 'centrifugal_pump') => ({ id: 'p1', type, position: { x: 0, y: 0 }, data: { label: 'P-101', flow_rated_lmin: 100, ...data } });

const renderInspector = (node, unitSystem = UNIT_SYSTEMS.METRIC) => {
  const onUpdate = vi.fn();
  render(
    <UnitProvider initialUnitSystem={unitSystem}>
      <SetupPanel node={node} onUpdate={onUpdate} />
    </UnitProvider>
  );
  return onUpdate;
};

describe('D1: centrifugal pump rated in head', () => {
  it('warns when an older pump only has a rated pressure', () => {
    renderInspector(pumpNode({ pressure_rated_bar: 6 }));
    expect(screen.getByRole('alert').textContent).toMatch(/Rated head missing.*6 bar\(d\)/);
  });

  it('stores a head typed in feet as metres', () => {
    const onUpdate = renderInspector(pumpNode({ head_rated_m: 50 }), UNIT_SYSTEMS.IMPERIAL);
    const input = screen.getByDisplayValue('164.0');
    fireEvent.change(input, { target: { value: '100' } });
    fireEvent.blur(input);
    expect(onUpdate.mock.calls.at(-1)[1].head_rated_m).toBeCloseTo(30.48, 2);
  });
});

describe('D4 / D2: efficiency and stopped pump notes', () => {
  it('shows the efficiency with default 75 % and explains it excludes the motor', () => {
    renderInspector(pumpNode({ head_rated_m: 50 }));
    expect(screen.getByDisplayValue('75')).toBeTruthy();
    expect(screen.getByText(/excluding the motor/)).toBeTruthy();
  });

  it('explains the locked-rotor model when the pump is off', () => {
    renderInspector(pumpNode({ head_rated_m: 50, active: false }));
    expect(screen.getByText(/Stopped pump: modelled as a flow resistance/)).toBeTruthy();
  });
});

describe('D3: PD pump drive and warnings', () => {
  it('offers the drive type, defaulting to fixed speed', () => {
    renderInspector(pumpNode({ flow_rated: 100, motor_power: 5, efficiency: 85 }, 'volumetric_pump'));
    expect(screen.getByDisplayValue('Fixed speed (motor overload flagged)')).toBeTruthy();
  });

  it('shows a motor overload warning from the results', () => {
    const node = pumpNode({ flow_rated: 100, motor_power: 5, efficiency: 85, telemetry: {
      inlets: [{ flow_rate: 0.00166, pressure: 1e5, density: 1000 }], outlets: [{ pressure: 40e5 }],
      motor_overload: true, motor_load_pct: 154, shaft_power_kw: 7.7,
    } }, 'volumetric_pump');
    render(<UnitProvider initialUnitSystem={UNIT_SYSTEMS.METRIC}><PumpDetails node={node} /></UnitProvider>);
    expect(screen.getByText('MOTOR OVERLOADED (154 % OF RATING)')).toBeTruthy();
  });
});
