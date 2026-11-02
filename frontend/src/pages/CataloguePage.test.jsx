import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act, within } from '@testing-library/react';
import axios from 'axios';
import CataloguePage from './CataloguePage';
import { UnitProvider } from '../context/UnitContext';
import { confirmDiscard, confirmDialog } from '../utils/dialogs';
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
  confirmDialog: vi.fn(() => Promise.resolve(true)),
}));

const pipeClass = {
  id: 1, code: 'CS01', name: 'Carbon steel service', standard: 'CUSTOM', is_builtin: false, material_grade: 'A106 B',
  material_group: '1.1', rating_class: 'CL150', roughness_mm: 0.046, corrosion_allowance_mm: 1.5,
  sizes: [], temp_pressures: [],
};
const valveCatalogue = {
  id: 2, code: 'CUSTOM_STYLES', name: 'My valve styles', standard: 'CUSTOM', fitting_type: 'control_valve',
  is_builtin: false, description: '', dimensions: [],
};

let classes;
beforeEach(() => {
  classes = [pipeClass];
  vi.mocked(axios.get).mockImplementation((url, config) => {
    if (url === '/api/pipe-classes') return Promise.resolve({ data: classes });
    if (url === '/api/fitting-standards') return Promise.resolve({ data: config?.params?.fitting_type ? [valveCatalogue] : [] });
    return Promise.resolve({ data: [] });
  });
  vi.mocked(axios.post).mockReset();
  vi.mocked(axios.post).mockResolvedValue({ data: { message: 'ok' } });
  vi.mocked(confirmDiscard).mockClear();
  vi.mocked(confirmDiscard).mockResolvedValue(true);
  vi.mocked(confirmDialog).mockClear();
  vi.mocked(confirmDialog).mockResolvedValue(true);
});
afterEach(cleanup);

// The page state the page reports to the menu bar, kept with the registration rule of App.jsx
const setup = (role) => {
  auth.value = { currentUser: role ? { id: 'u1', username: 'me', role } : null, isAuthenticated: !!role };
  const reg = { owner: null, state: null };
  const registerPageState = (owner, state) => {
    if (state) { reg.owner = owner; reg.state = state; } else if (reg.owner === owner) reg.state = null;
  };
  const ctx = makeCommandCtx({ page: 'catalogue', registerPageState });
  const leaveGuardRef = { current: null };
  render(<UnitProvider><CataloguePage menuBar={<div>menu</div>} ctx={ctx} leaveGuardRef={leaveGuardRef} /></UnitProvider>);
  return { ctx, leaveGuardRef, reg };
};
const tab = (name) => screen.getByRole('button', { name });
const button = (name) => screen.queryByRole('button', { name });
const listPane = () => screen.getByRole('complementary', { name: 'Catalogue list' });
const loaded = async () => {
  await waitFor(() => expect(screen.queryByText('Loading catalog...')).toBeNull());
};

describe('Catalogue page', () => {
  it('lists the pipe classes in the named list pane and switches tabs', async () => {
    setup('admin');
    await waitFor(() => expect(listPane().textContent).toContain('CS01'));
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
  ])('role %s: New is in the list pane, Clone Edit Delete shown %s, no empty toolbar, status bar says %s', async (role, canManage, label) => {
    setup(role);
    await screen.findByText('Source: All');
    await loaded();
    const actions = (name) => !!screen.queryByRole('button', { name });
    expect(actions('Clone')).toBe(canManage);
    expect(actions('Edit')).toBe(canManage);
    expect(actions('Delete')).toBe(canManage);
    expect(!!screen.queryByRole('group', { name: 'Selected item actions' })).toBe(canManage);
    // New sits at the top of the list pane, not in the details
    expect(!!within(listPane()).queryByRole('button', { name: 'New pipe class' })).toBe(canManage);
    expect(screen.getByText(label)).toBeTruthy();
  });

  it('Import, Export and Restore defaults are menu commands only: the page has no such buttons while it lists entries', async () => {
    setup('admin');
    await loaded();
    expect(button(/Import/)).toBeNull();
    expect(button(/Export/)).toBeNull();
    expect(button(/Restore/)).toBeNull();
  });

  it('leaving with unsaved edits asks first; without edits it passes silently', async () => {
    const { leaveGuardRef } = setup('admin');
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Pipe class name *'), { target: { value: 'Changed' } });
    // Unsaved edit: the check asks, and a refusal keeps the user on the page
    vi.mocked(confirmDiscard).mockResolvedValueOnce(false);
    await waitFor(() => expect(leaveGuardRef.current).toBeTypeOf('function'));
    expect(await leaveGuardRef.current()).toBe(false);
    expect(confirmDiscard).toHaveBeenCalledWith('return to the canvas');
    expect(await leaveGuardRef.current()).toBe(true);
  });

  it('with an untouched edit the leave check does not ask', async () => {
    const { leaveGuardRef } = setup('admin');
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    expect(await leaveGuardRef.current()).toBe(true);
    expect(confirmDiscard).not.toHaveBeenCalled();
  });

  it('switching tabs with unsaved edits asks, and a refusal stays on the tab', async () => {
    setup('admin');
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Pipe class name *'), { target: { value: 'Changed' } });
    vi.mocked(confirmDiscard).mockResolvedValueOnce(false);
    fireEvent.click(tab('Control valve styles'));
    await waitFor(() => expect(confirmDiscard).toHaveBeenCalledWith('switch tabs'));
    expect(tab('Pipe classes').getAttribute('aria-current')).toBe('page');
  });
});

describe('Cancel and Save changes on the pipe classes tab', () => {
  it('Cancel with nothing changed closes the form without asking', async () => {
    setup('admin');
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    expect(button('Save changes')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(button('Save changes')).toBeNull());
    expect(confirmDiscard).not.toHaveBeenCalled();
  });

  it('Cancel after a change asks; a refusal keeps the form and the change, a yes closes it', async () => {
    setup('admin');
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Pipe class name *'), { target: { value: 'Changed' } });
    expect(screen.getByText('Unsaved changes')).toBeTruthy();

    vi.mocked(confirmDiscard).mockResolvedValueOnce(false);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(confirmDiscard).toHaveBeenCalledWith('stop editing'));
    expect(screen.getByLabelText('Pipe class name *').value).toBe('Changed');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(button('Save changes')).toBeNull());
    expect(confirmDiscard).toHaveBeenCalledTimes(2);
  });

  it('Esc in the list search box only leaves the box: the edit stays and nothing asks', async () => {
    setup('admin');
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Pipe class name *'), { target: { value: 'Changed' } });
    const search = screen.getByPlaceholderText(/Search code/);
    search.focus();
    expect(document.activeElement).toBe(search);
    // fireEvent returns false when the key was claimed: the page's Discard shortcut must not also run
    expect(fireEvent.keyDown(search, { key: 'Escape' })).toBe(false);
    expect(document.activeElement).not.toBe(search);
    expect(confirmDiscard).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Pipe class name *').value).toBe('Changed');
    expect(button('Save changes')).toBeTruthy();
  });

  it('a change that is typed back to the original is not a change', async () => {
    setup('admin');
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    const name = screen.getByLabelText('Pipe class name *');
    fireEvent.change(name, { target: { value: 'Changed' } });
    fireEvent.change(name, { target: { value: pipeClass.name } });
    expect(screen.queryByText('Unsaved changes')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(button('Save changes')).toBeNull());
    expect(confirmDiscard).not.toHaveBeenCalled();
  });
});

describe('Empty library', () => {
  it('a manager sees New and both imports; the list-pane New button is replaced by them', async () => {
    classes = [];
    setup('pipe_manager');
    await screen.findByText('The pipe class library is empty.');
    const pane = within(listPane());
    expect(pane.getAllByRole('button', { name: 'New pipe class' })).toHaveLength(1);
    expect(pane.getByRole('button', { name: 'Import from TR2000' })).toBeTruthy();
    expect(pane.getByRole('button', { name: 'Import library' })).toBeTruthy();
  });

  it('a read-only user sees the message and no buttons', async () => {
    classes = [];
    setup('user');
    await screen.findByText('The pipe class library is empty.');
    expect(within(listPane()).queryAllByRole('button', { name: /New|Import/ })).toHaveLength(0);
  });

  it('a search without a match is not an empty library: New stays in the list pane, no imports', async () => {
    setup('admin');
    await waitFor(() => expect(listPane().textContent).toContain('CS01'));
    fireEvent.change(screen.getByPlaceholderText(/Search code/), { target: { value: 'zzz' } });
    await waitFor(() => expect(listPane().textContent).not.toContain('CS01'));
    expect(screen.queryByText('The pipe class library is empty.')).toBeNull();
    expect(within(listPane()).getByRole('button', { name: 'New pipe class' })).toBeTruthy();
    expect(within(listPane()).queryByRole('button', { name: /Import/ })).toBeNull();
  });
});

describe('Restore defaults on the pipe classes tab', () => {
  it.each(['admin', 'pipe_manager'])('asks first, then restores the missing examples: %s', async (role) => {
    const { reg } = setup(role);
    await loaded();
    await act(async () => { await reg.state.actions.restoreDefaults(); });
    expect(confirmDialog).toHaveBeenCalledTimes(1);
    expect(axios.post).toHaveBeenCalledWith('/api/pipe-classes/seed-examples');
  });

  it('does nothing when the question is declined', async () => {
    const { reg } = setup('admin');
    await loaded();
    vi.mocked(confirmDialog).mockResolvedValueOnce(false);
    await act(async () => { await reg.state.actions.restoreDefaults(); });
    expect(axios.post).not.toHaveBeenCalled();
  });
});

describe('Page state of the open tab', () => {
  it('reports each tab, and an old tab unmounting does not clear the new tab state', async () => {
    const { reg } = setup('admin');
    await waitFor(() => expect(reg.state).toMatchObject({ tab: 'pipe_classes', entryLabel: 'pipe class', canManage: true, hasSelection: true }));
    fireEvent.click(tab('Control valve styles'));
    await waitFor(() => expect(reg.state).toMatchObject({ tab: 'control_valves', entryLabel: 'control valve catalogue', hasSelection: true }));
    fireEvent.click(tab('Fitting standards and schedules'));
    await waitFor(() => expect(reg.state).toMatchObject({ tab: 'fitting_standards', entryLabel: 'fitting standard' }));
    fireEvent.click(tab('Pipe classes'));
    await waitFor(() => expect(reg.state).toMatchObject({ tab: 'pipe_classes' }));
  });

  it('a read-only user reports canManage false, and the list state follows the filter', async () => {
    const { reg } = setup('user');
    await waitFor(() => expect(reg.state).toMatchObject({ canManage: false, listLength: 1, selectedIndex: 0 }));
    fireEvent.change(screen.getByPlaceholderText(/Search code/), { target: { value: 'zzz' } });
    await waitFor(() => expect(reg.state).toMatchObject({ listLength: 0 }));
  });

  it('while editing it reports isEditing, and isDirty only after a change', async () => {
    const { reg } = setup('admin');
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    await waitFor(() => expect(reg.state).toMatchObject({ isEditing: true, isDirty: false }));
    fireEvent.change(screen.getByLabelText('Pipe class name *'), { target: { value: 'Changed' } });
    await waitFor(() => expect(reg.state).toMatchObject({ isEditing: true, isDirty: true }));
  });
});

describe('Esc and Enter in the dialogs of the page', () => {
  const press = (key, target = document.body) => fireEvent.keyDown(target, { key });
  const openDialog = async (reg, action) => {
    await waitFor(() => expect(reg.state?.actions?.[action]).toBeTypeOf('function'));
    await act(async () => { reg.state.actions[action](); });
  };

  it('New pipe class: Enter in a field submits the form (blank name refused), Esc cancels and starts no edit', async () => {
    const { reg } = setup('admin');
    await loaded();
    await openDialog(reg, 'newEntry');
    const code = screen.getByPlaceholderText(/e\.g\. CS02/);
    const submit = code.form.querySelector('button[type="submit"]');
    expect(submit.disabled).toBe(false);
    fireEvent.submit(code.form);
    expect(screen.getByText('New Pipe Class')).toBeTruthy();
    expect(button('Save changes')).toBeNull();
    press('Escape');
    await waitFor(() => expect(screen.queryByText('New Pipe Class')).toBeNull());
    expect(button('Save changes')).toBeNull();
  });

  it('the import report opens with OK focused, not the close button, and Enter closes it', async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({ data: { imported_count: 1, imported: ['CS02'], skipped_duplicates: [], invalid_entries: [] } });
    const { reg } = setup('admin');
    await loaded();
    await waitFor(() => expect(reg.state?.actions?.importLibrary).toBeTypeOf('function'));
    const file = new File([JSON.stringify([{ code: 'CS02' }])], 'library.json', { type: 'application/json' });
    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [file] } });
    const ok = await screen.findByRole('button', { name: 'OK' });
    await act(async () => {}); // the dialog's key listeners attach in an effect
    expect(document.activeElement).toBe(ok);
    press('Enter');
    await waitFor(() => expect(screen.queryByText('Catalog Import Summary')).toBeNull());
  });

  describe('TR2000 import', () => {
    const startImport = async () => {
      vi.mocked(axios.get).mockImplementation((url, config) => {
        if (url === '/api/pipe-classes') return Promise.resolve({ data: classes });
        if (url === '/api/pipe-classes/tr2000/plants') return Promise.resolve({ data: [{ PlantID: 109, PlantCode: 'UON' }] });
        if (url === '/api/pipe-classes/tr2000/search') return Promise.resolve({ data: [{ PcsCode: 'CS01', RevID: 'A' }] });
        return Promise.resolve({ data: config?.params?.fitting_type ? [valveCatalogue] : [] });
      });
      const { reg } = setup('admin');
      await loaded();
      await openDialog(reg, 'importTr2000');
      await screen.findByRole('button', { name: 'Select All' });
      await act(async () => {}); // the dialog's key listeners attach in an effect
      return reg;
    };
    const selectCs01 = async () => {
      await waitFor(() => expect(screen.getByRole('button', { name: 'Select All' }).disabled).toBe(false));
      fireEvent.click(screen.getByRole('button', { name: 'Select All' }));
      fireEvent.click(screen.getByRole('checkbox', { name: /Equinor Terms/ }));
      fireEvent.click(screen.getByRole('button', { name: /Import Selected \(1\)/ }));
    };
    const importer = () => screen.queryByText('Import Equinor TR2000 Pipe Class');

    it('Esc closes the importer', async () => {
      await startImport();
      press('Escape');
      await waitFor(() => expect(importer()).toBeNull());
    });

    it('with a name clash: Esc aborts the clash dialog only, Enter proceeds and imports', async () => {
      await startImport();
      await selectCs01();
      await screen.findByText(/already exist in your local library/);
      await act(async () => {}); // the dialog's key listeners attach in an effect
      expect(document.activeElement).toBe(screen.getByRole('button', { name: /Proceed with Import/ }));
      press('Escape');
      await waitFor(() => expect(screen.queryByText(/already exist in your local library/)).toBeNull());
      expect(importer()).toBeTruthy();
      expect(axios.post).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: /Import Selected \(1\)/ }));
      await screen.findByText(/already exist in your local library/);
      await act(async () => {}); // the dialog's key listeners attach in an effect
      press('Enter');
      await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(1));
      expect(axios.post.mock.calls[0][1]).toMatchObject({ pcs_code: 'CS01', conflict_action: 'update' });
    });

    it('Esc does nothing while the import runs, and closes it once it is done', async () => {
      await startImport();
      let finish;
      vi.mocked(axios.post).mockReturnValueOnce(new Promise((resolve) => { finish = () => resolve({ data: { id: 1 } }); }));
      await selectCs01();
      await screen.findByText(/already exist in your local library/);
      await act(async () => {}); // the dialog's key listeners attach in an effect
      press('Enter');
      await screen.findByText(/Importing 1 of 1/);
      await act(async () => {}); // the dialog's key listeners attach in an effect
      press('Escape');
      expect(importer()).toBeTruthy();
      await act(async () => { finish(); });
      await waitFor(() => expect(importer()).toBeNull());
    });
  });
});
