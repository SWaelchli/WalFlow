import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import PipeSelector from './PipeSelector';
import { UnitProvider } from '../../context/UnitContext';

// The schedule catalogue request has no server in jsdom; the bundled datasets are used instead
vi.mock('axios', () => ({ default: { get: vi.fn(() => Promise.resolve({ data: [] })) } }));

afterEach(cleanup);

const CLASS = { id: 7, code: 'CS01', name: 'Carbon', roughness_mm: 0.045, material_grade: 'A106', sizes: [
  { dn: 50, nps: '2', sch: 'STD', od_mm: 60.3, wt_mm: 3.91 }, { dn: 80, nps: '3', sch: 'STD', od_mm: 88.9, wt_mm: 5.49 },
] };
const classPipe = { pipe_class_id: 7, pipe_class_code: 'CS01', standardDn: 50, standardSch: 'STD', diameter_m: 0.0525, outer_diameter_mm: 60.3, wall_thickness_mm: 3.91 };
const manualPipe = { ...classPipe, pipe_class_id: 'manual', pipe_class_code: 'CUSTOM' };

const renderSelector = (data, props) => render(
  <UnitProvider>
    <PipeSelector data={data} onChange={vi.fn()} {...props} />
  </UnitProvider>
);

describe('PipeSelector pipe class label and project rules', () => {
  it.each([
    ['in the catalogue but not allowed in the project', [CLASS], '[CS01] not allowed in this project'],
    ['not in a loaded catalogue', [{ ...CLASS, id: 8, code: 'OTHER' }], '[CS01] not in catalogue'],
    ['catalogue not loaded', [], '[CS01]'],
  ])('a pipe whose class is %s keeps its value as a disabled option with the right text', (_n, catalog, text) => {
    renderSelector(classPipe, { catalogPipeClasses: catalog, availablePipeClasses: [] });
    const option = screen.getByRole('option', { name: text });
    expect(option.disabled).toBe(true);
    expect(screen.getAllByRole('combobox')[0].value).toBe(option.value);
  });

  it.each([
    ['class pipe, rules not loaded', classPipe, false, true, false],
    ['manual pipe, rules not loaded', manualPipe, false, true, false],
    ['manual pipe in free dimensions, rules not loaded', manualPipe, false, true, true],
    ['class pipe, rules loaded', classPipe, true, false, false],
    ['manual pipe, rules loaded', manualPipe, true, false, false],
    ['manual pipe in free dimensions, rules loaded', manualPipe, true, false, true],
  ])('every control that sets the pipe class or dimensions: %s', (_n, data, loaded, disabled, free) => {
    renderSelector(data, { catalogPipeClasses: [CLASS], availablePipeClasses: [CLASS], projectRulesLoaded: loaded });
    if (free) fireEvent.click(screen.getByRole('button', { name: 'Free Dimensions' }));
    const selects = screen.getAllByRole('combobox');
    expect(selects[0].disabled).toBe(disabled);
    if (data.pipe_class_id !== 'manual') {
      expect(selects[1].disabled).toBe(disabled);
      expect(selects[1].value).toBe('50');
    } else if (free) {
      expect(selects.length).toBe(1);
      const innerDiameter = screen.getAllByRole('spinbutton')[0];
      expect(innerDiameter.disabled).toBe(disabled);
      expect(innerDiameter.value).toBe('52.50');
    } else {
      // dimension standard, nominal size, schedule select, and the quick-pick schedule buttons
      selects.slice(1).forEach(s => expect(s.disabled).toBe(disabled));
      expect(selects[2].value).toBe('50');
      expect(selects[3].value).toBe('STD');
      const quickPicks = screen.getAllByRole('button').filter(b => !['Schedule Presets', 'Free Dimensions'].includes(b.textContent));
      expect(quickPicks.length).toBeGreaterThan(0);
      quickPicks.forEach(b => expect(b.disabled).toBe(disabled));
    }
  });
});
