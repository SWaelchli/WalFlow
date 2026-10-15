import { describe, it, expect } from 'vitest';
import { centrifugalDpBar, volumetricDpBar } from './pumpCurves';
import fixtures from './pumpCurves.fixtures.json';

// Fixture values come from the backend pump models (backend/tests/test_f2_24_pump_curve_fixtures.py)
describe('pump chart curves match the backend pump models', () => {
  it.each(fixtures.centrifugal.map((c, i) => [i, c]))('centrifugal pump %i', (_i, c) => {
    c.points.forEach(([q, bar]) => {
      expect(centrifugalDpBar(c, q, c.rho)).toBeCloseTo(bar, 6);
    });
  });

  it.each(fixtures.volumetric.map((c, i) => [i, c]))('volumetric pump %i (no discharge limit)', (_i, c) => {
    c.points.forEach(([q, bar]) => {
      const pump = { ...c, maxDischargeBara: 1e6, suctionPa: 101325 };
      expect(volumetricDpBar(pump, q)).toBeCloseTo(bar, 4);
    });
  });

  it('caps the volumetric rise at the discharge limit minus suction pressure', () => {
    const pump = { flowRatedLmin: 100, motorPowerKw: 5, efficiencyPct: 85, fixedSpeed: true, maxDischargeBara: 10, suctionPa: 2e5 };
    expect(volumetricDpBar(pump, 0)).toBeCloseTo(8, 6);
  });
});
