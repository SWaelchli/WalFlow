import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import SetupPanel from './SetupPanel';
import { UnitProvider } from '../../context/UnitContext';
import { UNIT_SYSTEMS } from '../../utils/converters';

vi.mock('axios', () => ({ default: { get: vi.fn(() => Promise.resolve({ data: [] })) } }));

afterEach(cleanup);

const pipeEdge = (data) => ({ id: 'e1', source: 'n1', target: 'n2', data: { type: 'PIPE', length: 25, ...data } });

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
    const onUpdateEdge = renderPanel(pipeEdge({ pipe_class_id: 'manual', standardDn: 50, standardSch: 'STD', diameter: 0.05248 }), UNIT_SYSTEMS.IMPERIAL);
    fireEvent.change(screen.getByDisplayValue('DN 50 (2")'), { target: { value: '80' } });

    const updates = onUpdateEdge.mock.calls.at(-1)[1];
    expect(updates.standardDn).toBe(80);
    expect(updates.diameter).toBeCloseTo(0.07792, 6);
  });
});

describe('F2-08: free inner diameter commits on blur', () => {
  it('lets the user type 60 mm and commits once on blur', () => {
    // 60 mm matches no schedule, so the inspector opens in Free Dimensions mode
    const onUpdateEdge = renderPanel(pipeEdge({ diameter: 0.06 }), UNIT_SYSTEMS.METRIC);
    const input = screen.getByDisplayValue('60.00');

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '6' } });
    fireEvent.change(input, { target: { value: '65' } });
    expect(onUpdateEdge).not.toHaveBeenCalled();
    expect(input.value).toBe('65');

    fireEvent.blur(input);
    expect(onUpdateEdge).toHaveBeenCalledTimes(1);
    expect(onUpdateEdge.mock.calls[0][1].diameter).toBeCloseTo(0.065, 9);
  });

  it('ignores an empty or zero diameter and shows the stored value again', () => {
    const onUpdateEdge = renderPanel(pipeEdge({ diameter: 0.06 }), UNIT_SYSTEMS.METRIC);
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
  const regulator = { id: 'r1', type: 'linear_regulator', data: { max_cv: 0.05, set_pressure: 225000, label: 'PRV' } };

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
    expect(onUpdate.mock.calls[0][1].set_pressure).toBeCloseTo(240000, 6);
  });

  it('does not turn a 1 L/min restriction into 1.14 L/min by clicking through it in imperial', () => {
    const node = { id: 'cr1', type: 'calibrated_restriction', data: { flow_base_lmin: 1, inlet_pressure_base_bar: 3.5, outlet_pressure_base_bar: 1, temp_base_c: 45, restriction_model: 'orifice', fluid_type: 'system' } };
    const onUpdate = renderNodePanel(node, UNIT_SYSTEMS.IMPERIAL);
    const input = screen.getByDisplayValue('0.3');
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(onUpdate).not.toHaveBeenCalled();
  });
});

describe('F2-16: zero is a legitimate value', () => {
  it('accepts a check valve cracking pressure of 0', () => {
    const node = { id: 'cv1', type: 'check_valve', data: { cv: 10, cracking_pressure_bar: 0.05 } };
    const onUpdate = renderNodePanel(node);
    const input = screen.getByDisplayValue('0.05');
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.blur(input);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0][1].cracking_pressure_bar).toBe(0);
  });

  it('accepts a calibration temperature of 0 degC and below', () => {
    const node = { id: 'cr1', type: 'calibrated_restriction', data: { flow_base_lmin: 10, inlet_pressure_base_bar: 3.5, outlet_pressure_base_bar: 1, temp_base_c: 45, restriction_model: 'orifice', fluid_type: 'system' } };
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

describe('F2-04: the heat exchanger inspector shows what the solver uses', () => {
  it('shows 0.5 bar for a heat exchanger without a stored rated pressure drop', () => {
    renderNodePanel({ id: 'hx1', type: 'heat_exchanger', data: {} });
    expect(screen.getByDisplayValue('0.5')).toBeTruthy();
  });
});
