import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import axios from 'axios';
import CataloguePage from './CataloguePage';
import { UnitProvider } from '../context/UnitContext';
import { confirmDiscard } from '../utils/dialogs';
import { makeCommandCtx } from '../test/commandCtx';

const auth = vi.hoisted(() => ({ value: null }));
vi.mock('../hooks/useAuth', () => ({ useAuth: () => auth.value }));
vi.mock('axios', () => {
  const api = { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() };
  return { default: api, ...api };
});
vi.mock('../utils/dialogs', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmDiscard: vi.fn(() => Promise.resolve(true)),
}));

const pipeClass = {
  id: 1, code: 'CS01', name: 'Carbon steel service', standard: 'CUSTOM', is_builtin: false, material_grade: 'A106 B',
  material_group: '1.1', rating_class: 'CL150', roughness_mm: 0.046, corrosion_allowance_mm: 1.5,
  sizes: [], temp_pressures: [],
};

beforeEach(() => {
  vi.mocked(axios.get).mockImplementation((url) => Promise.resolve({ data: url === '/api/pipe-classes' ? [pipeClass] : [] }));
  vi.mocked(confirmDiscard).mockClear();
  vi.mocked(confirmDiscard).mockResolvedValue(true);
});
afterEach(cleanup);

const setup = (role) => {
  auth.value = { currentUser: role ? { id: 'u1', username: 'me', role } : null, isAuthenticated: !!role };
  const ctx = makeCommandCtx({ page: 'catalogue' });
  const leaveGuardRef = { current: null };
  render(<UnitProvider><CataloguePage menuBar={<div>menu</div>} ctx={ctx} leaveGuardRef={leaveGuardRef} /></UnitProvider>);
  return { ctx, leaveGuardRef };
};
const tab = (name) => screen.getByRole('button', { name });

describe('Catalogue page', () => {
  it('lists the pipe classes in the named list pane and switches tabs', async () => {
    setup('admin');
    const list = screen.getByRole('complementary', { name: 'Catalogue list' });
    await waitFor(() => expect(list.textContent).toContain('CS01'));
    expect(tab('Pipe classes').getAttribute('aria-current')).toBe('page');
    fireEvent.click(tab('Control valve styles'));
    await waitFor(() => expect(tab('Control valve styles').getAttribute('aria-current')).toBe('page'));
    expect(tab('Pipe classes').getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Control valve styles' })).toBeTruthy();
    fireEvent.click(tab('Fitting standards and schedules'));
    await waitFor(() => expect(tab('Fitting standards and schedules').getAttribute('aria-current')).toBe('page'));
  });

  it('Back to drawing runs the Tools > Catalogue command', () => {
    const { ctx } = setup('admin');
    fireEvent.click(screen.getByRole('button', { name: /Back to drawing/ }));
    expect(ctx.actions.toggleCatalogue).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['admin', true, 'Can edit'],
    ['pipe_manager', true, 'Can edit'],
    ['user', false, 'Read-only'],
    [null, false, 'Read-only'],
  ])('role %s: Clone and Edit shown %s, status bar says %s', async (role, canManage, label) => {
    setup(role);
    await screen.findByText('Source: All');
    await waitFor(() => expect(screen.queryByText('Loading catalog...')).toBeNull());
    expect(!!screen.queryByRole('button', { name: /Clone \/ Duplicate/ })).toBe(canManage);
    expect(!!screen.queryByRole('button', { name: /Edit Pipe Class/ })).toBe(canManage);
    expect(!!screen.queryByRole('button', { name: /New pipe class/ })).toBe(canManage);
    expect(screen.getByText(label)).toBeTruthy();
  });

  it('leaving with unsaved edits asks first; without edits it passes silently', async () => {
    const { leaveGuardRef } = setup('admin');
    fireEvent.click(await screen.findByRole('button', { name: /Edit Pipe Class/ }));
    // Unsaved edit: the check asks, and a refusal keeps the user on the page
    vi.mocked(confirmDiscard).mockResolvedValueOnce(false);
    await waitFor(() => expect(leaveGuardRef.current).toBeTypeOf('function'));
    expect(await leaveGuardRef.current()).toBe(false);
    expect(confirmDiscard).toHaveBeenCalledWith('return to the canvas');
    expect(await leaveGuardRef.current()).toBe(true);
  });

  it('with no edit the leave check does not ask', async () => {
    const { leaveGuardRef } = setup('admin');
    await screen.findByRole('button', { name: /Edit Pipe Class/ });
    expect(await leaveGuardRef.current()).toBe(true);
    expect(confirmDiscard).not.toHaveBeenCalled();
  });

  it('switching tabs with unsaved edits asks, and a refusal stays on the tab', async () => {
    setup('admin');
    fireEvent.click(await screen.findByRole('button', { name: /Edit Pipe Class/ }));
    vi.mocked(confirmDiscard).mockResolvedValueOnce(false);
    fireEvent.click(tab('Control valve styles'));
    await waitFor(() => expect(confirmDiscard).toHaveBeenCalledWith('switch tabs'));
    expect(tab('Pipe classes').getAttribute('aria-current')).toBe('page');
  });
});
