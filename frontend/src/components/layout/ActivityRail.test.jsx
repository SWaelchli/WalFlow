import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ActivityRail from './ActivityRail';

afterEach(cleanup);

const pressed = () => screen.getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.getAttribute('aria-label'));

describe('ActivityRail', () => {
  it('presses only the active pane, and none while the pane is collapsed', () => {
    const { rerender } = render(<ActivityRail activePane="settings" paneOpen onSelect={() => {}} />);
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Components', 'Examples', 'Drawings', 'Settings']);
    expect(pressed()).toEqual(['Settings']);
    rerender(<ActivityRail activePane="settings" paneOpen={false} onSelect={() => {}} />);
    expect(pressed()).toEqual([]);
  });

  it('reports the pane id of the clicked button', () => {
    const onSelect = vi.fn();
    render(<ActivityRail activePane="components" paneOpen onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'Examples' }));
    expect(onSelect).toHaveBeenCalledWith('examples');
  });
});
