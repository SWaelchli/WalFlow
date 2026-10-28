import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ReactFlowProvider } from 'reactflow';
import FlowBoundaryNode from './FlowBoundaryNode';
import { UnitProvider } from '../context/UnitContext';
import { UNIT_SYSTEMS } from '../utils/converters';

afterEach(cleanup);

const renderNode = (data) => render(
  <UnitProvider initialUnitSystem={UNIT_SYSTEMS.METRIC}>
    <ReactFlowProvider>
      <FlowBoundaryNode id="fb1" selected={false} data={{ label: 'Demand', ...data }} />
    </ReactFlowProvider>
  </UnitProvider>
);

const handleIds = (container) => [...container.querySelectorAll('.react-flow__handle')]
  .map(h => h.getAttribute('data-handleid')).filter(id => /^port-\d+$/.test(id)).sort();

describe('flow boundary node', () => {
  it.each([
    ['supply', { flow_direction: 'supply', set_flow_lmin: 50 }, /Supply/, /Draw/],
    ['draw', { flow_direction: 'draw', set_flow_lmin: 50 }, /Draw/, /Supply/],
    ['no direction stored means supply', { set_flow_lmin: 50 }, /Supply/, /Draw/],
  ])('labels the direction: %s', (_name, data, shown, hidden) => {
    renderNode(data);
    expect(screen.getByText(shown).textContent).toMatch(/50/);
    expect(screen.queryByText(hidden)).toBeNull();
  });

  it.each([
    ['per_port sums the port flows', { flow_split: 'per_port', num_ports: 3, set_flow_lmin: 50, port_flows_lmin: [10, 20, 30] }, /60/],
    ['total_split shows the set flow', { flow_split: 'total_split', num_ports: 3, set_flow_lmin: 50, port_flows_lmin: [10, 20, 30] }, /50/],
    ['per_port without port flows falls back to the set flow', { flow_split: 'per_port', set_flow_lmin: 50 }, /50/],
  ])('footer flow before a run: %s', (_name, data, expected) => {
    renderNode(data);
    expect(screen.getByText(/Supply/).textContent).toMatch(expected);
  });

  it.each([[undefined, 1], [1, 1], [3, 3], [8, 8], [20, 8]])('num_ports %s renders %s neutral handles port-0..', (numPorts, count) => {
    const { container } = renderNode({ num_ports: numPorts });
    expect(handleIds(container)).toEqual(Array.from({ length: count }, (_, k) => `port-${k}`));
    expect(container.querySelector('[data-handleid="outlet-0"]')).toBeNull();
    expect(container.querySelector('[data-handleid="inlet-0"]')).toBeNull();
  });
});
