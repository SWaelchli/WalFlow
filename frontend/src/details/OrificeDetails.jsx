import React, { useMemo, memo } from 'react';
import { 
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Scatter, Legend
} from 'recharts';
import { m3sToLmin } from '../utils/converters';

const OrificeDetails = memo(function OrificeDetails({ node }) {
  const { pipe_diameter, orifice_diameter, telemetry } = node.data;
  
  const currentQ = telemetry?.inlets?.[0]?.flow_rate || 0;
  const actualFlowLmin = parseFloat(m3sToLmin(Math.abs(currentQ)));
  const rho = telemetry?.inlets?.[0]?.density || 1000;
  
  const D = pipe_diameter || 0.1;
  const d = orifice_diameter || 0.07;
  const beta = d / D;

  const calculateDp = (qM3s, density) => {
    if (D <= 0 || d <= 0) return 0;
    const area = Math.PI * (D / 2) ** 2;
    const velocity = qM3s / area;
    const dynamicP = 0.5 * density * velocity ** 2;
    const Cd = 0.6;
    const geometryFactor = (1 - beta ** 4) / (Cd ** 2 * beta ** 4);
    const recDp = dynamicP * geometryFactor;
    return recDp * (1 - beta ** 2);
  };

  const maxX = Math.max(300, actualFlowLmin * 2);

  const chartData = useMemo(() => {
    const data = [];
    const steps = 60;
    for (let i = 0; i <= steps; i++) {
      const qLmin = (maxX * i) / steps;
      const qM3s = qLmin / 60000;
      data.push({
        q: qLmin,
        dp: calculateDp(qM3s, rho) / 100000
      });
    }
    return data;
  }, [D, d, beta, rho, maxX]);

  const currentDpBar = (Math.abs(telemetry?.inlets?.[0]?.pressure - telemetry?.outlets?.[0]?.pressure) / 100000) || 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
      <div style={{ fontSize: '12px', color: '#0f172a', fontWeight: 'bold', borderLeft: '3px solid #3b82f6', paddingLeft: '8px' }}>
        Orifice Restriction Curve
      </div>
      
      <div style={{ width: '100%', height: '240px', background: '#fff' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: -20, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="q" type="number" domain={[0, maxX]} fontSize={10} tickCount={6} />
            <YAxis type="number" fontSize={10} tickCount={6} />
            <Legend verticalAlign="top" align="right" height={40} iconType="plainline" wrapperStyle={{ fontSize: '11px' }} />
            <Line dataKey="dp" stroke="#2563eb" strokeWidth={2} dot={false} name="Pressure Loss" isAnimationActive={false} />
            {telemetry && <Scatter name="Operating Point" dataKey="dp" data={[{q: actualFlowLmin, dp: currentDpBar}]} fill="#000" isAnimationActive={false} shape="cross" />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#64748b' }}>Beta Ratio:</span>
          <span style={{ fontWeight: 'bold' }}>{beta.toFixed(3)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#64748b' }}>Current ΔP:</span>
          <span style={{ fontWeight: 'bold' }}>{currentDpBar.toFixed(3)} bar</span>
        </div>
      </div>
    </div>
  );
});

export default OrificeDetails;