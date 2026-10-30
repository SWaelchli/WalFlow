import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { UnitProvider } from '../../context/UnitContext';
import ValveDetails from './ValveDetails';

// jsdom has no layout, so ResponsiveContainer renders nothing. Stub recharts and expose the
// chart's data and X domain, which is what ValveDetails computes from the backend curves.
vi.mock('recharts', () => {
  const Null = () => null;
  return {
    ResponsiveContainer: ({ children }) => <div>{children}</div>,
    ComposedChart: ({ data, children }) => (
      <div data-testid="chart" data-rows={JSON.stringify(data)}>{children}</div>
    ),
    XAxis: ({ domain }) => <i data-testid="xaxis" data-domain={JSON.stringify(domain)} />,
    YAxis: Null, CartesianGrid: Null, Legend: Null, Line: Null,
    Scatter: ({ name, data }) => <i data-testid={`scatter-${name}`} data-points={JSON.stringify(data)} />,  };
});

const curves = {
  flow_m3s: [0, 0.001],          // 0 and 60 L/min
  dp_current_pa: [0, 50000],
  dp_full_open_pa: [0, 10000],
};

const renderValve = (data, type = 'linear_control_valve') => render(
  <UnitProvider>
    <ValveDetails node={{ type, data }} />
  </UnitProvider>
);

const point = (name) => {
  const el = screen.queryByTestId(`scatter-${name}`);
  return el ? JSON.parse(el.dataset.points)[0] : null;
};

const telemetry = (extra = {}) => ({
  opening_pct: 50,
  inlets: [{ flow_rate: 0.001, pressure: 300000 }],
  outlets: [{ pressure: 200000 }],
  ...extra,
});

describe('ValveDetails backend curves', () => {
  afterEach(cleanup);

  it('shows the placeholder, no chart, until the backend sends valve_curves', () => {
    renderValve({ telemetry: telemetry() });
    expect(screen.queryByText('Run a simulation to see the valve curves')).not.toBeNull();
    expect(screen.queryByTestId('chart')).toBeNull();
  });

  it('plots the sent points: p_in - dp, X domain ends at the last point', () => {
    renderValve({ telemetry: telemetry({ valve_curves: curves }) });
    expect(screen.queryByText('Run a simulation to see the valve curves')).toBeNull();
    const rows = JSON.parse(screen.getByTestId('chart').dataset.rows);
    expect(rows.map((r) => r.q)).toEqual([0, 60]);
    expect(rows.map((r) => r.currentCurve)[0]).toBeCloseTo(3, 9);
    expect(rows.map((r) => r.currentCurve)[1]).toBeCloseTo(2.5, 9);
    expect(rows.map((r) => r.limit)[0]).toBeCloseTo(3, 9);
    expect(rows.map((r) => r.limit)[1]).toBeCloseTo(2.9, 9);
    expect(JSON.parse(screen.getByTestId('xaxis').dataset.domain)).toEqual([0, 60]);
  });

  it('backpressure valve plots p_out + dp', () => {
    renderValve({ backpressure: true, telemetry: telemetry({ valve_curves: curves }) });
    const rows = JSON.parse(screen.getByTestId('chart').dataset.rows);
    expect(rows.map((r) => r.currentCurve)).toEqual([2, 2.5]);
    expect(rows.map((r) => r.limit)).toEqual([2, 2.1]);
  });

  it.each([
    ['reducing', false, 2],       // outlet pressure 2 bar
    ['backpressure', true, 3],    // inlet pressure 3 bar
  ])('operating point is at the own pressure, not the sensed one (%s)', (_n, backpressure, ownBar) => {
    renderValve({ backpressure, telemetry: telemetry({ valve_curves: curves, sensed_pressure: 250000 }) });
    expect(point('Operating Point').q).toBe(60);
    expect(point('Operating Point').p).toBeCloseTo(ownBar, 9);
  });

  it('remote-sensing regulator still plots the operating point at its own pressure', () => {
    renderValve(
      { telemetry: telemetry({ valve_curves: curves, sensed_pressure: 250000 }) },
      'remote_control_valve'
    );
    expect(point('Operating Point')).toEqual({ q: 60, p: 2 });
  });
});
