import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import DataList from './DataList';
import { UnitProvider } from '../../context/UnitContext';
import { UNIT_SYSTEMS } from '../../utils/converters';

afterEach(cleanup);

const nodes = [
  { id: 'n1', type: 'tank', position: { x: 0, y: 0 }, data: { label: 'T-1' } },
  { id: 'n2', type: 'tank', position: { x: 0, y: 100 }, data: { label: 'T-2' } },
];
const edges = [
  { id: 'e1', source: 'n1', target: 'n2', data: { type: 'PIPE', label: 'Pipe 1', length: 25, diameter: 0.1 } },
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

describe('F3-01: results table headers line up with the cells', () => {
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

describe('F1-08: relief analysis matrix', () => {
  const psvNodes = [{ id: 'psv', type: 'pressure_safety_valve', position: { x: 0, y: 0 }, data: { label: 'PSV-1', set_pressure_bar: 4.0 } }];
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
});

describe('F3-02 / F2-08: pipe rows', () => {
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
    expect(onUpdateEdge).toHaveBeenCalledWith('e1', { length: 40 });
  });
});
