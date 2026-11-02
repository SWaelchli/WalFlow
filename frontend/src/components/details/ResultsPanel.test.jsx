import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { UnitProvider } from '../../context/UnitContext';
import ResultsPanel from './ResultsPanel';

afterEach(() => { cleanup(); localStorage.clear(); });

const port = (flow_rate, pressure, temperature = 300) => ({ flow_rate, pressure, temperature, density: 1000, viscosity: 0.001 });
const node = (id, type, data) => ({ id, type, data: { label: id.toUpperCase(), ...data } });
const sectionOf = (root, title) => Array.from(root.querySelectorAll('section')).find((sec) => sec.querySelector('h4')?.textContent === title);
const rowCells = (root, label) => Array.from(Array.from(root.querySelectorAll('tr')).find((tr) => tr.firstChild.textContent === label).querySelectorAll('td')).map((td) => td.textContent);
const renderPanel = (props) => render(<UnitProvider><ResultsPanel allNodes={[]} allEdges={[]} {...props} /></UnitProvider>);

describe('ResultsPanel dispatches each node type to its view', () => {
  const ports = [port(0.001, 200000), port(-0.001, 150000)];
  const pipeEdge = { id: 'e1', source: 'a', target: 'b', data: { diameter_m: 0.05, length_m: 10, telemetry: { inlets: [port(0.001, 200000)], outlets: [port(0.001, 190000)] } } };
  const tcvEdges = [
    { id: 'h', source: 'hot', target: 'tcv', targetHandle: 'inlet-0', data: { telemetry: { inlets: [port(0.002, 200000, 340)] } } },
    { id: 'c', source: 'cold', target: 'tcv', targetHandle: 'inlet-1', data: { telemetry: { inlets: [port(0.001, 200000, 290)] } } },
    { id: 'o', source: 'tcv', target: 'out', data: { telemetry: { inlets: [port(0.003, 190000, 323)] } } },
  ];
  const tcvNodes = ['hot', 'cold', 'out'].map((id) => node(id, 'tank', {}));

  it.each([
    ['generic component', { selectedNode: node('x', 'check_valve', { telemetry: { inlets: [port(0.001, 200000)], outlets: [port(0.001, 180000)] } }) }, ['Upstream Pressure', 'Pressure Drop (ΔP)']],
    ['pipe', { selectedEdge: pipeEdge, allNodes: [node('a', 'tank', {}), node('b', 'tank', {})] }, ['Fluid Velocity', 'Reynolds Number', 'Pressure Gradient']],
    ['generic without results', { selectedNode: node('x', 'check_valve', {}) }, ['No simulation data available']],
    ['junction', { selectedNode: node('j', 'junction', { num_ports: 2, telemetry: { ports } }) }, ['Port Results', 'Port 2', 'Direction', 'InOut']],
    ['tank', { selectedNode: node('t', 'tank', { num_ports: 2, telemetry: { ports } }) }, ['Port Results', 'Direction', 'InOut']],
    ['pressure boundary', { selectedNode: node('p', 'pressure_boundary', { num_ports: 1, telemetry: { ports: [port(0.001, 200000)] } }) }, ['Port Results', 'Direction', 'In']],
    ['flow boundary', { selectedNode: node('f', 'flow_boundary', { num_ports: 2, telemetry: { ports: [port(0.001, 200000)] } }) }, ['Port Results', 'Direction', 'InNot connected']],
    ['three-way valve', { selectedNode: node('tcv', 'three_way_tcv', { hot_port_idx: 0, set_temperature_c: 50, telemetry: { outlets: [port(0.003, 190000, 323)], opening_pct: 60 } }), allNodes: [...tcvNodes, node('tcv', 'three_way_tcv', {})], allEdges: tcvEdges },
      ['Mixing Balance', 'Port 1 (Hot)', 'Port 2 (Cold)', 'Flow Split', 'Valve Opening', 'Supply', 'Demand']],
    ['three-way valve without flow', { selectedNode: node('tcv', 'three_way_tcv', {}), allNodes: [node('tcv', 'three_way_tcv', {})] }, ['No active flow through this junction']],
  ])('%s', (_name, props, expected) => {
    const { container } = renderPanel(props);
    for (const text of expected) expect(container.textContent, text).toContain(text);
  });

  it.each([
    ['positive flow is In', port(0.001, 200000), 'In'],
    ['negative flow is Out', port(-0.001, 200000), 'Out'],
    ['negligible flow is No flow', port(1e-12, 200000), 'No flow'],
    ['unconnected port after a run is Not connected', undefined, 'Not connected'],
  ])('port direction: %s', (_name, p, expected) => {
    const { container } = renderPanel({ selectedNode: node('j', 'junction', { num_ports: 2, telemetry: { ports: [port(0.002, 200000), ...(p ? [p] : [])] } }) });
    const row = Array.from(container.querySelectorAll('tr')).find((tr) => tr.firstChild.textContent === 'Direction');
    expect(Array.from(row.querySelectorAll('td')).map((td) => td.textContent)).toEqual(['Direction', 'In', expected, 'Not connected']);
  });

  it('port direction before a run stays a dash for every port', () => {
    const { container } = renderPanel({ selectedNode: node('j', 'junction', { num_ports: 2 }) });
    const row = Array.from(container.querySelectorAll('tr')).find((tr) => tr.firstChild.textContent === 'Direction');
    expect(Array.from(row.querySelectorAll('td')).map((td) => td.textContent)).toEqual(['Direction', '—', '—', '—']);
  });

  it('three-way valve opening section carries the mechanical trim per port', () => {
    const { container } = renderPanel({ selectedNode: node('tcv', 'three_way_tcv', { hot_port_idx: 0, telemetry: { outlets: [port(0.003, 190000, 323)], opening_pct: 60 } }), allNodes: [...tcvNodes, node('tcv', 'three_way_tcv', {})], allEdges: tcvEdges });
    const section = sectionOf(container, 'Valve Opening');
    expect(Array.from(section.querySelectorAll('th')).map((th) => th.textContent)).toEqual(['', 'Port 1 (Hot)', 'Port 2 (Cold)']);
    expect(rowCells(section, 'Opening')).toEqual(['Opening', '60%', '40%']);
  });

  describe('heat exchanger', () => {
    const hx = (telemetry) => node('hx', 'heat_exchanger', { telemetry });
    it('shows heat duty and temperature change next to the generic rows', () => {
      const { container } = renderPanel({ selectedNode: hx({ inlets: [port(0.001, 200000, 350)], outlets: [port(0.001, 190000, 330)], actual_duty_kw: 83.7 }) });
      expect(rowCells(container, 'Heat Duty')[1]).toMatch(/^83\.7/);
      expect(rowCells(container, 'Temperature Change (ΔT)')[1]).toMatch(/^-20/);
      expect(rowCells(container, 'Upstream Pressure')).toBeTruthy();
    });
    it('empty state asks for a run, not for a network calculation', () => {
      const { container } = renderPanel({ selectedNode: hx(undefined) });
      expect(container.textContent).toContain('Run a simulation');
      expect(container.textContent).not.toContain('Calculate Network');
    });
  });

  describe('pump OFF badge', () => {
    const solvedPump = { inlets: [port(0.001, 100000)], outlets: [port(0.001, 300000)] };
    it.each([
      ['centrifugal pump off without telemetry', 'centrifugal_pump', { active: false }, true],
      ['volumetric pump off without telemetry', 'volumetric_pump', { active: false }, true],
      ['centrifugal pump off with telemetry', 'centrifugal_pump', { active: false, telemetry: solvedPump }, true],
      ['volumetric pump off with telemetry', 'volumetric_pump', { active: false, telemetry: solvedPump }, true],
      ['centrifugal pump active', 'centrifugal_pump', { active: true, telemetry: solvedPump }, false],
      ['volumetric pump with no active flag', 'volumetric_pump', { telemetry: solvedPump }, false],
    ])('%s', (_n, type, data, off) => {
      const { container } = renderPanel({ selectedNode: node('p', type, data) });
      const badge = container.querySelector('.status-badge-danger');
      expect(badge?.textContent ?? null).toBe(off ? 'OFF' : null);
      expect(container.textContent.includes('Pump is off, so there is no curve to show.')).toBe(off);
      if (off) expect(container.querySelector('.result-chart-legend')).toBeNull();
    });
  });

  describe('safety valve results', () => {
    const psvTel = (bp) => ({ status: 'open', set_pressure_bara: 6.01325, inlets: [port(0.001, 700000)], outlets: [port(0.001, 120000)], capacity_utilization_pct: 45, rated_flow_lmin: 900, backpressure: bp });
    const bp = { superimposed_bp_barg: 0, built_up_bp_barg: 0.4, total_bp_barg: 0.4, bp_limit_pct: 10, bp_basis: 'built_up', bp_exceeded: false, bp_pct_of_set: 8 };
    const psv = (data, telemetry) => ({ selectedNode: node('s', 'pressure_safety_valve', { valve_type: 'conventional', ...data, telemetry }) });

    it.each([
      ['within the limit', { ...bp }, 'WITHIN LIMIT'],
      ['over the limit', { ...bp, bp_exceeded: true, bp_pct_of_set: 12 }, 'EXCEEDS 10 % LIMIT'],
    ])('backpressure badge: %s', (_n, backpressure, badge) => {
      const { container } = renderPanel(psv({ set_pressure_barg: 5 }, psvTel(backpressure)));
      expect(sectionOf(container, 'Backpressure').querySelector('.status-badge').textContent).toBe(badge);
      const limit = Array.from(sectionOf(container, 'Backpressure').querySelectorAll('tr')).find((tr) => tr.firstChild.textContent.startsWith('Limit'));
      expect(limit.querySelectorAll('td').length).toBe(3);   // label, pressure, % of set
    });

    it('without a set pressure the Limit row is absent and the badge still shows', () => {
      const { container } = renderPanel(psv({}, psvTel(bp)));
      const section = sectionOf(container, 'Backpressure');
      expect(section.querySelector('.status-badge').textContent).toBe('WITHIN LIMIT');
      expect(Array.from(section.querySelectorAll('tr')).some((tr) => tr.firstChild.textContent.startsWith('Limit'))).toBe(false);
    });

    it('capacity used row, its meter and the rated caption sit together', () => {
      const { container } = renderPanel(psv({ set_pressure_barg: 5 }, psvTel(bp)));
      const body = sectionOf(container, 'Relief Result').querySelector('.result-section-body');
      const rows = body.querySelectorAll('tr');
      expect(rows[rows.length - 1].firstChild.textContent).toBe('Capacity used (of rated)');
      const wrap = rows[rows.length - 1].closest('.result-table-wrap');
      expect(wrap.nextElementSibling.className).toContain('result-meter');
      expect(wrap.nextElementSibling.nextElementSibling.textContent).toMatch(/^Rated .*at full lift/);
    });
  });

  it('renders nothing when nothing is selected', () => {
    const { container } = renderPanel({});
    expect(container.textContent).toBe('');
  });
});
