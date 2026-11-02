import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ResultSection, ResultTable, ResultRow, ResultCallout } from './ResultBlocks';

afterEach(cleanup);

const cells = (label) => Array.from(screen.getByText(label).closest('tr').querySelectorAll('td')).map((td) => td.textContent);

describe('ResultRow', () => {
  it.each([
    ['value with unit', { value: '1.30', unit: 'bar' }, ['Pressure', '1.30bar']],
    ['value without unit', { value: 'Turbulent' }, ['Pressure', 'Turbulent']],
    ['zero is a value', { value: '0', unit: 'bar' }, ['Pressure', '0bar']],
    ['missing value', { value: null, unit: 'bar' }, ['Pressure', '—']],
    ['empty value', { value: '', unit: 'bar' }, ['Pressure', '—']],
    ['undefined value', {}, ['Pressure', '—']],
    ['dash cell never carries a unit', { value: '—', unit: 'bar' }, ['Pressure', '—']],
    ['label unit sits beside the label, cell holds the number', { value: '1.30', labelUnit: 'bar' }, ['Pressurebar', '1.30']],
    ['label unit with a missing value leaves a bare dash', { value: null, labelUnit: 'bar' }, ['Pressurebar', '—']],
  ])('single column: %s', (_name, props, expected) => {
    render(<table><tbody><ResultRow label="Pressure" {...props} /></tbody></table>);
    expect(cells('Pressure')).toEqual(expected);
  });

  it('multi column: plain values, {value, unit} and missing entries line up with the columns', () => {
    render(
      <ResultTable columns={['Port 1', 'Port 2', 'Port 3']}>
        <ResultRow label="Flow" values={[{ value: '5.0', unit: 'L/min' }, 'no flow', null]} />
      </ResultTable>
    );
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['', 'Port 1', 'Port 2', 'Port 3']);
    expect(cells('Flow')).toEqual(['Flow', '5.0L/min', 'no flow', '—']);
  });

  it('text rows use the sans value class, numeric rows do not', () => {
    render(<table><tbody>
      <ResultRow label="Direction" value="In" text />
      <ResultRow label="Flow" value="5.0" />
    </tbody></table>);
    expect(screen.getByText('In').className).toContain('result-value-text');
    expect(screen.getByText('5.0').className).not.toContain('result-value-text');
  });

  it('multi column with labelUnit and a missing entry: unit once, dash without unit', () => {
    render(
      <ResultTable columns={['Port 1', 'Port 2']}>
        <ResultRow label="Flow" labelUnit="L/min" values={['5.0', null]} />
      </ResultTable>
    );
    expect(cells('Flow')).toEqual(['FlowL/min', '5.0', '—']);
  });

  it('more than two value columns make the table dense', () => {
    const { container, rerender } = render(<ResultTable columns={['A', 'B']}><ResultRow label="x" values={['1', '2']} /></ResultTable>);
    expect(container.querySelector('table').className).not.toContain('result-table-dense');
    rerender(<ResultTable columns={['A', 'B', 'C']}><ResultRow label="x" values={['1', '2', '3']} /></ResultTable>);
    expect(container.querySelector('.result-table-wrap table').className).toContain('result-table-dense');
  });

  it('puts the hover explanation on the row', () => {
    render(<table><tbody><ResultRow label="Load" value="50" unit="%" title="Shaft power over rating" /></tbody></table>);
    expect(screen.getByText('Load').closest('tr').getAttribute('title')).toBe('Shaft power over rating');
  });
});

describe('ResultCallout', () => {
  it.each([
    ['warning', undefined, 'alert'],
    ['danger', undefined, 'alert'],
    ['info', undefined, 'status'],
    ['info', 'alert', 'alert'],
    ['unknown', undefined, 'alert'],
  ])('tone %s with role %s is announced as %s', (tone, role, expectedRole) => {
    render(<ResultCallout tone={tone} role={role} title="Heads up">Details here</ResultCallout>);
    const callout = screen.getByRole(expectedRole);
    expect(callout.textContent).toContain('Heads up');
    expect(callout.textContent).toContain('Details here');
  });

  it('defaults to a warning alert', () => {
    render(<ResultCallout>Check the inlet</ResultCallout>);
    expect(screen.getByRole('alert').textContent).toContain('Check the inlet');
  });
});

describe('ResultSection', () => {
  it('shows the title, the state badge with its hover text, and the content', () => {
    render(
      <ResultSection title="Assessment" badge={{ text: 'BURST', kind: 'danger', title: 'Disc has ruptured' }}>
        <p>content</p>
      </ResultSection>
    );
    expect(screen.getByRole('heading', { name: 'Assessment' })).toBeTruthy();
    expect(screen.getByText('BURST').closest('[title]').getAttribute('title')).toBe('Disc has ruptured');
    expect(screen.getByText('content')).toBeTruthy();
  });

  it('has no badge when none is given', () => {
    render(<ResultSection title="Plain"><p>x</p></ResultSection>);
    expect(screen.queryByText('BURST')).toBeNull();
    expect(screen.getAllByRole('heading')).toHaveLength(1);
  });
});
