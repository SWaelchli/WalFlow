import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import NeutralFlowCaption from './NeutralFlowCaption';
import { UnitProvider } from '../../context/UnitContext';

afterEach(cleanup);

const caption = (p0Flow) => {
  const telemetry = { ports: [{ flow_rate: p0Flow }, { flow_rate: -p0Flow }] };
  const { container } = render(<UnitProvider><NeutralFlowCaption telemetry={telemetry} /></UnitProvider>);
  return container.textContent;
};

describe('two-port flow caption', () => {
  it.each([
    ['flow entering port 0', 0.01, 'Port 1 → Port 2'],
    ['flow entering port 1', -0.01, 'Port 2 → Port 1'],
  ])('names the direction for %s', (_, flow, direction) => {
    expect(caption(flow)).toContain(direction);
  });

  it('names no direction at negligible flow', () => {
    expect(caption(1e-10)).not.toContain('Port');
  });
});
