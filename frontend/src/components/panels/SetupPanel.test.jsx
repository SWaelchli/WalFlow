import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import SetupPanel from './SetupPanel';
import { UnitProvider } from '../../context/UnitContext';
import { UNIT_SYSTEMS } from '../../utils/converters';
import { primeFittingStandards } from '../../hooks/useFittingStandards';
import { notify } from '../../utils/dialogs';

vi.mock('axios', () => ({ default: { get: vi.fn(() => Promise.resolve({ data: [] })) } }));
vi.mock('../../utils/dialogs', async (orig) => ({ ...(await orig()), notify: vi.fn() }));

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

describe('pipe sizes picked in the inspector are stored in SI in imperial mode', () => {
  it('stores DN80 STD as 77.92 mm (3.068 in), not divided by 39.37', () => {
    const onUpdateEdge = renderPanel(pipeEdge({ pipe_class_id: 'manual', standardDn: 50, standardSch: 'STD', diameter_m: 0.05248 }), UNIT_SYSTEMS.IMPERIAL);
    fireEvent.change(screen.getByDisplayValue('2" (DN50)'), { target: { value: '80' } });

    const updates = onUpdateEdge.mock.calls.at(-1)[1];
    expect(updates.standardDn).toBe(80);
    expect(updates.diameter_m).toBeCloseTo(0.07792, 6);
  });
});

describe('free inner diameter commits on blur', () => {
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

describe('leaving an untouched field does not rewrite it', () => {
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

describe('cracking pressure is labelled as a differential', () => {
  it.each(['check_valve', 'check_valve_orifice'])('%s shows Cracking ΔP in psi when imperial', (type) => {
    renderNodePanel({ id: 'cv1', type, data: { cv: 10, cracking_pressure_bar: 0.05 } }, UNIT_SYSTEMS.IMPERIAL);
    expect(screen.getByText('Cracking ΔP (psi)')).toBeTruthy();
    expect(screen.queryByText(/Cracking Pressure|psig/)).toBeNull();
  });
});

describe('zero is a legitimate value', () => {
  it('accepts a check valve cracking pressure of 0', () => {
    const node = { id: 'cv1', type: 'check_valve', data: { cv: 10, cracking_pressure_bar: 0.05 } };
    const onUpdate = renderNodePanel(node);
    expect(screen.getByText('Cracking ΔP (bar)')).toBeTruthy();   // a differential, not barg
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

describe('the heat exchanger inspector shows what the solver uses', () => {
  it('shows 0.5 bar for a heat exchanger without a stored rated pressure drop', () => {
    renderNodePanel({ id: 'hx1', type: 'heat_exchanger', data: {} });
    expect(screen.getByDisplayValue('0.5')).toBeTruthy();
  });
});

describe('control valve style picker in the inspector', () => {
  const IEC = 'IEC_60534_2_1_TABLE_D2';
  const catalogue = {
    code: IEC, name: 'IEC 60534-2-1 Table D.2', fitting_type: 'control_valve',
    dimensions: [
      { code: 'globe_single_contoured_open', valve_type: 'Globe', trim: 'single seat', flow_direction: 'Flow to open', fl: 0.9, fd: 0.46, xt: 0.72 },
      { code: 'angle_single_contoured_open', valve_type: 'Globe, angle', trim: 'single seat', flow_direction: 'Flow to open', fl: 0.8, fd: 0.41, xt: 0.65 },
      { code: 'butterfly_70', valve_type: 'Butterfly', trim: '70 deg', flow_direction: 'Either direction', fl: 0.62, fd: 0.57, xt: null }
    ]
  };
  const valve = (type, data) => ({ id: 'v1', type, data: { max_cv: 0.05, ...data } });
  const styled = { valve_style_id: `${IEC}:globe_single_contoured_open`, fl: 0.9, fd: 0.46 };

  beforeEach(() => { primeFittingStandards('control_valve', [catalogue]); vi.mocked(notify).mockClear(); });
  afterEach(() => primeFittingStandards('control_valve', []));

  it('offers the picker on the three IEC valves but not on the linear regulator', () => {
    for (const type of ['linear_control_valve', 'remote_control_valve', 'three_way_tcv']) {
      renderNodePanel(valve(type, styled));
      expect(screen.getByLabelText('Valve style')).toBeTruthy();
      cleanup();
    }
    renderNodePanel(valve('linear_regulator', {}));
    expect(screen.queryByLabelText('Valve style')).toBeNull();
  });

  it('writes the style id with the row F_L and F_d, and shows them read-only', () => {
    renderNodePanel(valve('linear_control_valve', styled));
    expect(screen.queryByLabelText('F_L')).toBeNull();
    // the closed select names the valve type, so globe and angle with the same trim are distinguishable
    const selected = () => screen.getByLabelText('Valve style').selectedOptions[0].textContent;
    expect(selected()).toBe('Globe · single seat, flow to open');
    const title = screen.getByLabelText('Valve style').title;
    expect(title.startsWith('Globe · single seat, flow to open\n\n')).toBe(true);
    expect(title).toContain('Flow to open: the flow pushes the plug away from the seat');
    cleanup();
    renderNodePanel(valve('linear_control_valve', { valve_style_id: `${IEC}:angle_single_contoured_open`, fl: 0.8, fd: 0.41 }));
    expect(selected()).toBe('Globe, angle · single seat, flow to open');
    cleanup();
    const onUpdate = renderNodePanel(valve('linear_control_valve', styled));
    fireEvent.change(screen.getByLabelText('Valve style'), { target: { value: `${IEC}:butterfly_70` } });
    expect(onUpdate).toHaveBeenCalledWith('v1', { valve_style_id: `${IEC}:butterfly_70`, fl: 0.62, fd: 0.57 });
  });

  it('Custom makes F_L and F_d editable and rejects F_L 1.2 and F_d 0', () => {
    const onUpdate = renderNodePanel(valve('linear_control_valve', { valve_style_id: 'custom', fl: 0.8, fd: 0.5 }));
    const fl = screen.getByLabelText('F_L');
    fireEvent.change(fl, { target: { value: '1.2' } });
    fireEvent.blur(fl);
    const fd = screen.getByLabelText('F_d');
    fireEvent.change(fd, { target: { value: '0' } });
    fireEvent.blur(fd);
    expect(onUpdate).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledTimes(2);

    fireEvent.change(screen.getByLabelText('F_L'), { target: { value: '0.75' } });
    fireEvent.blur(screen.getByLabelText('F_L'));
    expect(onUpdate).toHaveBeenCalledWith('v1', { fl: 0.75 });
  });

  it('keeps F_L and F_d of a style missing from the catalogue and says so', () => {
    const onUpdate = renderNodePanel(valve('linear_control_valve', { valve_style_id: `${IEC}:removed_row`, fl: 0.77, fd: 0.5 }));
    expect(screen.getByText('Not in catalogue')).toBeTruthy();
    expect(screen.getByText(/Style not in catalogue: F_L 0\.77, F_d 0\.50 kept/)).toBeTruthy();
    expect(onUpdate).not.toHaveBeenCalled();
  });
});

describe('junction port count', () => {
  it('shows an invalid stored count as "— invalid —" and applies a picked 4', () => {
    const onUpdate = renderNodePanel({ id: 'j1', type: 'junction', data: { label: 'J-1', num_ports: 4.6 } });
    const select = screen.getByLabelText('Number of ports');
    expect(select.selectedOptions[0].textContent).toBe('— invalid —');
    expect(select.selectedOptions[0].disabled).toBe(true);
    fireEvent.change(select, { target: { value: '4' } });
    expect(onUpdate).toHaveBeenCalledWith('j1', { num_ports: 4 });
  });
});

describe('flow boundary inspector', () => {
  const boundary = (data) => ({ id: 'fb1', type: 'flow_boundary', data: { label: 'Demand', ...data } });

  it.each([['0', 0], ['12.5', 12.5]])('accepts %s L/min as a set flow magnitude', (typed, stored) => {
    vi.mocked(notify).mockClear();
    const onUpdate = renderNodePanel(boundary({ set_flow_lmin: 40 }));
    const input = screen.getByDisplayValue('40');
    fireEvent.change(input, { target: { value: typed } });
    fireEvent.blur(input);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0][1].set_flow_lmin).toBe(stored);
    expect(notify).not.toHaveBeenCalled();
  });

  it.each([['abc'], ['-5']])('rejects set flow %s (not a number, or negative: use draw)', (typed) => {
    vi.mocked(notify).mockClear();
    const onUpdate = renderNodePanel(boundary({ set_flow_lmin: 40 }));
    const input = screen.getByDisplayValue('40');
    fireEvent.change(input, { target: { value: typed } });
    fireEvent.blur(input);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it.each([
    ['supply, 1 port', { flow_direction: 'supply' }, { suction: false, discharge: true, split: false, injected: true }],
    ['draw, 1 port', { flow_direction: 'draw' }, { suction: true, discharge: false, split: false, injected: false }],
    ['supply, 3 ports', { flow_direction: 'supply', num_ports: 3 }, { suction: false, discharge: true, split: true, injected: true }],
    ['draw, 3 ports', { flow_direction: 'draw', num_ports: 3 }, { suction: true, discharge: false, split: true, injected: false }],
  ])('shows only the fields that apply: %s', (_name, data, shown) => {
    renderNodePanel(boundary(data));
    const has = (re) => screen.queryAllByText(re).length > 0;
    expect(has(/Min\. Suction Pressure/)).toBe(shown.suction);
    expect(has(/Max\. Discharge Pressure/)).toBe(shown.discharge);
    expect(has(/Injected Temp/)).toBe(shown.injected);
    expect(screen.queryByLabelText('Flow split') !== null).toBe(shown.split);
  });

  it('changing the direction updates only flow_direction', () => {
    const onUpdate = renderNodePanel(boundary({ flow_direction: 'supply' }));
    fireEvent.change(screen.getByLabelText('Direction'), { target: { value: 'draw' } });
    expect(onUpdate).toHaveBeenCalledWith('fb1', { flow_direction: 'draw' });
  });
});

describe('flow boundary with several ports', () => {
  const renderWithEdges = (node, allEdges = []) => {
    const onUpdate = vi.fn();
    render(
      <UnitProvider initialUnitSystem={UNIT_SYSTEMS.METRIC}>
        <SetupPanel node={node} onUpdate={onUpdate} allEdges={allEdges} />
      </UnitProvider>
    );
    return onUpdate;
  };
  const boundary = (data) => ({ id: 'fb1', type: 'flow_boundary', data: { label: 'Demand', num_ports: 3, set_flow_lmin: 40, ...data } });
  const edgeTo = (k) => ({ id: `e${k}`, source: 'fb1', sourceHandle: `port-${k}`, target: `x${k}`, targetHandle: 'port-0' });

  it('offers the flow split options with plain-language labels', () => {
    renderWithEdges(boundary({}));
    const options = [...screen.getByLabelText('Flow split').options].map(o => [o.value, o.textContent]);
    expect(options).toEqual([
      ['common_pressure', 'Calculate flow per port based on equal pressure'],
      ['total_split', 'Distribute flow equally between ports'],
      ['per_port', 'Set flow at every port'],
    ]);
  });

  it.each(['junction', 'tank', 'pressure_boundary', 'flow_boundary'])('%s shows the port count directly below the Name tag, before sensing', (type) => {
    renderWithEdges({ id: 'n1', type, data: { label: 'N', num_ports: 3 } });
    const follows = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    const name = screen.getByText('Name tag');
    const ports = screen.getByLabelText('Number of ports');
    const sensing = screen.getByText(/Sensing nodes/);
    expect(follows(name, ports)).toBe(true);
    expect(follows(ports, sensing)).toBe(true);
    // nothing but the name field sits between them
    expect(name.parentElement.nextElementSibling).toBe(ports.parentElement);
  });

  it('per_port replaces the single Set Flow input by one input per port', () => {
    renderWithEdges(boundary({ flow_split: 'per_port', port_flows_lmin: [10, 20, 30] }));
    expect(screen.queryByText(/^Set Flow/)).toBeNull();
    expect([1, 2, 3].map(n => screen.getByLabelText(`Port ${n}`).value)).toEqual(['10', '20', '30']);
    expect(screen.queryByLabelText('Port 4')).toBeNull();
  });

  it.each(['common_pressure', 'total_split'])('%s keeps the single Set Flow input', (flow_split) => {
    renderWithEdges(boundary({ flow_split }));
    expect(screen.getByText(/^Set Flow/)).toBeTruthy();
    expect(screen.queryByLabelText('Port 1')).toBeNull();
  });

  it('the total sums only connected ports and unconnected ports say so but stay editable', () => {
    const onUpdate = renderWithEdges(boundary({ flow_split: 'per_port', port_flows_lmin: [10, 20, 30] }), [edgeTo(0), edgeTo(2)]);
    expect(screen.getByText('Total (connected ports): 40.0 L/min')).toBeTruthy();
    expect(screen.getAllByText('not connected')).toHaveLength(1);
    const unconnected = screen.getByLabelText('Port 2');
    expect(unconnected.disabled).toBe(false);
    fireEvent.change(unconnected, { target: { value: '25' } });
    fireEvent.blur(unconnected);
    expect(onUpdate).toHaveBeenCalledWith('fb1', { port_flows_lmin: [10, 25, 30] });
  });

  it.each([
    ['common_pressure', 'per_port', { flow_split: 'per_port', port_flows_lmin: [40, 40, 40] }],
    ['per_port', 'total_split', { flow_split: 'total_split' }],
  ])('switching the split from %s to %s writes %j', (from, to, expected) => {
    const onUpdate = renderWithEdges(boundary({ flow_split: from, port_flows_lmin: from === 'per_port' ? [1, 2, 3] : undefined }));
    fireEvent.change(screen.getByLabelText('Flow split'), { target: { value: to } });
    expect(onUpdate).toHaveBeenCalledWith('fb1', expected);
  });

  it.each([
    ['raising 3 to 5 repeats the last port', 5, [10, 20, 30], { num_ports: 5, port_flows_lmin: [10, 20, 30, 30, 30] }],
    ['lowering 3 to 2 trims', 2, [10, 20, 30], { num_ports: 2, sensing: {}, port_flows_lmin: [10, 20] }],
  ])('%s', (_name, count, flows, expected) => {
    const onUpdate = renderWithEdges(boundary({ flow_split: 'per_port', port_flows_lmin: flows }));
    fireEvent.change(screen.getByLabelText('Number of ports'), { target: { value: String(count) } });
    expect(onUpdate).toHaveBeenCalledWith('fb1', expected);
  });
});
