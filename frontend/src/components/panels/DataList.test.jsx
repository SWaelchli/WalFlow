import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import DataList from './DataList';
import { UnitProvider } from '../../context/UnitContext';
import { UNIT_SYSTEMS } from '../../utils/converters';

// The schedule catalogue request has no server in jsdom; the bundled datasets are used instead
vi.mock('axios', () => ({ default: { get: vi.fn(() => Promise.resolve({ data: [] })) } }));

afterEach(() => { cleanup(); localStorage.clear(); });

const nodes = [
  { id: 'n1', type: 'tank', position: { x: 0, y: 0 }, data: { label: 'T-1' } },
  { id: 'n2', type: 'tank', position: { x: 0, y: 100 }, data: { label: 'T-2' } },
];
const edges = [
  { id: 'e1', source: 'n1', target: 'n2', data: { type: 'PIPE', label: 'Pipe 1', length_m: 25, diameter_m: 0.1 } },
];

const renderList = (onUpdateEdge = vi.fn(), unitSystem = UNIT_SYSTEMS.METRIC) => {
  render(
    <UnitProvider initialUnitSystem={unitSystem}>
      <DataList nodes={nodes} edges={edges} rawNodes={nodes} rawEdges={edges} onUpdateEdge={onUpdateEdge} onSelectNode={vi.fn()} onSelectEdge={vi.fn()} />
    </UnitProvider>
  );
  return onUpdateEdge;
};

const headerAndCellCounts = () => {
  const table = screen.getByDisplayValue('Pipe 1').closest('table');
  return [table.querySelectorAll('thead th').length, table.querySelectorAll('tbody tr')[0].querySelectorAll('td').length];
};

describe('results table headers line up with the cells', () => {
  it('pipe list has a Name header and one header per cell', () => {
    renderList();
    expect(screen.getByText(/^Name/)).toBeTruthy();
    const [th, td] = headerAndCellCounts();
    expect(th).toBe(td);
  });

  it('full equipment list has one header per cell', () => {
    renderList();
    fireEvent.click(screen.getByText('Full Equipment & Pipeline Data'));
    const [th, td] = headerAndCellCounts();
    expect(th).toBe(td);
  });
});

describe('relief analysis matrix', () => {
  const psvNodes = [{ id: 'psv', type: 'pressure_safety_valve', position: { x: 0, y: 0 }, data: { label: 'PSV-1', set_pressure_barg: 2.98675 } }];
  const reliefCase = (relief) => ({
    id: 'case_base', name: 'Case 1', is_base: true, overrides: { nodes: {} },
    telemetry: { nodes: {}, edges: {}, relief }, kpis: { relieved_pressure_bara: 2.55 },
  });
  const renderRelief = (cases) => {
    render(
      <UnitProvider initialUnitSystem={UNIT_SYSTEMS.METRIC}>
        <DataList nodes={psvNodes} edges={[]} rawNodes={psvNodes} rawEdges={[]} cases={cases} onSelectNode={vi.fn()} onSelectEdge={vi.fn()} />
      </UnitProvider>
    );
    fireEvent.click(screen.getByText('Relief Analysis Matrix'));
  };

  it('shows the peak at the governing opening and the device result', () => {
    renderRelief([reliefCase({
      peak: { available: true, pressure_bara: 4.0, source: 'opening', device_ids: ['psv'], ramp_pct: 62.3 },
      devices: { psv: { status: 'overcapacity', forced_state: 'auto', opening_order: 1, opening_ramp_pct: 62.3, inlet_at_opening_bara: 4.0, inlet_relieved_bara: 2.548 } },
    })]);
    expect(screen.getByText('At opening of PSV-1 · 62.3 % load')).toBeTruthy();
    expect(screen.getByText('PSV-1 · 62.3 % load')).toBeTruthy();
    expect(screen.getByText('Overcapacity #1')).toBeTruthy();
  });

  it('says why the peak is not available', () => {
    renderRelief([reliefCase({ peak: { available: false, reason: 'No ramped driver.', pressure_bara: null }, devices: {} })]);
    expect(screen.getAllByText('Not available').length).toBe(2);
    expect(screen.getAllByText('Not available')[0].closest('td').title).toBe('No ramped driver.');
  });

  it('asks for a re-run on results from before the relief analysis', () => {
    renderRelief([reliefCase(undefined)]);
    expect(screen.getByText('Re-run the simulation')).toBeTruthy();
  });

  it('Shows the set pressure in bar g and a cycling result as text', () => {
    renderRelief([reliefCase({
      peak: { available: true, pressure_bara: 4.2, source: 'relieved', device_ids: [] },
      devices: { psv: { status: 'cycling', forced_state: 'auto', opening_order: 1, opening_ramp_pct: 62.3, inlet_at_opening_bara: 4.0, inlet_relieved_bara: 4.21,
        cycle_low_barg: 2.78, cycle_high_barg: 2.99, relief_flow_lmin: 12.0, lift_pct: null } },
    })]);
    expect(screen.getByText('2.99 bar g')).toBeTruthy();
    const badge = screen.getByText('Cycling #1');
    expect(badge.closest('div[title]').title).toMatch(/cycles between reseat and set pressure/);
    expect(screen.getByText('Cycles 2.78 bar g–2.99 bar g · avg 12.0 L/min')).toBeTruthy();
  });

  it('shows the lift of a modulating valve and a backpressure limit breach', () => {
    renderRelief([reliefCase({
      peak: { available: true, pressure_bara: 4.2, source: 'relieved', device_ids: [] },
      devices: { psv: { status: 'modulating', lift_pct: 67.6, forced_state: 'auto', opening_order: 1, opening_ramp_pct: 62.3, inlet_at_opening_bara: 4.0, inlet_relieved_bara: 4.21,
        bp_exceeded: true, bp_basis: 'built_up', bp_pct_of_set: 13.9, bp_limit_pct: 10.0 } },
    })]);
    expect(screen.getByText('Modulating 68 % #1')).toBeTruthy();
    expect(screen.getByText(/BP 14 % > 10 %/)).toBeTruthy();
  });

  it('shows "missing" for a device from an older file without a gauge set pressure', () => {
    const oldNodes = [{ id: 'psv', type: 'pressure_safety_valve', position: { x: 0, y: 0 }, data: { label: 'PSV-1', set_pressure_bar: 20.0 } }];
    render(
      <UnitProvider initialUnitSystem={UNIT_SYSTEMS.METRIC}>
        <DataList nodes={oldNodes} edges={[]} rawNodes={oldNodes} rawEdges={[]} cases={[reliefCase(undefined)]} onSelectNode={vi.fn()} onSelectEdge={vi.fn()} />
      </UnitProvider>
    );
    fireEvent.click(screen.getByText('Relief Analysis Matrix'));
    expect(screen.getByText('missing')).toBeTruthy();
  });
});

describe('operating cases matrix without results', () => {
  const psvNodes = [{ id: 'psv', type: 'pressure_safety_valve', position: { x: 0, y: 0 }, data: { label: 'PSV-1', set_pressure_barg: 5 } }];
  const rowCell = (label) => screen.getByText(new RegExp(`^${label}`)).closest('tr').querySelectorAll('td')[1].textContent;

  const base = { id: 'case_base', name: 'Case 1', is_base: true, overrides: { nodes: {} } };
  const telemetry = { nodes: { psv: { outlets: [{ flow_rate: 0 }] } }, edges: {} };

  it.each([
    ['never run', base, '—', /^—$/],
    ['run with zero relief', { ...base, kpis: {}, telemetry }, 'Normal', /^0(\.0+)? L\/min$/],
    ['kpis but no telemetry', { ...base, kpis: {} }, 'Normal', /^—$/],
    ['telemetry but no kpis', { ...base, telemetry }, '—', /^0(\.0+)? L\/min$/],
  ])('%s: cavitation and total relief flow cells', (_, c, cavitation, relief) => {
    render(
      <UnitProvider initialUnitSystem={UNIT_SYSTEMS.METRIC}>
        <DataList nodes={psvNodes} edges={[]} rawNodes={psvNodes} rawEdges={[]} cases={[c]} activeCaseId="case_base" onSelectNode={vi.fn()} onSelectEdge={vi.fn()} />
      </UnitProvider>
    );
    fireEvent.click(screen.getByText('Operating Cases Matrix'));
    expect(rowCell('Cavitation Risk Status')).toBe(cavitation);
    fireEvent.click(screen.getByText('Relief Analysis Matrix'));
    expect(rowCell('Total Relief Flow')).toMatch(relief);
  });
});

describe('operating cases matrix in gauge basis', () => {
  const caseList = [
    { id: 'case_base', name: 'Case 1', is_base: true, overrides: { nodes: {} }, kpis: { max_pressure_bar: 5 } },
    { id: 'case_2', name: 'Case 2', overrides: { nodes: {}, global_settings: { atmospheric_pressure: 85000 } }, kpis: { max_pressure_bar: 5 } },
  ];
  const maxPressureRow = (activeCaseId) => {
    localStorage.setItem('walflow_pressure_basis', 'gauge');
    render(
      <UnitProvider initialUnitSystem={UNIT_SYSTEMS.METRIC}>
        <DataList nodes={[]} edges={[]} rawNodes={[]} rawEdges={[]} cases={caseList} activeCaseId={activeCaseId}
          globalSettings={{ atmospheric_pressure: 101325 }} onSelectNode={vi.fn()} onSelectEdge={vi.fn()} />
      </UnitProvider>
    );
    fireEvent.click(screen.getByText('Operating Cases Matrix'));
    return [...screen.getByText(/^System Max Pressure/).closest('tr').querySelectorAll('td')].slice(1).map(td => td.textContent);
  };

  it.each([['case_base'], ['case_2']])('converts each case with its own atmospheric pressure, active case %s', (active) => {
    const [base, other] = maxPressureRow(active);
    expect(base).toMatch(/^3\.99 bar g$/);        // 5 bar a - 1.01325
    expect(other).toMatch(/^4\.15 bar g\s*\+0\.16 bar/);   // 5 bar a - 0.85, delta is the atmospheric difference
  });
});

describe('collapsed data panel', () => {
  afterEach(() => localStorage.clear());
  const mount = () => render(
    <UnitProvider initialUnitSystem={UNIT_SYSTEMS.METRIC}>
      <DataList nodes={nodes} edges={edges} rawNodes={nodes} rawEdges={edges} onUpdateEdge={vi.fn()} onSelectNode={vi.fn()} onSelectEdge={vi.fn()} />
    </UnitProvider>
  );

  it.each([
    ['collapsed', true],
    ['expanded', false],
  ])('a tab click when %s switches the tab and leaves the panel expanded', (_, collapsed) => {
    localStorage.setItem('walflow_datalist_panel', JSON.stringify({ collapsed }));
    mount();
    expect(screen.getByLabelText(collapsed ? 'Expand data panel' : 'Collapse data panel')).toBeTruthy();
    fireEvent.click(screen.getByText('Measurements'));
    expect(screen.getByLabelText('Collapse data panel').getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Measurements').className).toContain('active');
  });
});

describe('changing a forced state in the relief matrix', () => {
  const baseCase = { id: 'case_base', name: 'Case 1', is_base: true, overrides: { nodes: {} } };
  const psvAt = (forced_state) => [{ id: 'psv', type: 'pressure_safety_valve', position: { x: 0, y: 0 }, data: { label: 'PSV-1', set_pressure_barg: 5.0, forced_state } }];
  const tree = (nodesList, props) => (
    <UnitProvider initialUnitSystem={UNIT_SYSTEMS.METRIC}>
      <DataList nodes={nodesList} edges={[]} rawNodes={nodesList} rawEdges={[]} cases={[baseCase]} activeCaseId="case_base" onSelectNode={vi.fn()} onSelectEdge={vi.fn()} {...props} />
    </UnitProvider>
  );

  afterEach(() => vi.unstubAllGlobals());

  it('solves the batch with the new state and re-runs the active case once the state has arrived', () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ results: [] }) }));
    vi.stubGlobal('fetch', fetchMock);
    const runSimulation = vi.fn();
    const onUpdateNode = vi.fn();
    const props = { runSimulation, onUpdateNode };
    const { rerender } = render(tree(psvAt('auto'), props));
    fireEvent.click(screen.getByText('Relief Analysis Matrix'));

    fireEvent.change(screen.getByDisplayValue('Auto (Normal Relief)'), { target: { value: 'forced_open' } });

    expect(onUpdateNode).toHaveBeenCalledWith('psv', { forced_state: 'forced_open' }, 'case_base');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.nodes[0].data.forced_state).toBe('forced_open');
    // runSimulation still holds the old graph until the parent re-renders with the new state
    expect(runSimulation).not.toHaveBeenCalled();

    rerender(tree(psvAt('forced_open'), props));
    expect(runSimulation).toHaveBeenCalledTimes(1);
  });
});

describe('Measurements tab', () => {
  const instNodes = (data = {}) => [
    { id: 'mp', type: 'measure_point', position: { x: 0, y: 0 }, data: { label: 'TAP-1' } },
    { id: 'i', type: 'instrument', position: { x: 0, y: 80 }, data: { label: 'PIT 1', variable: 'P', pressure_basis: 'gauge', alarm_h: 2, ...data } },
  ];
  const signal = [{ id: 's', source: 'mp', sourceHandle: 'signal-inlet-0', target: 'i', targetHandle: 'signal-in', data: { type: 'SIGNAL' } }];
  const solvedCase = (id, name, barg, extra = {}) => ({
    id, name, overrides: { nodes: {} }, ...extra,
    telemetry: { nodes: { mp: { inlets: [{ pressure: 101325 + barg * 1e5 }] } }, edges: {} },
  });
  const cases = [solvedCase('case_base', 'Case 1', 2.5, { is_base: true }), solvedCase('case_2', 'Case 2', 1.5)];
  const renderMeasurements = (onUpdateNode = vi.fn(), nodesList = instNodes()) => {
    render(
      <UnitProvider initialUnitSystem={UNIT_SYSTEMS.METRIC}>
        <DataList nodes={nodesList} edges={signal} rawNodes={nodesList} rawEdges={signal} cases={cases} activeCaseId="case_base" onUpdateNode={onUpdateNode} onSelectNode={vi.fn()} onSelectEdge={vi.fn()} />
      </UnitProvider>
    );
    fireEvent.click(screen.getByText('Measurements'));
    return onUpdateNode;
  };

  it('shows one row per instrument with its location and one reading per case, flagged by alarm', () => {
    renderMeasurements();
    expect(screen.getByText('PIT 1')).toBeTruthy();
    expect(screen.getByText('TAP-1')).toBeTruthy();
    expect(screen.getByText('2.50').closest('td').textContent).toMatch(/^H2\.50bar g$/);
    expect(screen.getByText('1.50').closest('td').textContent).toBe('1.50bar g');
  });

  it('commits an edited limit to the instrument and rejects limits out of order', () => {
    const onUpdateNode = renderMeasurements();
    const hh = screen.getByLabelText('HH limit of PIT 1 (bar g)');

    fireEvent.change(hh, { target: { value: '1' } });
    fireEvent.blur(hh);
    expect(onUpdateNode).not.toHaveBeenCalled();

    fireEvent.change(hh, { target: { value: '3' } });
    fireEvent.blur(hh);
    expect(onUpdateNode).toHaveBeenCalledWith('i', { alarm_hh: 3 });
  });

  it('says so when there are no instruments', () => {
    renderMeasurements(vi.fn(), [instNodes()[0]]);
    expect(screen.getByText(/No instruments in the current diagram/)).toBeTruthy();
  });
});

describe('pipe rows', () => {
  it('shows an older non-standard pipe as Manual with its custom inner diameter', () => {
    renderList();
    expect(screen.getByText('Custom ID 100.00 mm')).toBeTruthy();
    expect(screen.getByDisplayValue('Custom / Manual')).toBeTruthy();
  });

  it('commits the length on blur and rejects an empty length', () => {
    const onUpdateEdge = renderList();
    const input = screen.getByDisplayValue('25');

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(onUpdateEdge).not.toHaveBeenCalled();

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '40' } });
    fireEvent.blur(input);
    expect(onUpdateEdge).toHaveBeenCalledWith('e1', { length_m: 40 });
  });
});

describe('two-port neutral component row', () => {
  const rowCells = (p0Flow) => {
    const port = (flow_rate, pressure, temperature) => ({ flow_rate, pressure, temperature });
    const orifice = [{
      id: 'o1', type: 'orifice', position: { x: 0, y: 0 },
      data: { label: 'FO-1', telemetry: { ports: [port(p0Flow, 300000, 350), port(-p0Flow, 200000, 300)] } },
    }];
    render(
      <UnitProvider initialUnitSystem={UNIT_SYSTEMS.METRIC}>
        <DataList nodes={orifice} edges={[]} rawNodes={orifice} rawEdges={[]} onSelectNode={vi.fn()} onSelectEdge={vi.fn()} />
      </UnitProvider>
    );
    fireEvent.click(screen.getByText('Full Equipment & Pipeline Data'));
    return [...screen.getByText('Orifice', { selector: 'td' }).closest('tr').querySelectorAll('td')].map((td) => td.textContent);
  };

  it('shows the temperature of the downstream port, which is port 0 for reverse flow', () => {
    const forward = rowCells(0.01);
    cleanup();
    const reverse = rowCells(-0.01);
    expect(forward.at(-1)).toBe('26.9');
    expect(reverse.at(-1)).toBe('76.9');
  });
});
