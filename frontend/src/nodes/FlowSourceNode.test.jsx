import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ReactFlowProvider } from 'reactflow';
import FlowSourceNode from './FlowSourceNode';
import { UnitProvider } from '../context/UnitContext';
import { UNIT_SYSTEMS } from '../utils/converters';

afterEach(cleanup);

const renderNode = (source_flow_lmin) => render(
  <UnitProvider initialUnitSystem={UNIT_SYSTEMS.METRIC}>
    <ReactFlowProvider>
      <FlowSourceNode id="fs1" selected={false} data={{ label: 'Demand', source_flow_lmin }} />
    </ReactFlowProvider>
  </UnitProvider>
);

describe('flow source label', () => {
  it('shows a negative set flow as a draw-off magnitude', () => {
    renderNode(-3398);
    expect(screen.getByText(/Draw-off/).textContent).toMatch(/3398/);
    expect(screen.queryByText(/-3398/)).toBeNull();
  });

  it('shows a positive set flow without the draw-off label', () => {
    renderNode(50);
    expect(screen.queryByText(/Draw-off/)).toBeNull();
  });
});
