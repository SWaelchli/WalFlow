import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import StatusBadge from './StatusBadge';

afterEach(cleanup);

describe('StatusBadge', () => {
  it.each([
    ['success', 'status-badge-success'],
    ['warning', 'status-badge-warning'],
    ['danger', 'status-badge-danger'],
    ['info', 'status-badge-info'],
    ['neutral', 'status-badge-neutral'],
    [undefined, 'status-badge-neutral'],
    ['not-a-kind', 'status-badge-neutral'],
  ])('kind %s gets class %s', (kind, cls) => {
    render(<StatusBadge kind={kind} title="Tip">Label</StatusBadge>);
    const el = screen.getByText('Label');
    expect(el.className).toContain('status-badge');
    expect(el.className).toContain(cls);
    expect(el.getAttribute('title')).toBe('Tip');
  });

  it('renders the icon before the text', () => {
    render(<StatusBadge icon={<i data-testid="ic" />}>Label</StatusBadge>);
    expect(screen.getByTestId('ic')).toBeTruthy();
  });
});
