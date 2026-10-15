import { describe, it, expect } from 'vitest';
import { nextAutoTag, typeDisplayName } from './autoTag';

describe('F3-13 auto tags', () => {
  it('names a component after its type', () => {
    expect(nextAutoTag('centrifugal_pump', [])).toBe('Centrifugal Pump 1');
    expect(typeDisplayName('linear_control_valve')).toBe('Control Valve');
  });
  it('numbers per type after the highest existing number', () => {
    expect(nextAutoTag('centrifugal_pump', ['Centrifugal Pump 1', 'Centrifugal Pump 4', 'Tank 9'])).toBe('Centrifugal Pump 5');
    expect(nextAutoTag('tank', ['Centrifugal Pump 1', 'Tank 9'])).toBe('Tank 10');
  });
  it('ignores renamed components', () => {
    expect(nextAutoTag('tank', ['T-101'])).toBe('Tank 1');
  });
});
