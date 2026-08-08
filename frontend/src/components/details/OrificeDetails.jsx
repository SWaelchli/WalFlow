import React, { useMemo, memo } from 'react';
import { 
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Scatter, Legend
} from 'recharts';
import { m3sToLmin } from '../../utils/converters';

const calculateDp = (qM3s, density, D, d, beta) => {
  if (D <= 0 || d <= 0) return 0;
  const area = Math.PI * (D / 2) ** 2;
  const velocity = qM3s / area;
  const dynamicP = 0.5 * density * velocity ** 2;
  const Cd = 0.6;
  const geometryFactor = (1 - beta ** 4) / (Cd ** 2 * beta ** 4);
  const recDp = dynamicP * geometryFactor;
  return recDp * (1 - beta ** 2);
};

const OrificeDetails = memo(function OrificeDetails({ node }) {
  const { pipe_diameter, orifice_diameter, telemetry } = node.data;
  
  const currentQ = telemetry?.inlets?.[0]?.flow_rate || 0;
  const actualFlowLmin = parseFloat(m3sToLmin(Math.abs(currentQ)));
  const rho = telemetry?.inlets?.[0]?.density || 1000;
  
  const D = pipe_diameter || 0.1;
  const d = orifice_diameter || 0.07;
  const beta = d / D;

  const maxX = Math.max(300, actualFlowLmin * 2);

  const chartData = useMemo(() => {
    const data = [];
    const steps = 60;
    for (let i = 0; i <= steps; i++) {
      const qLmin = (maxX * i) / steps;
      const qM3s = qLmin / 60000;
      data.push({
        q: qLmin,
        dp: calculateDp(qM3s, rho, D, d, beta) / 100000
      });
    }
    return data;
  }, [D, d, beta, rho, maxX]);

  const currentDpBar = (Math.abs(telemetry?.inlets?.[0]?.pressure - telemetry?.outlets?.[0]?.pressure) / 100000) || 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
      <div style={{ fontSize: '11px', fontWeight: '800', color: 'var(--color-brand-dark)', textTransform: 'uppercase', letterSpacing: '0.05em', borderLeft: '3px solid var(--color-primary)', paddingLeft: '8px' }}>
        Orifice Restriction Curve
      </div>
      
      <div style={{ width: '100%', height: '240px', background: 'var(--color-surface)' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: -20, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
            <XAxis dataKey="q" type="number" domain={[0, maxX]} fontSize={10} tickCount={6} />
            <YAxis type="number" fontSize={10} tickCount={6} />
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