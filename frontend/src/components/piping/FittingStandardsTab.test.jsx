import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import axios from 'axios';
import FittingStandardsTab from './FittingStandardsTab';
import { UnitProvider } from '../../context/UnitContext';
import { confirmDialog, confirmDiscard } from '../../utils/dialogs';

vi.mock('axios', () => {
  const api = { get: vi.fn(), put: vi.fn(() => Promise.resolve({ data: { id: 2 } })), post: vi.fn(() => Promise.resolve({ data: {} })) };
  return { default: api, ...api };
});
vi.mock('../../utils/dialogs', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmDiscard: vi.fn(() => Promise.resolve(true)),
  confirmDialog: vi.fn(() => Promise.resolve(true)),
}));

const valveCatalogue = {
  id: 2, code: 'CUSTOM_STYLES', name: 'My valve styles', standard: 'CUSTOM', fitting_type: 'control_valve',
  is_builtin: false, description: '',
  dimensions: [
    { code: 'g1', valve_type: 'Globe', trim: 'single', flow_direction: 'Flow to open', fl: 0.9, fd: 0.46, xt: 0.7 },
    { code: 'b1', valve_type: 'Butterfly', trim: '60', flow_direction: 'Either direction', fl: 0.6, fd: 0.55, xt: null },
    { code: 'g2', valve_type: 'Globe', trim: 'double', flow_direction: 'Either direction', fl: 0.3, fd: 1, xt: 0.6 }
  ]
};
const reducerCatalogue = {
  id: 1, code: 'MY_REDUCERS', name: 'My reducers', standard: 'CUSTOM', fitting_type: 'reducer', subtype: 'concentric',
  is_builtin: false, description: '', dimensions: []
};
const builtinReducers = { ...reducerCatalogue, id: 3, code: 'ASME_RED', name: 'Built-in reducers', standard: 'ASME', is_builtin: true };

let catalogues;
beforeEach(() => {
  catalogues = [reducerCatalogue, valveCatalogue];
  vi.mocked(axios.get).mockImplementation((url, config) => {
    const wanted = config?.params?.fitting_type;
    return Promise.resolve({ data: wanted ? catalogues.filter(c => c.fitting_type === wanted) : catalogues });
  });
  vi.mocked(axios.put).mockClear();
  vi.mocked(axios.post).mockClear();
  vi.mocked(confirmDialog).mockReset();
  vi.mocked(confirmDialog).mockResolvedValue(true);
  vi.mocked(confirmDiscard).mockReset();
  vi.mocked(confirmDiscard).mockResolvedValue(true);
});
afterEach(cleanup);

// `reg.state` is the page state the tab reports to the menu bar
const renderTab = (fittingType, { role = 'admin', canManage = true } = {}) => {
  const reg = { owner: null, state: null };
  const registerPageState = (owner, state) => {
    if (state) { reg.owner = owner; reg.state = state; } else if (reg.owner === owner) reg.state = null;
  };
  render(
    <UnitProvider>
      <FittingStandardsTab canManage={canManage} currentUser={{ role }} fittingType={fittingType} registerPageState={registerPageState} />
    </UnitProvider>
  );
  return reg;
};

const groupHeading = (text) => screen.getAllByText(text).filter(el => el.getAttribute('colspan') === '7');
const button = (name) => screen.queryByRole('button', { name });

describe('control valve style catalogues in the catalogue page', () => {
  it('keeps control valve catalogues out of the fittings view', async () => {
    renderTab(null);
    await screen.findAllByText('My reducers');
    expect(screen.queryByText('My valve styles')).toBeNull();
  });

  it('lists them in the valve view, grouped by valve type in catalogue order', async () => {
    renderTab('control_valve');
    await screen.findAllByText('My valve styles');
    expect(screen.queryByText('My reducers')).toBeNull();
    expect(groupHeading('Globe')).toHaveLength(1);
    const order = [groupHeading('Globe')[0], screen.getByText('g1'), screen.getByText('g2'), groupHeading('Butterfly')[0], screen.getByText('b1')];
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('shows F_L, F_d and x_T with two decimals and a dash for a missing x_T', async () => {
    renderTab('control_valve');
    await screen.findAllByText('My valve styles');
    const cells = (code) => [...screen.getByText(code).closest('tr').querySelectorAll('td')].map(td => td.textContent);
    expect(cells('g2')).toEqual(expect.arrayContaining(['0.30', '1.00', '0.60']));
    expect(cells('b1')).toEqual(expect.arrayContaining(['0.60', '0.55', '—']));
  });

  it('blocks saving an out-of-range F_L, and sends an empty x_T as null', async () => {
    renderTab('control_valve');
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));

    const setFl = (text) => {
      const input = screen.getByLabelText('Row 1: F_L');
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: text } });
      fireEvent.blur(input);
    };
    setFl('1.2');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText(/Row 1: F_L must be greater than 0 and at most 1/);
    expect(axios.put).not.toHaveBeenCalled();

    setFl('0.8');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(axios.put).toHaveBeenCalledTimes(1));
    const rows = axios.put.mock.calls[0][1].dimensions;
    expect(rows[0]).toMatchObject({ code: 'g1', fl: 0.8, xt: 0.7 });
    expect(rows[1].xt).toBeNull();
  });
});

describe('page buttons of a fitting tab', () => {
  it.each([null, 'control_valve'])('use the same labels as the pipe classes tab, with New in the list pane: %s', async (type) => {
    renderTab(type);
    const newLabel = type ? 'New control valve catalogue' : 'New fitting standard';
    await screen.findAllByText(type ? 'My valve styles' : 'My reducers');
    expect(button(newLabel)).toBeTruthy();
    ['Clone', 'Edit', 'Delete'].forEach((name) => expect(button(name), name).toBeTruthy());
    fireEvent.click(button('Edit'));
    expect(button('Save changes')).toBeTruthy();
    expect(button('Cancel')).toBeTruthy();
  });

  it('Import, Export and Restore defaults are menu commands only', async () => {
    renderTab(null);
    await screen.findAllByText('My reducers');
    expect(button(/Import/)).toBeNull();
    expect(button(/Export/)).toBeNull();
    expect(button(/Restore/)).toBeNull();
  });

  it('a read-only user sees no New button and no empty toolbar', async () => {
    renderTab(null, { role: 'user', canManage: false });
    await screen.findAllByText('My reducers');
    expect(button(/^New/)).toBeNull();
    expect(screen.queryByRole('group', { name: 'Selected item actions' })).toBeNull();
  });

  it('a pipe manager cannot edit or delete a built-in standard: the buttons are gone and the menu states the reason', async () => {
    catalogues = [builtinReducers];
    const reg = renderTab(null, { role: 'pipe_manager' });
    await screen.findAllByText('Built-in reducers');
    expect(button('Clone')).toBeTruthy();
    expect(button('Edit')).toBeNull();
    expect(button('Delete')).toBeNull();
    await waitFor(() => expect(reg.state).toMatchObject({
      editBlocked: 'Only an admin can edit built-in standards', deleteBlocked: 'Built-in standards cannot be deleted',
    }));
  });

  it('an admin can edit a built-in standard but still not delete it', async () => {
    catalogues = [builtinReducers];
    const reg = renderTab(null, { role: 'admin' });
    await screen.findAllByText('Built-in reducers');
    expect(button('Edit')).toBeTruthy();
    expect(button('Delete')).toBeNull();
    await waitFor(() => expect(reg.state).toMatchObject({ editBlocked: null, deleteBlocked: 'Built-in standards cannot be deleted' }));
  });
});

describe('empty fitting library', () => {
  it('a manager gets New and Import library (no TR2000 import); a read-only user only the message', async () => {
    catalogues = [];
    renderTab(null);
    await screen.findByText('The fitting catalog is empty.');
    expect(button('New fitting standard')).toBeTruthy();
    expect(button('Import library')).toBeTruthy();
    expect(button(/TR2000/)).toBeNull();
    cleanup();
    renderTab(null, { role: 'user', canManage: false });
    await screen.findByText('The fitting catalog is empty.');
    expect(button(/New|Import/)).toBeNull();
  });
});

describe('Cancel on a fitting tab', () => {
  it('asks only when something changed', async () => {
    renderTab(null);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.click(button('Cancel'));
    await waitFor(() => expect(button('Save changes')).toBeNull());
    expect(confirmDiscard).not.toHaveBeenCalled();

    fireEvent.click(button('Edit'));
    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'Renamed' } });
    vi.mocked(confirmDiscard).mockResolvedValueOnce(false);
    fireEvent.click(button('Cancel'));
    await waitFor(() => expect(confirmDiscard).toHaveBeenCalledWith('stop editing'));
    expect(screen.getByLabelText('Name *').value).toBe('Renamed');
    fireEvent.click(button('Cancel'));
    await waitFor(() => expect(button('Save changes')).toBeNull());
    expect(confirmDiscard).toHaveBeenCalledTimes(2);
  });

  it('Esc in the list search box only leaves the box: the edit stays and nothing asks', async () => {
    renderTab(null);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'Renamed' } });
    const search = screen.getByLabelText('Search standards and schedules');
    search.focus();
    expect(fireEvent.keyDown(search, { key: 'Escape' })).toBe(false); // claimed, so page shortcuts leave it alone
    expect(document.activeElement).not.toBe(search);
    expect(confirmDiscard).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Name *').value).toBe('Renamed');
  });
});

describe('Restore defaults on a fitting tab', () => {
  const restore = async (reg) => { await act(async () => { await reg.state.actions.restoreDefaults(); }); };
  const params = () => axios.post.mock.calls[0][2].params;

  it('asks for every role; a non-admin gets one question and only the missing ones are added', async () => {
    const reg = renderTab(null, { role: 'pipe_manager' });
    await waitFor(() => expect(reg.state).not.toBeNull());
    await restore(reg);
    expect(confirmDialog).toHaveBeenCalledTimes(1);
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(axios.post.mock.calls[0][0]).toBe('/api/fitting-standards/seed-defaults');
    expect(params()).toEqual({ restore_builtins: false });
  });

  it('an admin is asked a second time whether edited built-ins are overwritten', async () => {
    const reg = renderTab(null, { role: 'admin' });
    await waitFor(() => expect(reg.state).not.toBeNull());
    await restore(reg);
    expect(confirmDialog).toHaveBeenCalledTimes(2);
    expect(vi.mocked(confirmDialog).mock.calls[1][0]).toMatchObject({ confirmLabel: 'Overwrite edited', cancelLabel: 'Only add missing' });
    expect(params()).toEqual({ restore_builtins: true });
  });

  it('an admin who chooses Only add missing keeps edited built-ins', async () => {
    const reg = renderTab('control_valve', { role: 'admin' });
    await waitFor(() => expect(reg.state).not.toBeNull());
    vi.mocked(confirmDialog).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await restore(reg);
    expect(params()).toEqual({ restore_builtins: false });
  });

  it('declining the first question restores nothing and asks nothing more', async () => {
    const reg = renderTab(null, { role: 'admin' });
    await waitFor(() => expect(reg.state).not.toBeNull());
    vi.mocked(confirmDialog).mockResolvedValueOnce(false);
    await restore(reg);
    expect(confirmDialog).toHaveBeenCalledTimes(1);
    expect(axios.post).not.toHaveBeenCalled();
  });
});

describe('Esc and Enter in the Clone and New dialogs', () => {
  const press = (key, target = document.body) => fireEvent.keyDown(target, { key });
  const DIALOGS = [
    ['Clone', 'Clone', 'Clone Fitting Standard', 'clone-name', 'clone-code', /\/clone$/],
    ['New', 'New fitting standard', 'New Fitting Standard', 'new-std-name', 'new-std-code', /fitting-standards$/],
  ];

  it.each(DIALOGS)('%s: Enter does the same as the primary button (blank name refused), Esc cancels', async (_n, opener, heading, nameId, codeId, url) => {
    renderTab(null);
    await screen.findAllByText('My reducers');
    await act(async () => {}); // the dialog's key listeners attach in an effect
    fireEvent.click(button(opener));
    await screen.findByText(heading);
    await act(async () => {}); // the dialog's key listeners attach in an effect
    const name = document.getElementById(nameId);
    fireEvent.change(name, { target: { value: '  ' } });
    press('Enter', name);
    expect(axios.post).not.toHaveBeenCalled();
    expect(screen.getByText(heading)).toBeTruthy();

    fireEvent.change(name, { target: { value: 'My copy' } });
    fireEvent.change(document.getElementById(codeId), { target: { value: 'my_copy' } });
    press('Enter', name);
    await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(1));
    expect(axios.post.mock.calls[0][0]).toMatch(url);
    expect(axios.post.mock.calls[0][1]).toMatchObject({ [url.source.includes('clone') ? 'new_code' : 'code']: 'MY_COPY' });
  });

  it.each(DIALOGS)('%s: Esc closes without saving', async (_n, opener, heading) => {
    renderTab(null);
    await screen.findAllByText('My reducers');
    await act(async () => {}); // the dialog's key listeners attach in an effect
    fireEvent.click(button(opener));
    await screen.findByText(heading);
    await act(async () => {}); // the dialog's key listeners attach in an effect
    press('Escape');
    await waitFor(() => expect(screen.queryByText(heading)).toBeNull());
    expect(axios.post).not.toHaveBeenCalled();
  });

  it.each(DIALOGS)('%s: while the request is pending Esc and Enter do nothing, the button is disabled and one Enter posts once', async (_n, opener, heading, nameId, codeId) => {
    renderTab(null);
    await screen.findAllByText('My reducers');
    await act(async () => {}); // the dialog's key listeners attach in an effect
    fireEvent.click(button(opener));
    await screen.findByText(heading);
    await act(async () => {}); // the dialog's key listeners attach in an effect
    const name = document.getElementById(nameId);
    fireEvent.change(name, { target: { value: 'My copy' } });
    fireEvent.change(document.getElementById(codeId), { target: { value: 'my_copy' } });
    let finish;
    vi.mocked(axios.post).mockReturnValueOnce(new Promise((resolve) => { finish = () => resolve({ data: { id: 9, name: 'My copy' } }); }));
    const dialog = name.closest('[role="dialog"]');

    await act(async () => { press('Enter', name); });
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(dialog.getAttribute('aria-busy')).toBe('true');
    expect(dialog.querySelector('.btn-primary').disabled).toBe(true);
    await act(async () => { press('Enter', name); press('Escape'); });
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(screen.getByText(heading)).toBeTruthy();

    await act(async () => { finish(); });
    await waitFor(() => expect(screen.queryByText(heading)).toBeNull());
  });

  it('Enter in the type list of the New dialog picks the option and does not create anything', async () => {
    renderTab(null);
    await screen.findAllByText('My reducers');
    await act(async () => {}); // the dialog's key listeners attach in an effect
    fireEvent.click(button('New fitting standard'));
    await screen.findByText('New Fitting Standard');
    await act(async () => {}); // the dialog's key listeners attach in an effect
    fireEvent.change(document.getElementById('new-std-name'), { target: { value: 'My copy' } });
    press('Enter', document.getElementById('new-std-type'));
    expect(axios.post).not.toHaveBeenCalled();
  });
});
