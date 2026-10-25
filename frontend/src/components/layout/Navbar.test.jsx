import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import Navbar from './Navbar';

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ currentUser: null, isAuthenticated: false, isAdmin: false, adminStatus: {}, logout: vi.fn() })
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
