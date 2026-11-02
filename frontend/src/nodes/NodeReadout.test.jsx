import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import NodeReadout from './NodeReadout';

afterEach(cleanup);

describe('NodeReadout', () => {
  it('shows name, label, value with its unit inside the value span, and meta lines', () => {
    const { container } = render(
      <NodeReadout name="P-1" rows={[{ label: 'Flow', value: '12.5', unit: 'l/min' }]} meta={['Cv 50', 'Open']} />
    );
    expect(screen.getByText('P-1')).toBeTruthy();
    expect(container.querySelector('.node-readout-label').textContent.trim()).toBe('Flow');
    const value = container.querySelector('.node-readout-value');
    expect(value.textContent).toBe('12.5 l/min');
    expect(value.querySelector('.node-readout-unit').textContent.trim()).toBe('l/min');
    expect([...container.querySelectorAll('.node-readout-meta')].map((m) => m.textContent)).toEqual(['Cv 50', 'Open']);
  });

  it('skips rows without a value but keeps a zero', () => {
    const { container } = render(
      <NodeReadout rows={[{ label: 'A', value: null }, { label: 'B', value: undefined }, { label: 'C', value: 0, unit: 'bar' }]} />
    );
    expect(container.querySelectorAll('.node-readout-row')).toHaveLength(1);
    expect(container.querySelector('.node-readout-value').textContent).toBe('0 bar');
  });

  it.each([
    ['success', 'success'],
    ['warning', 'warning'],
    ['danger', 'danger'],
    ['info', 'info'],
    ['neutral', 'neutral'],
    [undefined, 'neutral'],
  ])('badge kind %s maps to status-badge-%s', (kind, cls) => {
    render(<NodeReadout badges={[{ kind, label: 'State', title: 'Why' }]} />);
    const badge = screen.getByText('State');
    expect(badge.className).toContain(`status-badge-${cls}`);
    expect(badge.getAttribute('title')).toBe('Why');
  });
});
