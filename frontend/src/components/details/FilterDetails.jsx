import React, { useMemo, memo } from 'react';
import { 
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Scatter, Legend
} from 'recharts';
import { m3sToLmin } from '../../utils/converters';

const FilterDetails = memo(function FilterDetails({ node }) {
  const { dp_clean, dp_terminal, flow_ref, clogging, telemetry } = node.data;
  
  const currentQ = telemetry?.inlets?.[0]?.flow_rate || 0;
  const actualFlowLmin = parseFloat(m3sToLmin(Math.abs(currentQ)));
  const rho = telemetry?.inlets?.[0]?.density || 1000;
  
  const dpCleanPa = (dp_clean || 0.2) * 100000.0;
  const dpTerminalPa = (dp_terminal || 1.0) * 100000.0;
  const qRefM3s = (flow_ref || 100.0) / 60000.0;
  const clogFactor = (clogging || 0.0) / 100.0;

  const kClean = dpCleanPa / (1000.0 * qRefM3s**2);
  const kTerminal = dpTerminalPa / (1000.0 * qRefM3s**2);
  const kCurr = kClean + clogFactor * (kTerminal - kClean);

  const maxX = Math.max(300, actualFlowLmin * 2);

  const chartData = useMemo(() => {
    const data = [];
    const steps = 60; 
    for (let i = 0; i <= steps; i++) {
      const qLmin = (maxX * i) / steps;
      const qM3s = qLmin / 60000;
      data.push({
        q: qLmin,
        clean: (kClean * rho * qM3s**2) / 100000,
        terminal: (kTerminal * rho * qM3s**2) / 100000,
        current: (kCurr * rho * qM3s**2) / 100000
      });
    }
    return data;
  }, [kClean, kTerminal, kCurr, rho, maxX]);

  const currentDpBar = (Math.abs(telemetry?.inlets?.[0]?.pressure - telemetry?.outlets?.[0]?.pressure) / 100000) || 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
      <div style={{ fontSize: '11px', fontWeight: '800', color: 'var(--color-brand-dark)', textTransform: 'uppercase', letterSpacing: '0.05em', borderLeft: '3px solid var(--color-primary)', paddingLeft: '8px' }}>
        Filter Performance (ΔP)
      </div>
      
      <div style={{ width: '100%', height: '240px', background: 'var(--color-surface)' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: -20, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
            <XAxis dataKey="q" type="number" domain={[0, maxX]} fontSize={10} tickCount={6} />
            <YAxis type="number" fontSize={10} tickCount={6} />
            <Legend verticalAlign="top" align="right" height={40} iconType="plainline" wrapperStyle={{ fontSize: '11px' }} />
            <Line dataKey="clean" stroke="var(--color-success)" strokeWidth={1.5} dot={false} name="Clean" isAnimationActive={false} />
            <Line dataKey="current" stroke="var(--color-primary)" strokeWidth={2.5} dot={false} name="Current" isAnimationActive={false} />
            <Line dataKey="terminal" stroke="var(--color-danger)" strokeWidth={1.5} dot={false} name="Terminal" isAnimationActive={false} />
            {telemetry && <Scatter name="Operating Point" dataKey="dp" data={[{q: actualFlowLmin, dp: currentDpBar}]} fill="var(--color-brand-dark)" isAnimationActive={false} shape="cross" />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div style={{ background: 'var(--color-surface-hover)', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11.5px', color: 'var(--color-text-secondary)', fontWeight: '500' }}>Clogging:</span>
          <span style={{ fontSize: '11.5px', color: 'var(--color-text-primary)', fontWeight: '700', fontFamily: 'var(--font-mono)' }}>{clogging?.toFixed(1)} %</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11.5px', color: 'var(--color-text-secondary)', fontWeight: '500' }}>Current ΔP:</span>
          <span style={{ fontSize: '11.5px', color: 'var(--color-text-primary)', fontWeight: '700', fontFamily: 'var(--font-mono)' }}>{currentDpBar.toFixed(2)} bar(d)</span>
        </div>
      </div>
    </div>
  );
});

export default FilterDetails;