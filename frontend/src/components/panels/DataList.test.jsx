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
