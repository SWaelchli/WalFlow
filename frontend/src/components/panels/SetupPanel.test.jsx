import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import SetupPanel from './SetupPanel';
import { UnitProvider } from '../../context/UnitContext';
import { UNIT_SYSTEMS } from '../../utils/converters';

vi.mock('axios', () => ({ default: { get: vi.fn(() => Promise.resolve({ data: [] })) } }));

afterEach(cleanup);

const pipeEdge = (data) => ({ id: 'e1', source: 'n1', target: 'n2', data: { type: 'PIPE', length_m: 25, ...data } });

const renderPanel = (edge, unitSystem) => {
  const onUpdateEdge = vi.fn();
  render(
    <UnitProvider initialUnitSystem={unitSystem}>
      <SetupPanel edge={edge} onUpdateEdge={onUpdateEdge} />
    </UnitProvider>
  );
  return onUpdateEdge;
};

describe('F2-01: pipe sizes picked in the inspector are stored in SI in imperial mode', () => {
  it('stores DN80 STD as 77.92 mm (3.068 in), not divided by 39.37', () => {
    const onUpdateEdge = renderPanel(pipeEdge({ pipe_class_id: 'manual', standardDn: 50, standardSch: 'STD', diameter_m: 0.05248 }), UNIT_SYSTEMS.IMPERIAL);
    fireEvent.change(screen.getByDisplayValue('2" (DN50)'), { target: { value: '80' } });

    const updates = onUpdateEdge.mock.calls.at(-1)[1];
    expect(updates.standardDn).toBe(80);
    expect(updates.diameter_m).toBeCloseTo(0.07792, 6);
  });
});

describe('F2-08: free inner diameter commits on blur', () => {
  it('lets the user type 60 mm and commits once on blur', () => {
    // 60 mm matches no schedule, so the inspector opens in Free Dimensions mode
    const onUpdateEdge = renderPanel(pipeEdge({ diameter_m: 0.06 }), UNIT_SYSTEMS.METRIC);
    const input = screen.getByDisplayValue('60.00');

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '6' } });
    fireEvent.change(input, { target: { value: '65' } });
    expect(onUpdateEdge).not.toHaveBeenCalled();
    expect(input.value).toBe('65');

    fireEvent.blur(input);
    expect(onUpdateEdge).toHaveBeenCalledTimes(1);
    expect(onUpdateEdge.mock.calls[0][1].diameter_m).toBeCloseTo(0.065, 9);
  });

  it('ignores an empty or zero diameter and shows the stored value again', () => {
    const onUpdateEdge = renderPanel(pipeEdge({ diameter_m: 0.06 }), UNIT_SYSTEMS.METRIC);
    const input = screen.getByDisplayValue('60.00');

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.blur(input);
    expect(onUpdateEdge).not.toHaveBeenCalled();
    expect(input.value).toBe('60.00');
  });
});

const renderNodePanel = (node, unitSystem = UNIT_SYSTEMS.METRIC) => {
  const onUpdate = vi.fn();
  render(
    <UnitProvider initialUnitSystem={unitSystem}>
      <SetupPanel node={node} onUpdate={onUpdate} />
    </UnitProvider>
  );
  return onUpdate;
};

describe('F2-05: leaving an untouched field does not rewrite it', () => {
  const regulator = { id: 'r1', type: 'linear_regulator', data: { max_cv: 0.05, set_pressure_pa: 225000, label: 'PRV' } };

  it('keeps a 2.25 bar(a) setpoint exact and shows it without rounding to 2.3', () => {
    const onUpdate = renderNodePanel(regulator);
    const input = screen.getByDisplayValue('2.25');
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('commits a typed setpoint once', () => {
    const onUpdate = renderNodePanel(regulator);
    const input = screen.getByDisplayValue('2.25');
    fireEvent.change(input, { target: { value: '2.4' } });
    fireEvent.blur(input);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0][1].set_pressure_pa).toBeCloseTo(240000, 6);
  });

  it('does not turn a 1 L/min restriction into 1.14 L/min by clicking through it in imperial', () => {
    const node = { id: 'cr1', type: 'calibrated_restriction', data: { flow_base_lmin: 1, inlet_pressure_base_bara: 3.5, outlet_pressure_base_bara: 1, temp_base_c: 45, restriction_model: 'orifice', fluid_type: 'system' } };
    const onUpdate = renderNodePanel(node, UNIT_SYSTEMS.IMPERIAL);
    const input = screen.getByDisplayValue('0.3');
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(onUpdate).not.toHaveBeenCalled();
  });
});

describe('D-12: cracking pressure is labelled as a differential', () => {
  it.each(['check_valve', 'check_valve_orifice'])('%s shows Cracking ΔP in psi when imperial', (type) => {
    renderNodePanel({ id: 'cv1', type, data: { cv: 10, cracking_pressure_bar: 0.05 } }, UNIT_SYSTEMS.IMPERIAL);
    expect(screen.getByText('Cracking ΔP (psi)')).toBeTruthy();
    expect(screen.queryByText(/Cracking Pressure|psig/)).toBeNull();
  });
});

describe('F2-16: zero is a legitimate value', () => {
  it('accepts a check valve cracking pressure of 0', () => {
    const node = { id: 'cv1', type: 'check_valve', data: { cv: 10, cracking_pressure_bar: 0.05 } };
    const onUpdate = renderNodePanel(node);
    expect(screen.getByText('Cracking ΔP (bar)')).toBeTruthy();   // D-12: a differential, not barg
    const input = screen.getByDisplayValue('0.05');
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.blur(input);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0][1].cracking_pressure_bar).toBe(0);
  });

  it('accepts a calibration temperature of 0 degC and below', () => {
    const node = { id: 'cr1', type: 'calibrated_restriction', data: { flow_base_lmin: 10, inlet_pressure_base_bara: 3.5, outlet_pressure_base_bara: 1, temp_base_c: 45, restriction_model: 'orifice', fluid_type: 'system' } };
    const onUpdate = renderNodePanel(node);
    const input = screen.getByDisplayValue('45');
    fireEvent.change(input, { target: { value: '-10' } });
    fireEvent.blur(input);
    expect(onUpdate.mock.calls[0][1].temp_base_c).toBe(-10);
  });

  it('shows a stored 0 as 0, not as the default', () => {
    const node = { id: 'hx1', type: 'heat_exchanger', data: { rated_dp_bar: 0, medium_temp_c: 0 } };
    renderNodePanel(node);
    expect(screen.getAllByDisplayValue('0').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByDisplayValue('10')).toBeNull();
  });
});

describe('custom reducer geometry is stored in m in imperial mode', () => {
  const reducer = () => ({ id: 'r1', type: 'reducer', data: {
    standard: 'CUSTOM', diameter_in_m: 0.07792, diameter_out_m: 0.05248, length_m: 0.089, cone_angle_deg: 18.2,
  } });

  it('stores a 4 in transition length as 0.1016 m (not converted a second time as feet)', () => {
    const onUpdate = renderNodePanel(reducer(), UNIT_SYSTEMS.IMPERIAL);
    const input = screen.getByDisplayValue('3.50');
    fireEvent.change(input, { target: { value: '4' } });
    fireEvent.blur(input);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0][1].length_m).toBeCloseTo(0.1016, 4);
  });

  it('stores a 3 in inlet diameter as 0.0762 m and rejects an empty one', () => {
    const onUpdate = renderNodePanel(reducer(), UNIT_SYSTEMS.IMPERIAL);
    const input = screen.getByDisplayValue('3.068');
    fireEvent.change(input, { target: { value: '3' } });
    fireEvent.blur(input);
    expect(onUpdate.mock.calls[0][1].diameter_in_m).toBeCloseTo(0.0762, 4);

    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('shows the length the solver uses, not a stale catalogue length', () => {
    renderNodePanel({ ...reducer(), data: { ...reducer().data, length_m: 0.12 } });
    expect(screen.getByDisplayValue('120.0')).toBeTruthy();
  });
});

describe('F2-04: the heat exchanger inspector shows what the solver uses', () => {
  it('shows 0.5 bar for a heat exchanger without a stored rated pressure drop', () => {
    renderNodePanel({ id: 'hx1', type: 'heat_exchanger', data: {} });
    expect(screen.getByDisplayValue('0.5')).toBeTruthy();
  });
});
