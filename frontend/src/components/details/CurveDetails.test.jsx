import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { UnitProvider } from '../../context/UnitContext';
import OrificeDetails from './OrificeDetails';
import FilterDetails from './FilterDetails';
import PumpDetails from './PumpDetails';

vi.mock('recharts', () => {
  const Null = () => null;
  return {
    ResponsiveContainer: ({ children }) => <div>{children}</div>,
    ComposedChart: ({ data, children }) => (
      <div data-testid="chart" data-rows={JSON.stringify(data)}>{children}</div>
    ),
    XAxis: Null,
    YAxis: Null,
    CartesianGrid: Null,
    Line: Null,
    Legend: ({ content, iconType }) => {
      if (typeof content === 'function') {
        try {
          return <div data-testid="legend">{content({ payload: [] })}</div>;
        } catch {
          return <div data-testid="legend">{content()}</div>;
        }
      }
      return <div data-testid="legend" data-icon-type={iconType} />;
    },
    Scatter: ({ name, data }) => <i data-testid={`scatter-${name}`} data-points={JSON.stringify(data)} />,
  };
});

afterEach(cleanup);

describe('CurveDetails equipment curves and operating points', () => {
  describe('placeholder before simulation', () => {
    it('renders placeholder and no chart for OrificeDetails without orifice_curves', () => {
      render(
        <UnitProvider>
          <OrificeDetails node={{ type: 'orifice', data: { telemetry: { ports: [{ flow_rate: 0, pressure: 101325 }] } } }} />
        </UnitProvider>
      );
      expect(screen.queryByText(/Run a simulation to see the.*curve/i)).not.toBeNull();
      expect(screen.queryByTestId('chart')).toBeNull();
    });

    it('renders placeholder and no chart for FilterDetails without filter_curves', () => {
      render(
        <UnitProvider>
          <FilterDetails node={{ type: 'filter', data: { telemetry: { ports: [{ flow_rate: 0, pressure: 101325 }] } } }} />
        </UnitProvider>
      );
      expect(screen.queryByText(/Run a simulation to see the.*curve/i)).not.toBeNull();
      expect(screen.queryByTestId('chart')).toBeNull();
    });

    it('renders placeholder and no chart for PumpDetails without pump_curves', () => {
      render(
        <UnitProvider>
          <PumpDetails node={{ type: 'centrifugal_pump', data: { telemetry: { inlets: [{ flow_rate: 0, pressure: 101325 }], outlets: [{ pressure: 101325 }] } } }} />
        </UnitProvider>
      );
      expect(screen.queryByText(/Run a simulation to see the.*curve/i)).not.toBeNull();
      expect(screen.queryByTestId('chart')).toBeNull();
    });
  });

  describe('operating point matches backend curve and total pressure difference with unequal pipe bores', () => {
    it('plots backend curve and places operating point on curve for OrificeDetails', () => {
      const telemetry = {
        ports: [
          { flow_rate: 0.001, pressure: 200000, total_pressure: 240000, density: 1000, viscosity: 0.001 },
          { flow_rate: -0.001, pressure: 100000, total_pressure: 110000, density: 1000, viscosity: 0.001 },
        ],
        orifice_curves: {
          flow_m3s: [0, 0.001],
          dp_pa: [0, 130000],
        },
      };
      render(
        <UnitProvider>
          <OrificeDetails node={{ type: 'orifice', data: { telemetry } }} />
        </UnitProvider>
      );
      expect(screen.queryByText(/Run a simulation to see the.*curve/i)).toBeNull();
      const rows = JSON.parse(screen.getByTestId('chart').dataset.rows);
      const curvePoint = rows.find((r) => Math.abs(r.q - 60) < 1e-6);
      expect(curvePoint).toBeDefined();
      expect(curvePoint.dp).toBeCloseTo(1.3, 6);

      const op = JSON.parse(screen.getByTestId('scatter-Operating Point').dataset.points)[0];
      expect(op.q).toBeCloseTo(60, 6);
      expect(op.dp).toBeCloseTo(1.3, 6);
      expect(op.dp).toBeCloseTo(curvePoint.dp, 6);
      expect(screen.getByText(/1\.30\s*bar/)).not.toBeNull();
    });

    it('plots backend curve and places operating point on curve for FilterDetails', () => {
      const telemetry = {
        ports: [
          { flow_rate: 0.001, pressure: 200000, total_pressure: 240000, density: 1000, viscosity: 0.001 },
          { flow_rate: -0.001, pressure: 100000, total_pressure: 110000, density: 1000, viscosity: 0.001 },
        ],
        filter_curves: {
          flow_m3s: [0, 0.001],
          dp_clean_pa: [0, 50000],
          dp_current_pa: [0, 130000],
          dp_terminal_pa: [0, 200000],
        },
      };
      render(
        <UnitProvider>
          <FilterDetails node={{ type: 'filter', data: { telemetry } }} />
        </UnitProvider>
      );
      expect(screen.queryByText(/Run a simulation to see the.*curve/i)).toBeNull();
      const rows = JSON.parse(screen.getByTestId('chart').dataset.rows);
      const curvePoint = rows.find((r) => Math.abs(r.q - 60) < 1e-6);
      expect(curvePoint).toBeDefined();
      expect(curvePoint.current).toBeCloseTo(1.3, 6);

      const op = JSON.parse(screen.getByTestId('scatter-Operating Point').dataset.points)[0];
      expect(op.q).toBeCloseTo(60, 6);
      expect(op.dp).toBeCloseTo(1.3, 6);
      expect(op.dp).toBeCloseTo(curvePoint.current, 6);
      expect(screen.getByText(/1\.30\s*bar/)).not.toBeNull();
    });

    it('plots backend curve and places operating point on curve for PumpDetails', () => {
      const telemetry = {
        inlets: [{ flow_rate: 0.001, pressure: 100000, total_pressure: 110000, density: 1000 }],
        outlets: [{ flow_rate: 0.001, pressure: 200000, total_pressure: 240000, density: 1000 }],
        pump_curves: {
          flow_m3s: [0, 0.001],
          dp_pa: [150000, 130000],
        },
      };
      render(
        <UnitProvider>
          <PumpDetails node={{ type: 'centrifugal_pump', data: { telemetry } }} />
        </UnitProvider>
      );
      expect(screen.queryByText(/Run a simulation to see the.*curve/i)).toBeNull();
      const rows = JSON.parse(screen.getByTestId('chart').dataset.rows);
      const curvePoint = rows.find((r) => Math.abs(r.q - 60) < 1e-6);
      expect(curvePoint).toBeDefined();
      expect(curvePoint.pump).toBeCloseTo(1.3, 6);

      const op = JSON.parse(screen.getByTestId('scatter-Operating Point').dataset.points)[0];
      expect(op.q).toBeCloseTo(60, 6);
      expect(op.p).toBeCloseTo(1.3, 6);
      expect(op.p).toBeCloseTo(curvePoint.pump, 6);
      expect(screen.getByText(/1\.30\s*bar/)).not.toBeNull();
    });
  });

  describe('cross legend icon for Operating Point', () => {
    it.each([
      ['OrificeDetails', OrificeDetails, 'orifice', {
        ports: [
          { flow_rate: 0.001, pressure: 200000, total_pressure: 240000, density: 1000, viscosity: 0.001 },
          { flow_rate: -0.001, pressure: 100000, total_pressure: 110000, density: 1000, viscosity: 0.001 },
        ],
        orifice_curves: { flow_m3s: [0, 0.001], dp_pa: [0, 130000] },
      }],
      ['FilterDetails', FilterDetails, 'filter', {
        ports: [
          { flow_rate: 0.001, pressure: 200000, total_pressure: 240000, density: 1000, viscosity: 0.001 },
          { flow_rate: -0.001, pressure: 100000, total_pressure: 110000, density: 1000, viscosity: 0.001 },
        ],
        filter_curves: { flow_m3s: [0, 0.001], dp_clean_pa: [0, 50000], dp_current_pa: [0, 130000], dp_terminal_pa: [0, 200000] },
      }],
      ['PumpDetails', PumpDetails, 'centrifugal_pump', {
        inlets: [{ flow_rate: 0.001, pressure: 100000, total_pressure: 110000, density: 1000 }],
        outlets: [{ flow_rate: 0.001, pressure: 200000, total_pressure: 240000, density: 1000 }],
        pump_curves: { flow_m3s: [0, 0.001], dp_pa: [150000, 130000] },
      }],
    ])('renders cross legend icon for Operating Point in %s', (_name, Component, type, telemetry) => {
      render(
        <UnitProvider>
          <Component node={{ type, data: { telemetry } }} />
        </UnitProvider>
      );
      const legend = screen.getByTestId('legend');
      const crossPath = legend.querySelector('svg path[d*="M7 1V13"], svg path[d*="M1 7H13"]');
      expect(crossPath).not.toBeNull();
    });
  });
});
