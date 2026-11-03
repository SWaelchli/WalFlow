import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import AdminSetupModal from './AdminSetupModal';

const auth = vi.hoisted(() => ({ setupFirstAdmin: vi.fn(), adminStatus: {} }));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => auth }));

afterEach(() => { cleanup(); auth.setupFirstAdmin.mockReset(); });

const fill = (tokenField) => {
  const [user, pass, confirm] = [...document.querySelectorAll('input')].filter(i => i !== tokenField);
  fireEvent.change(user, { target: { value: 'boss' } });
  fireEvent.change(pass, { target: { value: 'long_enough_pw' } });
  fireEvent.change(confirm, { target: { value: 'long_enough_pw' } });
};

describe('first administrator setup token', () => {
  it.each([
    [true, 'tok-123', 'tok-123'],
    [false, null, undefined],
  ])('required=%s: field shown only when needed and its value is sent', async (required, typed, sent) => {
    auth.adminStatus = { adminExists: false, setupTokenRequired: required };
    auth.setupFirstAdmin.mockResolvedValue({});
    render(<AdminSetupModal isOpen onClose={() => {}} />);
    const field = screen.queryByLabelText(/setup token/i);
    expect(Boolean(field)).toBe(required);
    fill(field);
    if (field) fireEvent.change(field, { target: { value: typed } });
    fireEvent.submit(document.querySelector('form'));
    await waitFor(() => expect(auth.setupFirstAdmin).toHaveBeenCalled());
    const [username, password, token] = auth.setupFirstAdmin.mock.calls[0];
    expect([username, password, token || undefined]).toEqual(['boss', 'long_enough_pw', sent]);
  });
});
