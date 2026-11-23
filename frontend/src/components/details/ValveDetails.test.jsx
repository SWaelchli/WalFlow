import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { UnitProvider } from '../../context/UnitContext';
import { UNIT_SYSTEMS } from '../../utils/converters';
import ValveDetails from './ValveDetails';

// jsdom has no layout, so ResponsiveContainer renders nothing. Stub recharts and expose what
// ValveDetails computes from the backend curves: chart rows, axis domains, headroom line, markers.
vi.mock('recharts', () => {
  const Null = () => null;
  return {
    ResponsiveContainer: ({ children }) => <div>{children}</div>,
    ComposedChart: ({ data, children }) => (
      <div data-testid="chart" data-rows={JSON.stringify(data)}>{children}</div>
    ),
    XAxis: ({ domain, ticks, xAxisId }) => <i data-testid={`xaxis-${xAxisId ?? 'main'}`} data-domain={JSON.stringify(domain)} data-ticks={JSON.stringify(ticks)} />,
    YAxis: ({ domain }) => <i data-testid="yaxis" data-domain={JSON.stringify(domain)} />,
    CartesianGrid: Null, ReferenceArea: Null,
    Line: ({ name, data }) => (data ? <i data-testid={`line-${name}`} data-points={JSON.stringify(data)} /> : null),
    Scatter: ({ name, data }) => <i data-testid={`scatter-${name}`} data-points={JSON.stringify(data)} />,
  };
});

afterEach(() => { cleanup(); localStorage.clear(); });

// Flow 60 and 120 L/min at 0.5 bar, valve passes 120 L/min fully open at that drop; Cv 5 of 10 at 50 % opening
const curves = {
  flow_m3s: [0, 0.001, 0.002],
  dp_current_pa: [0, 50000, 200000],
  dp_full_open_pa: [0, 12500, 50000],
  cv_max: 10,
  dp_op_pa: 50000,
  flow_full_open_m3s: 0.002,
  opening_pct: [0, 50, 100],
  cv: [0, 5, 10],
  flow_at_dp_op_m3s: [0, 0.001, 0.002],
};
const noFlowCurves = { ...curves, dp_op_pa: null, flow_full_open_m3s: null, flow_at_dp_op_m3s: [] };

const telemetry = (extra = {}) => ({
  opening_pct: 50,
  cv: 5,
  inlets: [{ flow_rate: 0.001, pressure: 300000 }],
  outlets: [{ pressure: 200000 }],
  valve_curves: curves,
  ...extra,
});

const renderValve = (data, type = 'linear_control_valve', system = UNIT_SYSTEMS.METRIC) => render(
  <UnitProvider initialUnitSystem={system}>
    <ValveDetails node={{ type, data }} />
  </UnitProvider>
);

const point = (name) => {
  const el = screen.queryByTestId(`scatter-${name}`);
  return el ? JSON.parse(el.dataset.points)[0] : null;
};
const rowsOf = () => JSON.parse(screen.getByTestId('chart').dataset.rows);
const domainOf = (id) => JSON.parse(screen.getByTestId(id).dataset.domain);
const tableRows = () => Object.fromEntries(
  Array.from(document.querySelectorAll('tr')).map((tr) => {
    const [label, value] = Array.from(tr.querySelectorAll('td')).map((td) => td.textContent);
    return [label, value];
  })
);
const toggleTo = (value) => fireEvent.click(screen.getByTestId(`segmented-${value}`));

const NO_CURVES = 'Run a simulation to see the valve curves';
const NO_FLOW = 'No flow through the valve, so there is no operating point to plot';

describe('ValveDetails chart', () => {
  it('shows the placeholder, no chart, until the backend sends valve_curves', () => {
    renderValve({ telemetry: telemetry({ valve_curves: undefined }) });
    expect(screen.queryByText(NO_CURVES)).not.toBeNull();
    expect(screen.queryByTestId('chart')).toBeNull();
  });

  it('plots delta-P against flow with the operating point and headroom to the full-open flow', () => {
    renderValve({ telemetry: telemetry() });
    const group = screen.getByRole('group', { name: 'Valve chart' });
    expect(within(group).getByTestId('segmented-dp-flow').getAttribute('aria-pressed')).toBe('true');
    expect(within(group).getByTestId('segmented-flow-cv').getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByTestId('valve-chart-dp-flow')).toBeTruthy();

    // Differences, not absolute pressures: the 3 bar(a) inlet must not leak in
    const rows = rowsOf();
    expect(rows.map((r) => r.q)).toEqual([0, 60, 120]);
    expect(rows.map((r) => r.current)).toEqual([0, 0.5, 2]);
    expect(rows.map((r) => r.full)).toEqual([0, 0.125, 0.5]);
    expect(domainOf('xaxis-main')).toEqual([0, 120]);
    expect(domainOf('yaxis')[0]).toBe(0);

    expect(point('Operating point')).toEqual({ q: 60, dp: 0.5 });
    expect(JSON.parse(screen.getByTestId('line-Headroom').dataset.points)).toEqual([
      { q: 60, dp: 0.5 }, { q: 120, dp: 0.5 },
    ]);
    // The operating point lies on the current-opening curve
    expect(rows.find((r) => r.q === point('Operating point').q).current).toBe(point('Operating point').dp);
  });

  it('converts the chart to imperial: gpm and psi', () => {
    renderValve({ telemetry: telemetry() }, 'linear_control_valve', UNIT_SYSTEMS.IMPERIAL);
    const rows = rowsOf();
    expect(rows[1].q).toBeCloseTo(15.8503, 3);       // 60 L/min
    expect(rows[1].current).toBeCloseTo(7.2519, 3);  // 0.5 bar
    expect(point('Operating point').dp).toBeCloseTo(7.2519, 3);
  });

  it('switches to Flow - Cv, where the operating point lies on the Cv curve', () => {
    renderValve({ telemetry: telemetry() });
    toggleTo('flow-cv');
    expect(screen.getByTestId('segmented-flow-cv').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('segmented-dp-flow').getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByTestId('valve-chart-dp-flow')).toBeNull();
    expect(screen.getByTestId('valve-chart-flow-cv')).toBeTruthy();

    const rows = rowsOf();
    expect(rows).toEqual([{ cv: 0, opening: 0, q: 0 }, { cv: 5, opening: 50, q: 60 }, { cv: 10, opening: 100, q: 120 }]);
    expect(domainOf('xaxis-cv')).toEqual([0, 10]);
    // Top opening axis spans the full 0..100 % with its own ticks, not just the 100 % at the left edge
    expect(domainOf('xaxis-opening')).toEqual([0, 100]);
    expect(JSON.parse(screen.getByTestId('xaxis-opening').dataset.ticks)).toEqual([0, 20, 50, 80, 100]);
    const op = point('Operating point');
    expect(op).toEqual({ cv: 5, q: 60 });
    expect(rows.find((r) => r.cv === op.cv).q).toBe(op.q);

    toggleTo('dp-flow');
    expect(screen.getByTestId('valve-chart-dp-flow')).toBeTruthy();
  });

  it('without flow, Flow - Cv explains there is no operating point; the shut valve still shows its curves in delta-P', () => {
    renderValve({ telemetry: telemetry({ valve_curves: noFlowCurves, inlets: [{ flow_rate: 0, pressure: 300000 }] }) });
    expect(screen.queryByText(NO_FLOW)).toBeNull();
    expect(screen.queryByTestId('chart')).not.toBeNull();
    expect(point('Operating point')).toBeNull();
    expect(screen.queryByTestId('line-Headroom')).toBeNull();

    toggleTo('flow-cv');
    expect(screen.queryByText(NO_FLOW)).not.toBeNull();
    expect(screen.queryByTestId('chart')).toBeNull();
  });

  it('empty curve arrays give the no-flow placeholder in both modes', () => {
    const empty = { ...noFlowCurves, flow_m3s: [], dp_current_pa: [], dp_full_open_pa: [], cv: [], opening_pct: [] };
    renderValve({ telemetry: telemetry({ valve_curves: empty }) });
    expect(screen.queryByText(NO_FLOW)).not.toBeNull();
    toggleTo('flow-cv');
    expect(screen.queryByText(NO_FLOW)).not.toBeNull();
  });
});

describe('ValveDetails operating point table', () => {
  it.each([
    ['metric', UNIT_SYSTEMS.METRIC, {
      'Current Opening': '50.0%', 'Valve ΔP': '0.50bar', 'Max flow, full open': '120.0L/min',
      'Capacity used': '50.0%', 'Sensed Pressure': '2.00bar(a)', 'Target Setpoint': '2.50bar(a)',
    }],
    ['imperial', UNIT_SYSTEMS.IMPERIAL, {
      'Current Opening': '50.0%', 'Valve ΔP': '7.25psi', 'Max flow, full open': '31.7gpm',
      'Capacity used': '50.0%', 'Sensed Pressure': '29.01psia', 'Target Setpoint': '36.26psia',
    }],
  ])('regulator rows in %s units', (_n, system, expected) => {
    renderValve({ set_pressure_pa: 250000, telemetry: telemetry() }, 'linear_regulator', system);
    expect(tableRows()).toMatchObject(expected);
  });

  it('control valve has no Target Setpoint; remote sensing shows the sensed, not the own, pressure', () => {
    renderValve({ telemetry: telemetry({ sensed_pressure: 250000 }) });
    expect(tableRows()['Target Setpoint']).toBeUndefined();
    expect(tableRows()['Sensed Pressure']).toBe('2.50bar(a)');
  });

  it('shows dashes for delta-P, full-open flow and capacity when nothing flows', () => {
    renderValve({ telemetry: telemetry({ valve_curves: noFlowCurves }) });
    const rows = tableRows();
    expect(rows['Valve ΔP']).toMatch(/^—/);
    expect(rows['Max flow, full open']).toMatch(/^—/);
    expect(rows['Capacity used']).toMatch(/^—/);
  });
});

describe('ValveDetails warnings', () => {
  it.each([
    ['none', {}, [], ['CAVITATION RISK', 'FLASHING']],
    ['a cavitation flag (no cavitation callout)', { cavitation_warning: true }, [], ['CAVITATION RISK', 'FLASHING']],
    ['flashing', { flashing_warning: true }, ['FLASHING'], ['CAVITATION RISK']],
    ['flashing with a cavitation flag', { cavitation_warning: true, flashing_warning: true }, ['FLASHING'], ['CAVITATION RISK']],
  ])('callouts for %s', (_n, flags, shown, hidden) => {
    renderValve({ telemetry: telemetry(flags) });
    shown.forEach((t) => expect(screen.queryByText(t)).not.toBeNull());
    hidden.forEach((t) => expect(screen.queryByText(t)).toBeNull());
  });
});
