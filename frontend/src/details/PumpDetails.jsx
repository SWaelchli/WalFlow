import React, { useMemo } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Scatter, Legend, ComposedChart
} from 'recharts';
import { m3sToLmin, paToBar } from '../utils/converters';

export default function PumpDetails({ node }) {
  const { A, B, C, telemetry } = node.data;
  
  // Current operating point
  const currentQ = telemetry?.inlets?.[0]?.flow_rate || 0;
  const currentPin = telemetry?.inlets?.[0]?.pressure || 0;
  const currentPout = telemetry?.outlets?.[0]?.pressure || 0;
  const currentDpPa = currentPout - currentPin;
  const currentDpBar = currentDpPa / 100000;
  
  const rho = telemetry?.inlets?.[0]?.density || 1000;
  const g = 9.81;

  // Generate Curves
  const chartData = useMemo(() => {
    const data = [];
    const maxQLmin = Math.max(300, parseFloat(m3sToLmin(Math.abs(currentQ))) * 1.5);
    
    // Calculate Resistance Constant K (dP = K * Q^2)
    // Avoid division by zero
    const K = currentQ !== 0 ? currentDpBar / (Math.abs(currentQ) ** 2) : 0;

    for (let i = 0; i <= 20; i++) {
      const qLmin = (maxQLmin * i) / 20;
      const qM3s = qLmin / 60000;
      
      // 1. Pump Head Curve (bar)
      const headM = A + (B || 0) * qM3s + (C || 0) * (qM3s ** 2);
      const pumpBar = (rho * g * headM) / 100000;
      
      // 2. System Resistance Curve (bar)
      const systemBar = K * (qM3s ** 2);
      
      data.push({
        q: parseFloat(qLmin.toFixed(1)),
        pump: parseFloat(Math.max(0, pumpBar).toFixed(2)),
        system: parseFloat(systemBar.toFixed(2))
      });
    }
    return data;
  }, [A, B, C, currentQ, currentDpBar, rho]);

  // Operating Point for the Red Dot
  const operatingPoint = [{
    q: parseFloat(m3sToLmin(Math.abs(currentQ))),
    pump: parseFloat(currentDpBar.toFixed(2))
  }];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
      <div style={{ fontSize: '12px', color: '#0f172a', fontWeight: 'bold', borderLeft: '3px solid #0284c7', paddingLeft: '8px' }}>
        Pump vs. System Curve
      </div>
      
      <div style={{ width: '100%', height: '250px', background: '#fff' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis 
              dataKey="q" 
              type="number"
              domain={[0, 'auto']}
              fontSize={10} 
              label={{ value: 'Flow (L/min)', position: 'insideBottom', offset: -10, fontSize: 10 }}
            />
            <YAxis 
              type="number"
              domain={[0, 'auto']}
              fontSize={10} 
              label={{ value: 'dP (bar)', angle: -90, position: 'insideLeft', offset: 10, fontSize: 10 }}
            />
            <Tooltip />
            <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
            
            {/* Pump Curve */}
            <Line 
              type="monotone" 
              dataKey="pump" 
              stroke="#0284c7" 
              strokeWidth={3} 
              dot={false} 
              name="Pump Curve"
              isAnimationActive={false}
            />
            
            {/* System Resistance Curve */}
            <Line 
              type="monotone" 
              dataKey="system" 
              stroke="#10b981" 
              strokeWidth={2} 
              strokeDasharray="5 5"
              dot={false} 
              name="System Resistance"
              isAnimationActive={false}
            />

            {/* Current Operating Point */}
            <Scatter 
              data={operatingPoint} 
              fill="#ef4444" 
              name="Operating Point"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '5px' }}>
        <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current Duty Point</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: '12px', color: '#475569' }}>Flow Rate:</span>
          <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#0f172a' }}>{m3sToLmin(currentQ)} L/min</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: '12px', color: '#475569' }}>Pressure Boost:</span>
          <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#0284c7' }}>{currentDpBar.toFixed(2)} bar</span>
        </div>
      </div>
    </div>
  );
}
