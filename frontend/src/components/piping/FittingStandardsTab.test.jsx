import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import axios from 'axios';
import FittingStandardsTab from './FittingStandardsTab';
import { UnitProvider } from '../../context/UnitContext';

vi.mock('axios', () => {
  const api = { get: vi.fn(), put: vi.fn(() => Promise.resolve({ data: { id: 2 } })) };
  return { default: api, ...api };
});

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

beforeEach(() => {
  vi.mocked(axios.get).mockImplementation((url, config) => {
    const all = [reducerCatalogue, valveCatalogue];
    const wanted = config?.params?.fitting_type;
    return Promise.resolve({ data: wanted ? all.filter(c => c.fitting_type === wanted) : all });
  });
  vi.mocked(axios.put).mockClear();
});
afterEach(cleanup);

const renderTab = (fittingType) => render(
  <UnitProvider>
    <FittingStandardsTab canManage currentUser={{ role: 'admin' }} fittingType={fittingType} />
  </UnitProvider>
);

const groupHeading = (text) => screen.getAllByText(text).filter(el => el.getAttribute('colspan') === '7');

describe('D-29b: control valve style catalogues in the catalogue page', () => {
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
    fireEvent.click(await screen.findByText('Edit Catalogue'));

    const setFl = (text) => {
      const input = screen.getByLabelText('Row 1: F_L');
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: text } });
      fireEvent.blur(input);
    };
    setFl('1.2');
    fireEvent.click(screen.getByText('Save Changes'));
    await screen.findByText(/Row 1: F_L must be greater than 0 and at most 1/);
    expect(axios.put).not.toHaveBeenCalled();

    setFl('0.8');
    fireEvent.click(screen.getByText('Save Changes'));
    await waitFor(() => expect(axios.put).toHaveBeenCalledTimes(1));
    const rows = axios.put.mock.calls[0][1].dimensions;
    expect(rows[0]).toMatchObject({ code: 'g1', fl: 0.8, xt: 0.7 });
    expect(rows[1].xt).toBeNull();
  });
});
