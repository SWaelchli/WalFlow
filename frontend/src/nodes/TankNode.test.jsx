import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { ReactFlowProvider } from 'reactflow';
import TankNode from './TankNode';
import { UnitProvider } from '../context/UnitContext';
import { UNIT_SYSTEMS } from '../utils/converters';

afterEach(cleanup);

const renderTank = (data) => {
  const { container } = render(
    <UnitProvider initialUnitSystem={UNIT_SYSTEMS.METRIC}>
      <ReactFlowProvider>
        <TankNode id="tank1" selected={false} data={{ label: 'T1', ...data }} />
      </ReactFlowProvider>
    </UnitProvider>
  );
  const rect = container.querySelector('svg rect');
  return {
    x: Number(rect.getAttribute('x')),
    y: Number(rect.getAttribute('y')),
    width: Number(rect.getAttribute('width')),
    height: Number(rect.getAttribute('height')),
  };
};

describe('TankNode liquid fill settling with vessel rotation', () => {
  it.each([
    [0, { x: 10, y: 65, width: 40, height: 30 }],
    [180, { x: 10, y: 5, width: 40, height: 30 }],
    [90, { x: 36.5, y: 5, width: 13.5, height: 90 }],
    [270, { x: 10, y: 5, width: 13.5, height: 90 }],
  ])('positions liquid at the bottom at rotation %d°', (rotation, expected) => {
    const rect = renderTank({ level_m: 2.5, rotation });
    expect(rect.x).toBeCloseTo(expected.x, 2);
    expect(rect.y).toBeCloseTo(expected.y, 2);
    expect(rect.width).toBeCloseTo(expected.width, 2);
    expect(rect.height).toBeCloseTo(expected.height, 2);
  });

  it('normalizes rotations exceeding 360° (e.g. 450° behaves like 90°)', () => {
    const rect450 = renderTank({ level_m: 2.5, rotation: 450 });
    expect(rect450.x).toBeCloseTo(36.5, 2);
    expect(rect450.y).toBeCloseTo(5, 2);
    expect(rect450.width).toBeCloseTo(13.5, 2);
    expect(rect450.height).toBeCloseTo(90, 2);
  });

  it.each([0, 90, 180, 270])('renders zero fill dimension when level_m is 0 at rotation %d°', (rotation) => {
    const rect = renderTank({ level_m: 0, rotation });
    if (rotation === 0 || rotation === 180) {
      expect(rect.height).toBe(0);
    } else {
      expect(rect.width).toBe(0);
    }
  });
});
