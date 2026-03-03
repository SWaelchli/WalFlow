import React, { useMemo } from 'react';
import { 
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Scatter, Legend
} from 'recharts';
import { m3sToLmin } from '../utils/converters';

export default function PumpDetails({ node }) {
  const { A, B, C, telemetry } = node.data;
  
  const currentQ = telemetry?.inlets?.[0]?.flow_rate || 0;
  const currentPin = telemetry?.inlets?.[0]?.pressure || 0;
  const currentPout = telemetry?.outlets?.[0]?.pressure || 0;
  const currentDpBar = (currentPout - currentPin) / 100000;
  
  const rho = telemetry?.inlets?.[0]?.density || 1000;
  const g = 9.81;

  // 1. Center the Operating Point on X-Axis
  const actualFlowLmin = parseFloat(m3sToLmin(Math.abs(currentQ)));
  const maxX = Math.max(300, actualFlowLmin * 2);

  const { chartData } = useMemo(() => {
    const data = [];
    const absQ = Math.abs(currentQ);
    const K = (absQ > 1e-7 && currentDpBar > 0) ? currentDpBar / (absQ ** 2) : 0;

    for (let i = 0; i <= 50; i++) {
      const qLmin = (maxX * i) / 50;
      const qM3s = qLmin / 60000;
      const headM = A + (B || 0) * qM3s + (C || 0) * (qM3s ** 2);
      const pumpBar = (rho * g * headM) / 100000;
      const systemBar = K * (qM3s ** 2);
      
      data.push({
        q: qLmin,
        pump: parseFloat(Math.max(0, pumpBar).toFixed(2)),
        system: parseFloat(systemBar.toFixed(2))
      });
    }
    return { chartData: data };
  }, [A, B, C, currentQ, currentDpBar, rho, maxX]);

  const opPoint = useMemo(() => [{
    q: actualFlowLmin,
    p: parseFloat(currentDpBar.toFixed(2))
  }], [actualFlowLmin, currentDpBar]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
      <div style={{ fontSize: '12px', color: '#0f172a', fontWeight: 'bold', borderLeft: '3px solid #0284c7', paddingLeft: '8px' }}>
        Pump Performance
      </div>
      
      <div style={{ width: '100%', height: '240px', minHeight: '240px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="q" type="number" domain={[0, maxX]} fontSize={10} tickCount={5} />
            <YAxis type="number" domain={[0, 'auto']} fontSize={10} />
            
            <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '10px' }} />
            
            <Line dataKey="pump" stroke="#0284c7" strokeWidth={2} dot={false} name="Pump" isAnimationActive={false} />
            <Line dataKey="system" stroke="#10b981" strokeWidth={2} strokeDasharray="5 5" dot={false} name="System" isAnimationActive={false} />
            
            {telemetry && (
              <Scatter name="Operating Point" dataKey="p" data={opPoint} fill="red" isAnimationActive={false} style={{ pointerEvents: 'none' }} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
          <span style={{ color: '#64748b' }}>Operating Flow:</span>
          <span style={{ fontWeight: 'bold' }}>{actualFlowLmin.toFixed(1)} L/min</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
          <span style={{ color: '#64748b' }}>Operating Boost:</span>
          <span style={{ fontWeight: 'bold', color: '#0284c7' }}>{currentDpBar.toFixed(2)} bar</span>
        </div>
      </div>
    </div>
  );
}
