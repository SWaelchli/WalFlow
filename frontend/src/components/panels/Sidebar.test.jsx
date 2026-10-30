import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import Sidebar from './Sidebar';
import { UnitProvider } from '../../context/UnitContext';

afterEach(cleanup);

const sidebar = (examplesRequest) => (
  <UnitProvider>
    <Sidebar globalSettings={{}} templates={{}} onLoad={() => {}} examplesRequest={examplesRequest} />
  </UnitProvider>
);
const examplesHeader = () => screen.getByRole('button', { name: /Library & Examples/ });

describe('Sidebar examples request', () => {
  it('ignores the initial value', () => {
    render(sidebar(3));
    expect(examplesHeader().getAttribute('aria-expanded')).toBe('false');
  });

  it('a new request returns to the library tab, opens the examples and focuses their header', () => {
    const { rerender } = render(sidebar(0));
    fireEvent.click(screen.getByRole('button', { name: 'settings' }));
    expect(screen.queryByRole('button', { name: /Library & Examples/ })).toBeNull();

    rerender(sidebar(1));
    expect(examplesHeader().getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(examplesHeader());
  });
});
