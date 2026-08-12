import React, { useMemo, memo } from 'react';
import { 
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Scatter, Legend
} from 'recharts';
import { m3sToLmin } from '../../utils/converters';

const smoothstep = (t) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};

const reValid = (beta) => {
  return beta <= 0.56 ? 5000 : 16000;
};

const rgCoefficient = (beta, pipeD, rePipe) => {
  const reSafe = Math.max(1e-9, rePipe);
  const a = (19000 * beta / reSafe) ** 0.8;
  let c = 0.5961
    + 0.0261 * beta ** 2
    - 0.216 * beta ** 8
    + 0.000521 * (1e6 * beta / reSafe) ** 0.7
    + (0.0188 + 0.0063 * a) * beta ** 3.5 * (1e6 / reSafe) ** 0.3;
  if (pipeD < 0.07112) c += 0.011 * (0.75 - beta) * (2.8 - pipeD / 0.0254);
  return c;
};

/**
 * Preview-chart pressure-loss calculation.
 * SYNC NOTE: This mirrors backend/simulation/equipment/orifice.py calculate_delta_p().
 * If the backend physics change, update this function to match.
 *
 * Key framing: blending works in C_m = C_d/sqrt(1-beta^4) space for the tap-dP
 * denominator, but Formula (7) requires C_d. Recover C_d just before the ratio call.
 */
const calculateDp = (qM3s, density, viscosity, D, d, beta, standard) => {
  if (D <= 0 || d <= 0) return 0;
  const betaEff = Math.min(0.75, Math.max(0.1, beta));
  const areaPipe = Math.PI * (D / 2) ** 2;
  const areaOrifice = Math.PI * (d / 2) ** 2;
  const rePipe = density * Math.abs(qM3s) * D / (areaPipe * viscosity);

  let cMeter;  // meter coefficient C_m = C_d / sqrt(1 - beta^4)
  let r;
  if (standard === 'classic_cd') {
    const betaLegacy = Math.min(0.99, beta);
    const reOrifice = Math.max(1e-6, rePipe / betaLegacy);
    const cd = Math.max(0.05, 0.6 / Math.sqrt(1 + 250 / reOrifice));
    cMeter = cd / Math.sqrt(1 - betaLegacy ** 4);
    r = 1 - betaLegacy ** 2;
  } else {
    const rv = reValid(betaEff);
    const reLo = 0.4 * rv;
    // rgCoefficient returns C_d (ISO 5167-2:2022 Formula (4)); convert to C_m for blending
    const cdRg = rgCoefficient(betaEff, D, rePipe);
    const cRg = cdRg / Math.sqrt(1 - betaEff ** 4);
    const reO = Math.max(1e-6, rePipe / betaEff);
    const cLow = (0.6 / Math.sqrt(1 + 250 / reO)) / Math.sqrt(1 - betaEff ** 4);
    const w = smoothstep((rePipe - reLo) / (rv - reLo));
    cMeter = (1 - w) * cLow + w * cRg;
    // Recover C_d from C_m for Formula (7) — Formula (7) is defined in C_d terms
    const cd = cMeter * Math.sqrt(1 - betaEff ** 4);
    const s = Math.sqrt(1 - betaEff ** 4 * (1 - cd ** 2));
    r = (s - cd * betaEff ** 2) / (s + cd * betaEff ** 2);
  }

  // tap dP: 0.5*rho*Q^2 / (Ao^2 * C_m^2) == 0.5*rho*Q^2*(1-beta^4) / (Ao^2 * C_d^2)
  const tapDp = 0.5 * density * qM3s * Math.abs(qM3s) / (areaOrifice ** 2 * cMeter ** 2);
  return r * tapDp;
};

const OrificeDetails = memo(function OrificeDetails({ node }) {
  const { pipe_diameter, orifice_diameter, telemetry } = node.data;
  
  const currentQ = telemetry?.inlets?.[0]?.flow_rate || 0;
  const actualFlowLmin = parseFloat(m3sToLmin(Math.abs(currentQ)));
  const rho = telemetry?.inlets?.[0]?.density || 1000;
  const mu = telemetry?.inlets?.[0]?.viscosity || 0.001;

  const D = (telemetry?.pipe_diameter ?? pipe_diameter) || 0.1;
  const d = orifice_diameter || 0.07;
  const beta = d / D;
  const standard = telemetry?.standard ?? (node.data.standard || 'iso_5167');

  const currentDpBar = (Math.abs(telemetry?.inlets?.[0]?.pressure - telemetry?.outlets?.[0]?.pressure) / 100000) || 0;
  const maxX = Math.max(actualFlowLmin * 1.2, actualFlowLmin + 10);
  const maxY = useMemo(() => Math.max(Math.abs(currentDpBar) * 1.5, Math.abs(currentDpBar) + 0.5), [currentDpBar]);

  const chartData = useMemo(() => {
    const data = [];
    const steps = 60;
    for (let i = 0; i <= steps; i++) {
      const qLmin = (maxX * i) / steps;
      const qM3s = qLmin / 60000;
      data.push({
        q: qLmin,
        dp: calculateDp(qM3s, rho, mu, D, d, beta, standard) / 100000
      });
    }
    return data;
  }, [D, d, beta, rho, mu, standard, maxX]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
      <div style={{ fontSize: '11px', fontWeight: '800', color: 'var(--color-brand-dark)', textTransform: 'uppercase', letterSpacing: '0.05em', borderLeft: '3px solid var(--color-primary)', paddingLeft: '8px' }}>
        Orifice Restriction Curve
      </div>
      
      <div style={{ width: '100%', height: '240px', background: 'var(--color-surface)' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: -20, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
            <XAxis dataKey="q" type="number" domain={[0, maxX]} fontSize={10} tickCount={6} unit="l/min" />
            <YAxis type="number" domain={[0, maxY]} fontSize={10} tickCount={6} unit="bar" />
            <Legend verticalAlign="top" align="right" height={40} iconType="plainline" wrapperStyle={{ fontSize: '11px' }} />
            <Line dataKey="dp" stroke="var(--color-primary)" strokeWidth={2.5} dot={false} name="Pressure Loss" isAnimationActive={false} />
            {telemetry && <Scatter name="Operating Point" dataKey="dp" data={[{q: actualFlowLmin, dp: currentDpBar}]} fill="var(--color-brand-dark)" isAnimationActive={false} shape="cross" />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div style={{ background: 'var(--color-surface-hover)', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11.5px', color: 'var(--color-text-secondary)', fontWeight: '500' }}>Beta Ratio:</span>
          <span style={{ fontSize: '11.5px', color: 'var(--color-text-primary)', fontWeight: '700', fontFamily: 'var(--font-mono)' }}>{beta.toFixed(3)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11.5px', color: 'var(--color-text-secondary)', fontWeight: '500' }}>Current ΔP:</span>
          <span style={{ fontSize: '11.5px', color: 'var(--color-text-primary)', fontWeight: '700', fontFamily: 'var(--font-mono)' }}>{currentDpBar.toFixed(3)} bar(d)</span>
        </div>
      </div>
    </div>
  );
});

export default OrificeDetails;
