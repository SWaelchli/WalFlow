import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import LoginModal from './LoginModal';
import NewDrawingModal from './NewDrawingModal';
import SaveAsModal from './SaveAsModal';

const auth = vi.hoisted(() => ({ login: vi.fn(), register: vi.fn(), isAuthenticated: false }));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => auth }));
vi.mock('axios', () => {
  const api = { get: vi.fn(() => Promise.resolve({ data: [] })), post: vi.fn() };
  return { default: api, ...api };
});

afterEach(() => { cleanup(); auth.login.mockReset(); auth.register.mockReset(); });

// jsdom does not turn Enter into a submit, so this checks what the browser needs for it: the field sits in a form
// with an enabled submit button. The submit then runs the same validation as clicking that button.
const FORM_DIALOGS = [
  ['sign-in username', () => render(<LoginModal isOpen onClose={() => {}} />), () => screen.getByPlaceholderText('e.g. engineer_alex')],
  ['sign-in password', () => render(<LoginModal isOpen onClose={() => {}} />), () => document.querySelector('input[type="password"]')],
  ['new drawing title', () => render(<NewDrawingModal isOpen onClose={() => {}} onCreateNew={vi.fn()} />), () => screen.getByPlaceholderText('e.g. Lube Oil Loop')],
  ['save as title', () => render(<SaveAsModal isOpen onClose={() => {}} onSaveAs={vi.fn()} currentTitle="A" />), () => screen.getByPlaceholderText('e.g. Compressor Loop A')],
];

describe('Enter in a form dialog', () => {
  it.each(FORM_DIALOGS)('%s: Enter reaches an enabled submit button', (_n, open, field) => {
    open();
    const input = field();
    const submit = input.form?.querySelector('button[type="submit"]');
    expect(submit).toBeTruthy();
    expect(submit.disabled).toBe(false);
  });

  it('sign-in submits the trimmed user name and the password, and closes', async () => {
    auth.login.mockResolvedValue({});
    const onClose = vi.fn();
    render(<LoginModal isOpen onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText('e.g. engineer_alex'), { target: { value: ' alex ' } });
    fireEvent.change(document.querySelector('input[type="password"]'), { target: { value: 'secret' } });
    fireEvent.submit(document.querySelector('form'));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(auth.login).toHaveBeenCalledWith('alex', 'secret');
  });

  it('sign-in with an empty field shows the error and does not call the server', () => {
    render(<LoginModal isOpen onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText('e.g. engineer_alex'), { target: { value: 'alex' } });
    fireEvent.submit(document.querySelector('form'));
    expect(screen.getByText('Please fill in all fields.')).toBeTruthy();
    expect(auth.login).not.toHaveBeenCalled();
  });

  it('new drawing and save as refuse a blank title, and pass the trimmed title otherwise', async () => {
    const onCreateNew = vi.fn(() => Promise.resolve());
    const onSaveAs = vi.fn(() => Promise.resolve());
    const cases = [
      [<NewDrawingModal isOpen onClose={() => {}} onCreateNew={onCreateNew} />, 'e.g. Lube Oil Loop', onCreateNew],
      [<SaveAsModal isOpen onClose={() => {}} onSaveAs={onSaveAs} />, 'e.g. Compressor Loop A', onSaveAs],
    ];
    for (const [element, placeholder, handler] of cases) {
      const { unmount } = render(element);
      const input = screen.getByPlaceholderText(placeholder);
      fireEvent.change(input, { target: { value: '   ' } });
      fireEvent.submit(input.form);
      expect(handler).not.toHaveBeenCalled();
      fireEvent.change(input, { target: { value: '  Loop 1  ' } });
      fireEvent.submit(input.form);
      await waitFor(() => expect(handler).toHaveBeenCalledWith(expect.objectContaining({ title: 'Loop 1' })));
      unmount();
    }
  });
});
