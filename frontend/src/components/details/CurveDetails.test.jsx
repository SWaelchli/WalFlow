import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
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
    YAxis: ({ domain }) => <i data-testid="y-axis" data-domain={JSON.stringify(domain)} />,
    CartesianGrid: Null,
    Line: Null,
    Scatter: ({ name, data }) => <i data-testid={`scatter-${name}`} data-points={JSON.stringify(data)} />,
  };
});

afterEach(cleanup);

// Text of the result row with this label: value and unit sit in separate cells
const rowText = (label) => screen.getByText(label).closest('tr').textContent;

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
      expect(rowText('Current ΔP')).toMatch(/1\.30\s*bar/);
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
      expect(rowText('Current ΔP')).toMatch(/1\.30\s*bar/);
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
      expect(rowText('Pressure Increase')).toMatch(/1\.30\s*bar/);
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
      const entry = Array.from(document.querySelectorAll('.result-chart-legend-item')).find((e) => e.textContent === 'Operating Point');
      expect(entry.querySelector('svg path[d*="M7 1V13"]')).not.toBeNull();
    });
  });

  describe('volumetric pump y-axis floor', () => {
    const yDomain = (outletPa) => {
      render(
        <UnitProvider>
          <PumpDetails node={{ type: 'volumetric_pump', data: { telemetry: {
            inlets: [{ flow_rate: 0.001, pressure: 100000, total_pressure: 100000, density: 1000 }],
            outlets: [{ flow_rate: 0.001, pressure: outletPa, total_pressure: outletPa, density: 1000 }],
            pump_curves: { flow_m3s: [0, 0.001], dp_pa: [150000, 130000] },
          } } }} />
        </UnitProvider>
      );
      return JSON.parse(screen.getByTestId('y-axis').dataset.domain);
    };

    it.each([
      ['positive operating point starts at 0', 300000, 0],
      ['negative operating point (-1.3 bar) floors below it', -30000, -2],
    ])('%s', (_name, outletPa, expectedMin) => {
      expect(yDomain(outletPa)[0]).toBe(expectedMin);
    });
  });

  describe('centrifugal pump chart', () => {
    const telemetry = (overrides = {}) => ({
      inlets: [{ flow_rate: 0.001, pressure: 100000, total_pressure: 100000, density: 1000 }],
      outlets: [{ flow_rate: 0.001, pressure: 300000, total_pressure: 300000, density: 1000 }],
      pump_curves: {
        flow_m3s: [0, 0.001, 0.002, 0.003],
        dp_pa: [300000, 200000, 50000, -100000],
        system_dp_pa: [10000, 20000, 50000, 90000],
      },
      ...overrides,
    });
    const renderPump = (tel, data = {}) => render(
      <UnitProvider>
        <PumpDetails node={{ type: 'centrifugal_pump', data: { ...data, telemetry: tel } }} />
      </UnitProvider>
    );

    it('ends the curve on the zero-head flow, starts the axis at 0 and takes the system curve from the backend', () => {
      renderPump(telemetry());
      const rows = JSON.parse(screen.getByTestId('chart').dataset.rows);
      expect(rows.every((r) => r.pump >= 0)).toBe(true);
      expect(rows).toHaveLength(4);
      // Interpolated zero-head point: 50000 / 150000 of the way from 120 to 180 L/min
      expect(rows[3].q).toBeCloseTo(140, 6);
      expect(rows[3].pump).toBe(0);
      expect(rows[1].system).toBeCloseTo(0.2, 6);
      expect(JSON.parse(screen.getByTestId('y-axis').dataset.domain)[0]).toBe(0);
      expect(screen.queryByText('System (estimate)')).not.toBeNull();
    });

    it('shows head in metres of the inlet fluid when switched to Head', () => {
      renderPump(telemetry({
        outlets: [{ flow_rate: 0.001, pressure: 200000, total_pressure: 200000, density: 1000 }],
      }));
      fireEvent.click(screen.getByText('Head'));
      const op = JSON.parse(screen.getByTestId('scatter-Operating Point').dataset.points)[0];
      expect(op.p).toBeCloseTo(100000 / (1000 * 9.80665), 6);
    });

    it('shows the flow as a share of the rated flow', () => {
      renderPump(telemetry(), { flow_rated_lmin: 120 });
      expect(rowText('Flow (% of rated)')).toMatch(/50/);
    });

    it('warns about reverse flow through a running pump', () => {
      renderPump(telemetry({
        inlets: [{ flow_rate: -0.001, pressure: 100000, total_pressure: 100000, density: 1000 }],
      }));
      expect(screen.queryByText('REVERSE FLOW')).not.toBeNull();
    });

    it('warns when a forward-flow pump is driven past its zero-head flow', () => {
      renderPump(telemetry({
        outlets: [{ flow_rate: 0.001, pressure: 50000, total_pressure: 50000, density: 1000 }],
      }));
      expect(screen.queryByText('PAST ZERO-HEAD FLOW')).not.toBeNull();
      expect(screen.queryByText('REVERSE FLOW')).toBeNull();
    });

    it('draws no system curve without flow', () => {
      renderPump(telemetry({
        inlets: [{ flow_rate: 0, pressure: 100000, total_pressure: 100000, density: 1000 }],
        pump_curves: { flow_m3s: [0, 0.001], dp_pa: [300000, 200000] },
      }));
      expect(screen.queryByText('System (estimate)')).toBeNull();
    });
  });
});
