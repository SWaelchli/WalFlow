import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import Navbar from './Navbar';
import { getTabId } from '../../utils/draftStorage';

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ currentUser: { id: 'u1', username: 'me' }, isAuthenticated: true, isAdmin: false, adminStatus: {}, logout: vi.fn() })
}));

afterEach(cleanup);

describe('Navbar catalogue entry', () => {
  it('shows a Catalogue button that calls onNavigateToCatalogue', () => {
    const onNavigateToCatalogue = vi.fn();
    render(<Navbar onNavigateToCatalogue={onNavigateToCatalogue} />);
    expect(screen.queryByText('Piping classes')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Catalogue' }));
    expect(onNavigateToCatalogue).toHaveBeenCalledTimes(1);
  });
});

describe('Navbar lock chip', () => {
  const diagram = { id: 'd1', title: 'D' };
  it.each([
    ['this tab holds the lock', () => ({ user_id: 'u1', username: 'me', session_id: getTabId() }), 'Editing'],
    ['same user, other tab', () => ({ user_id: 'u1', username: 'me', session_id: 'other-tab' }), 'Read-only · open in another tab of yours'],
    ['another user', () => ({ user_id: 'u2', username: 'alex' }), 'Read-only · alex is editing'],
    ['no lock', () => null, null],
  ])('%s', (_name, makeLock, label) => {
    render(<Navbar activeDiagram={diagram} lockInfo={makeLock()} />);
    const chip = screen.queryByRole('status', { name: (n) => n.startsWith('Editing') || n.startsWith('Read-only') });
    if (label === null) expect(chip).toBeNull();
    else expect(chip.getAttribute('aria-label')).toBe(label);
  });
});
