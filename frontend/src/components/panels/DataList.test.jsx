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
  const table = document.querySelector('table');
  return [table.querySelectorAll('thead th').length, table.querySelectorAll('tbody tr')[0].querySelectorAll('td').length];
};

describe('results table headers line up with the cells', () => {
  it('pipe list has a Name header and one header per cell', () => {
    renderList();
    expect(screen.getByText(/^Name/)).toBeTruthy();
    const [th, td] = headerAndCellCounts();
    expect(th).toBe(td);
  });

  it('full equipment list has one header per cell and no pipe rows', () => {
    renderList();
    const equipmentTab = screen.getByRole('button', { name: 'Equipment' });
    expect(equipmentTab.title).toBe('Full Equipment Data');
    fireEvent.click(equipmentTab);
    const [th, td] = headerAndCellCounts();
    expect(th).toBe(td);
    expect(screen.queryByDisplayValue('Pipe 1')).toBeNull();
    expect(screen.queryByText('Pipe', { selector: 'td' })).toBeNull();
  });
});

describe('results toolbar and case columns', () => {
  const psvNodes = [{ id: 'psv', type: 'pressure_safety_valve', position: { x: 0, y: 0 }, data: { label: 'PSV-1', set_pressure_barg: 5 } }];
  const stale = { id: 'case_2', name: 'Case 2', overrides: { nodes: {} }, kpis: {}, telemetry: { nodes: {}, edges: {}, relief: {} } };
  const base = { id: 'case_base', name: 'Case 1', is_base: true, overrides: { nodes: {} }, kpis: {}, telemetry: { nodes: {}, edges: {}, relief: {} } };

  it.each([
    ['Pipes', true], ['Equipment', true], ['Cases', false], ['Relief', false], ['Measurements', false],
  ])('%s tab: filter and auto sort only where the table is a list', (tab, hasControls) => {
    render(
      <UnitProvider initialUnitSystem={UNIT_SYSTEMS.METRIC}>
        <DataList nodes={psvNodes} edges={[]} rawNodes={psvNodes} rawEdges={[]} cases={[base, stale]} activeCaseId="case_2" onSelectNode={vi.fn()} onSelectEdge={vi.fn()} />
      </UnitProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: tab }));
    const toolbar = document.querySelector('.datalist-toolbar');
    expect(!!screen.queryByLabelText('Filter list')).toBe(hasControls);
    expect(!!screen.queryByRole('button', { name: 'Auto sort' })).toBe(hasControls);
    expect(toolbar.querySelectorAll('button').length).toBe(hasControls ? 1 : 0);
    expect(screen.queryByRole('button', { name: /New case|Case manager|Solve all|Export CSV|Switch/i })).toBeNull();
  });

  it.each(['Cases', 'Relief'])('%s tab marks the active case column with aria-current and has no Switch button or Active badge', (tab) => {
    render(
      <UnitProvider initialUnitSystem={UNIT_SYSTEMS.METRIC}>
        <DataList nodes={psvNodes} edges={[]} rawNodes={psvNodes} rawEdges={[]} cases={[base, stale]} activeCaseId="case_2" onSelectNode={vi.fn()} onSelectEdge={vi.fn()} />
      </UnitProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: tab }));
    const current = document.querySelectorAll('th[aria-current="true"]');
    expect(current.length).toBe(1);
    expect(current[0].textContent + (current[0].querySelector('input')?.value ?? '')).toMatch(/Case 2/);
    expect(screen.queryByRole('button', { name: /Switch/ })).toBeNull();
    expect(screen.queryByText('Active')).toBeNull();
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
    fireEvent.click(screen.getByRole('button', { name: 'Relief' }));
  };

  it('shows the peak at the governing opening and the device result', () => {
    renderRelief([reliefCase({
      peak: { available: true, pressure_bara: 4.0, source: 'opening', device_ids: ['psv'], ramp_pct: 62.3 },
      devices: { psv: { status: 'overcapacity', forced_state: 'auto', opening_order: 1, opening_ramp_pct: 62.3, inlet_at_opening_bara: 4.0, inlet_relieved_bara: 2.548 } },
    })]);
    // The opening is stated once, in the First relief opening row, not under the peak value
    expect(screen.getAllByText(/62\.3 % load/).length).toBe(1);
    expect(screen.getByText('PSV-1 · 62.3 % load').closest('tr').textContent).toMatch(/^First relief opening/);
    expect(screen.queryByText(/At opening of/)).toBeNull();
    expect(screen.getByText('Overcapacity #1')).toBeTruthy();
    // One header row: no second row repeating the case names
    expect(document.querySelectorAll('thead tr').length).toBe(1);
    expect(screen.queryByText('Run the simulation for results.')).toBeNull();
  });

  it('says why the peak is not available', () => {
    renderRelief([reliefCase({ peak: { available: false, reason: 'No ramped driver.', pressure_bara: null }, devices: {} })]);
    expect(screen.getAllByText('Not available').length).toBe(2);
    expect(screen.getAllByText('Not available')[0].closest('td').title).toBe('No ramped driver.');
  });

  it('says once that there are no results, not in every device cell', () => {
    renderRelief([reliefCase(undefined), { ...reliefCase(undefined), id: 'case_2', name: 'Case 2', is_base: false }]);
    expect(screen.getAllByText('Run the simulation for results.').length).toBe(1);
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
    fireEvent.click(screen.getByRole('button', { name: 'Relief' }));
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
    ['run with zero relief', { ...base, kpis: {}, telemetry }, 'Normal', /^0(\.0+)?$/],
    ['kpis but no telemetry', { ...base, kpis: {} }, 'Normal', /^—$/],
    ['telemetry but no kpis', { ...base, telemetry }, '—', /^0(\.0+)?$/],
  ])('%s: cavitation and total relief flow cells', (_, c, cavitation, relief) => {
    render(
      <UnitProvider initialUnitSystem={UNIT_SYSTEMS.METRIC}>
        <DataList nodes={psvNodes} edges={[]} rawNodes={psvNodes} rawEdges={[]} cases={[c]} activeCaseId="case_base" onSelectNode={vi.fn()} onSelectEdge={vi.fn()} />
      </UnitProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cases' }));
    expect(rowCell('Cavitation Risk Status')).toBe(cavitation);
    fireEvent.click(screen.getByRole('button', { name: 'Relief' }));
    expect(rowCell('Total Relief Flow')).toMatch(relief);
    // The unit sits in the row label only
    expect(screen.getByText(/^Total Relief Flow \(L\/min\)$/)).toBeTruthy();
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
    fireEvent.click(screen.getByRole('button', { name: 'Cases' }));
    return [...screen.getByText(/^System Max Pressure/).closest('tr').querySelectorAll('td')].slice(1).map(td => td.textContent);
  };

  it.each([['case_base'], ['case_2']])('converts each case with its own atmospheric pressure, active case %s', (active) => {
    const [base, other] = maxPressureRow(active);
    expect(screen.getByText(/^System Max Pressure \(bar g\)$/)).toBeTruthy();
    expect(base).toMatch(/^3\.99$/);        // 5 bar a - 1.01325
    expect(other).toMatch(/^4\.15\s*\+0\.16 bar/);   // 5 bar a - 0.85, delta is the atmospheric difference
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
    fireEvent.click(screen.getByRole('button', { name: 'Measurements' }));
    expect(screen.getByLabelText('Collapse data panel').getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Measurements' }).className).toContain('active');
  });

  it('hides the filter toolbar while collapsed and shows it again on expand', () => {
    localStorage.setItem('walflow_datalist_panel', JSON.stringify({ collapsed: true }));
    mount();
    expect(screen.queryByLabelText('Filter list')).toBeNull();
    fireEvent.click(screen.getByLabelText('Expand data panel'));
    expect(screen.getByLabelText('Filter list')).toBeTruthy();
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
    fireEvent.click(screen.getByRole('button', { name: 'Relief' }));

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
    fireEvent.click(screen.getByRole('button', { name: 'Measurements' }));
    return onUpdateNode;
  };

  it('shows one row per instrument with its location and one reading per case, flagged by alarm', () => {
    renderMeasurements();
    expect(screen.getByText('PIT 1')).toBeTruthy();
    expect(screen.getByText('TAP-1')).toBeTruthy();
    expect(screen.getByText('2.50').closest('td').textContent).toMatch(/^H2\.50bar g$/);
    expect(screen.getByText('1.50').closest('td').textContent).toBe('1.50bar g');
    // The active case is marked for assistive tech; there is no Switch button or Active badge
    expect(document.querySelectorAll('th[aria-current="true"]').length).toBe(1);
    expect(screen.queryByRole('button', { name: /Switch/ })).toBeNull();
    expect(screen.queryByText('Active')).toBeNull();
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

describe('pipe class label and project rules', () => {
  const CLASS = { id: 7, code: 'CS01', name: 'Carbon', roughness_mm: 0.045, sizes: [
    { dn: 50, nps: '2', sch: 'STD', od_mm: 60.3, wt_mm: 3.91 }, { dn: 80, nps: '3', sch: 'STD', od_mm: 88.9, wt_mm: 5.49 },
  ] };
  const classPipe = { id: 'e1', source: 'n1', target: 'n2', data: { type: 'PIPE', label: 'Pipe 1', length_m: 25, pipe_class_id: 7, pipe_class_code: 'CS01', standardDn: 50, standardSch: 'STD', diameter_m: 0.0525 } };
  const manualPipe = { ...classPipe, data: { ...classPipe.data, pipe_class_id: 'manual', pipe_class_code: 'CUSTOM' } };
  const renderPipe = (edge, props) => render(
    <UnitProvider initialUnitSystem={UNIT_SYSTEMS.METRIC}>
      <DataList nodes={nodes} edges={[edge]} rawNodes={nodes} rawEdges={[edge]} onUpdateEdge={vi.fn()} onSelectNode={vi.fn()} onSelectEdge={vi.fn()} {...props} />
    </UnitProvider>
  );

  it.each([
    ['in the catalogue but not allowed in the project', [CLASS], '[CS01] not allowed in this project'],
    ['not in a loaded catalogue', [{ ...CLASS, id: 8, code: 'OTHER' }], '[CS01] not in catalogue'],
    ['catalogue not loaded', [], '[CS01]'],
  ])('a pipe whose class is %s keeps its value as a disabled option with the right text', (_n, catalog, text) => {
    renderPipe(classPipe, { catalogPipeClasses: catalog, availablePipeClasses: [] });
    const option = screen.getByRole('option', { name: text });
    expect(option.disabled).toBe(true);
    expect(screen.getByRole('combobox', { name: 'Pipe 1 pipe class' }).value).toBe(option.value);
  });

  it.each([
    ['class pipe, rules not loaded', classPipe, false, true, true],
    ['manual pipe, rules not loaded', manualPipe, false, true, true],
    ['class pipe, rules loaded', classPipe, true, false, true],
    ['manual pipe, rules loaded', manualPipe, true, false, false],
  ])('class, size and schedule selects: %s', (_n, edge, loaded, disabled, scheduleDisabled) => {
    renderPipe(edge, { catalogPipeClasses: [CLASS], availablePipeClasses: [CLASS], projectRulesLoaded: loaded });
    expect(screen.getByRole('combobox', { name: 'Pipe 1 pipe class' }).disabled).toBe(disabled);
    expect(screen.getByRole('combobox', { name: 'Pipe 1 nominal size' }).disabled).toBe(disabled);
    expect(screen.getByRole('combobox', { name: 'Pipe 1 nominal size' }).value).toBe('50');
    const schedule = screen.getByRole('combobox', { name: 'Pipe 1 schedule' });
    expect(schedule.disabled).toBe(scheduleDisabled || disabled);
    expect(schedule.value).toBe('STD');
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
    fireEvent.click(screen.getByRole('button', { name: 'Equipment' }));
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
