// Pump curves for the pump chart. They repeat the backend pump models (centrifugal_pump.py, volumetric_pump.py)
// so the chart can draw the whole curve without a solver call; `pumpCurves.fixtures.json` (written and checked
// by the backend test `test_f2_24_pump_curve_fixtures.py`) fails the build of either side if they drift apart.

export const GRAVITY = 9.81; // m/s2, same value as the backend

/**
 * Running centrifugal pump: dP (bar) at flow `qM3s`: rho*g*(H0 + C*Q^2), H0 = H_rated*(1 + rise/100).
 * @param {{flowRatedLmin: number, headRatedM: number, risePct: number}} pump
 */
export function centrifugalDpBar(pump, qM3s, rho) {
  const qRated = (parseFloat(pump.flowRatedLmin) || 100) / 60000;
  const hRated = parseFloat(pump.headRatedM) || 0;
  const rise = parseFloat(pump.risePct) || 20.0;
  const hShutoff = hRated * (1.0 + rise / 100.0);
  const c = qRated > 0 ? (hRated - hShutoff) / (qRated ** 2) : 0;
  return Math.max(0, rho * GRAVITY * (hShutoff + c * (qM3s ** 2))) / 100000;
}

/**
 * Positive-displacement pump: dP (bar) at flow `qM3s`; the lower of the displacement spring, the power
 * limit (VFD drive only) and the discharge limit (absolute pressure minus suction pressure).
 * @param {{flowRatedLmin: number, motorPowerKw: number, efficiencyPct: number, fixedSpeed: boolean,
 *          maxDischargeBara: number, suctionPa: number}} pump
 */
export function volumetricDpBar(pump, qM3s) {
  const qRated = (parseFloat(pump.flowRatedLmin) || 100) / 60000;
  const powerW = (parseFloat(pump.motorPowerKw) || 5) * 1000;
  const eff = (parseFloat(pump.efficiencyPct) || 85) / 100;
  const stiffness = 10_000_000.0 / (0.01 * qRated);
  const dpDisplacement = Math.max(0, stiffness * (qRated - qM3s));
  const dpPower = pump.fixedSpeed ? Infinity : (powerW * eff) / Math.sqrt(qM3s ** 2 + 1e-10);
  const dpLimit = Math.max(0, pump.maxDischargeBara * 100000 - (pump.suctionPa || 101325));
  return Math.min(dpDisplacement, dpPower, dpLimit) / 100000;
}
