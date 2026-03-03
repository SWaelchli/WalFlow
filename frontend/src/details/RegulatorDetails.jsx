import React, { useMemo } from 'react';
import { 
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Scatter, Legend
} from 'recharts';
import { m3sToLmin, paToBar } from '../utils/converters';

export default function RegulatorDetails({ node }) {
  const { max_cv, set_pressure, backpressure, telemetry, opening } = node.data;
  
  const currentQ = telemetry?.inlets?.[0]?.flow_rate || 0;
  const pIn = telemetry?.inlets?.[0]?.pressure || 101325;
  const pOut = telemetry?.outlets?.[0]?.pressure || 101325;
  const sensedP = backpressure ? pIn : pOut;
  
  const setPBar = parseFloat((set_pressure / 100000).toFixed(2)) || 0;
  const sensedPBar = parseFloat((sensedP / 100000).toFixed(2)) || 0;
  const rho = telemetry?.inlets?.[0]?.density || 1000;
  const K_CV_SI = 1.732e9;

  const error = Math.abs(sensedPBar - setPBar);
  const isSaturated = (opening >= 99.9 || opening <= 0.15);
  const status = error < 0.1 ? "REGULATING" : (isSaturated ? "SATURATED" : "ADJUSTING");

  // Center Operating Point on X-Axis
  const actualFlowLmin = parseFloat(m3sToLmin(Math.abs(currentQ)));
  const maxX = Math.max(300, actualFlowLmin * 2);

  const chartData = useMemo(() => {
    const data = [];
    const safeCv = Math.max(0.0001, max_cv || 0.05);

    for (let i = 0; i <= 50; i++) {
      const qLmin = (maxX * i) / 50;
      const qM3s = qLmin / 60000;
      const dpMin = (K_CV_SI * rho * (qM3s**2)) / (safeCv**2);
      const dpMinBar = dpMin / 100000;
      let limitPBar = backpressure ? (pOut / 100000) + dpMinBar : (pIn / 100000) - dpMinBar;

      data.push({
        q: qLmin,
        limit: parseFloat(Math.max(0, limitPBar).toFixed(2)),
        setpoint: setPBar
      });
    }
    return data;
  }, [max_cv, setPBar, pIn, pOut, backpressure, rho, maxX]);

  const opPoint = useMemo(() => [{
    q: actualFlowLmin,
    p: sensedPBar
  }], [actualFlowLmin, sensedPBar]);

  const yMin = Math.max(0, Math.min(setPBar, sensedPBar) - 2);
  const yMax = Math.max(setPBar, sensedPBar) + 2;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '12px', color: '#0f172a', fontWeight: 'bold', borderLeft: '3px solid #3b82f6', paddingLeft: '8px' }}>
          Regulation Envelope
        </div>
        <span style={{ 
          fontSize: '9px', fontWeight: 'bold', padding: '2px 6px', borderRadius: '4px',
          background: status === "REGULATING" ? '#dcfce7' : '#fee2e2',
          color: status === "REGULATING" ? '#166534' : '#991b1b'
        }}>{status}</span>
      </div>
      
      <div style={{ width: '100%', height: '220px', minHeight: '220px', background: '#fff' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="q" type="number" domain={[0, maxX]} fontSize={10} tickCount={5} />
            <YAxis type="number" fontSize={10} domain={[yMin, yMax]} />
            
            <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '10px' }} />
            <Line dataKey="setpoint" stroke="#3b82f6" strokeWidth={2} dot={false} name="Setpoint" isAnimationActive={false} />
            <Line dataKey="limit" stroke="#94a3b8" strokeWidth={2} strokeDasharray="3 3" dot={false} name="Max Open Limit" isAnimationActive={false} />
            
            {telemetry && (
              <Scatter name="Operating Point" dataKey="p" data={opPoint} fill="red" isAnimationActive={false} style={{ pointerEvents: 'none' }} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#64748b' }}>Current Opening:</span>
          <span style={{ fontWeight: 'bold' }}>{opening?.toFixed(1)} %</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#64748b' }}>Sensed Pressure:</span>
          <span style={{ fontWeight: 'bold', color: '#3b82f6' }}>{sensedPBar.toFixed(2)} bar</span>
        </div>
      </div>
    </div>
  );
}
