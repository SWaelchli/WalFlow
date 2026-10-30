import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import axios from 'axios';
import useSettingsLevels from './useSettingsLevels';

vi.mock('axios', () => ({ default: { get: vi.fn(), put: vi.fn() } }));

const setters = () => ({ setUnitSystem: vi.fn(), setPressureBasis: vi.fn(), setFlowUnit: vi.fn() });
const stored = (extra) => ({ stored: true, unit_system: 'metric', solver: {}, ...extra });

beforeEach(() => {
  localStorage.clear();
  axios.get.mockReset();
  axios.put.mockReset();
  axios.put.mockResolvedValue({ data: {} });
});

describe('display preferences of the user settings', () => {
  it.each([
    ['gauge', 'm3h'],
    ['absolute', 'lmin'],
  ])('applies the stored pressure basis %s and flow unit %s on login', async (basis, flow) => {
    axios.get.mockResolvedValue({ data: stored({ pressure_basis: basis, flow_unit: flow }) });
    const s = setters();
    renderHook(() => useSettingsLevels({ isAuthenticated: true, unitSystem: 'metric', pressureBasis: 'absolute', flowUnit: 'lmin', ...s }));
    await waitFor(() => expect(s.setPressureBasis).toHaveBeenCalledWith(basis));
    expect(s.setFlowUnit).toHaveBeenCalledWith(flow);
  });

  it('moves the local preferences to the database on the first login, with all four keys', async () => {
    axios.get.mockResolvedValue({ data: { stored: false } });
    renderHook(() => useSettingsLevels({ isAuthenticated: true, unitSystem: 'imperial', pressureBasis: 'gauge', flowUnit: 'm3h', ...setters() }));
    await waitFor(() => expect(axios.put).toHaveBeenCalled());
    expect(Object.keys(axios.put.mock.calls[0][1]).sort()).toEqual(['flow_unit', 'pressure_basis', 'solver', 'unit_system']);
    expect(axios.put.mock.calls[0][1]).toMatchObject({ unit_system: 'imperial', pressure_basis: 'gauge', flow_unit: 'm3h' });
  });

  it.each([
    ['pressureBasis', 'gauge', { pressure_basis: 'gauge', flow_unit: 'lmin' }],
    ['flowUnit', 'm3h', { pressure_basis: 'absolute', flow_unit: 'm3h' }],
  ])('sends a PUT with the new value when %s changes', async (prop, value, expected) => {
    axios.get.mockResolvedValue({ data: stored({ pressure_basis: 'absolute', flow_unit: 'lmin' }) });
    const s = setters();
    const base = { isAuthenticated: true, unitSystem: 'metric', pressureBasis: 'absolute', flowUnit: 'lmin', ...s };
    const { rerender } = renderHook((p) => useSettingsLevels(p), { initialProps: base });
    await waitFor(() => expect(s.setFlowUnit).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); });
    rerender({ ...base, [prop]: value });
    await waitFor(() => expect(axios.put).toHaveBeenCalledTimes(1));
    expect(axios.put.mock.calls[0][1]).toMatchObject({ unit_system: 'metric', ...expected });
  });

  it('does not write stored preferences back to the database when applying them on login', async () => {
    axios.get.mockResolvedValue({ data: stored({ pressure_basis: 'gauge', flow_unit: 'm3h' }) });
    // stateful setters like the unit context, so the applied values reach the hook as props
    const setUnitSystem = vi.fn();
    const { result } = renderHook(() => {
      const [pressureBasis, setPressureBasis] = useState('absolute');
      const [flowUnit, setFlowUnit] = useState('lmin');
      useSettingsLevels({ isAuthenticated: true, unitSystem: 'metric', setUnitSystem, pressureBasis, setPressureBasis, flowUnit, setFlowUnit });
      return { pressureBasis, flowUnit };
    });
    await waitFor(() => expect(result.current).toEqual({ pressureBasis: 'gauge', flowUnit: 'm3h' }));
    await act(async () => { await Promise.resolve(); });
    expect(axios.put).not.toHaveBeenCalled();
  });
});
