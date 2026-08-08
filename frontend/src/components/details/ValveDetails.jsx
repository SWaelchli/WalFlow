import React, { useMemo, memo } from 'react';
import { 
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Scatter, Legend
} from 'recharts';
import { m3sToLmin } from '../../utils/converters';

const ValveDetails = memo(function ValveDetails({ node }) {
  const { type } = node;
  const { max_cv, set_pressure, backpressure, telemetry, opening } = node.data;
  
  const currentOpening = telemetry?.opening_pct ?? (opening ?? 100);
  const currentQ = telemetry?.inlets?.[0]?.flow_rate || 0;
  const pIn = telemetry?.inlets?.[0]?.pressure || 101325;
  const pOut = telemetry?.outlets?.[0]?.pressure || 101325;
  
  const isRegulator = type === 'linear_regulator' || type === 'remote_control_valve';
  const sensedP = telemetry?.sensed_pressure !== undefined ? telemetry.sensed_pressure : (backpressure ? pIn : pOut);
  
  const setPBar = set_pressure / 100000;
  const sensedPBar = sensedP / 100000;
  const rho = telemetry?.inlets?.[0]?.density || 1000;
  const K_CV_SI = 1.732e9;

  const status = useMemo(() => {
    if (!isRegulator) return "ACTIVE";
    const error = Math.abs(sensedPBar - setPBar);
    const isSaturated = (currentOpening >= 99.9 || currentOpening <= 0.15);
    return error < 0.1 ? "REGULATING" : (isSaturated ? "SATURATED" : "ADJUSTING");
  }, [isRegulator, sensedPBar, setPBar, currentOpening]);

  const actualFlowLmin = parseFloat(m3sToLmin(Math.abs(currentQ)));
  const maxX = Math.max(300, actualFlowLmin * 2);

  const chartData = useMemo(() => {
    const data = [];
    const steps = 60; 
    const safeMaxCv = Math.max(0.0001, max_cv || 0.05);
    const currentCv = (currentOpening / 100) * safeMaxCv;

    for (let i = 0; i <= steps; i++) {
      const qLmin = (maxX * i) / steps;
      const qM3s = qLmin / 60000;
      
      const dpFullOpen = (K_CV_SI * rho * (qM3s**2)) / (safeMaxCv**2);
      const limitPBar = backpressure ? (pOut / 100000) + (dpFullOpen / 100000) : (pIn / 100000) - (dpFullOpen / 100000);

      const dpCurrent = (K_CV_SI * rho * (qM3s**2)) / (currentCv**2);
      const currentPBar = backpressure ? (pOut / 100000) + (dpCurrent / 100000) : (pIn / 100000) - (dpCurrent / 100000);

      data.push({
        q: qLmin,
        limit: limitPBar,
        currentCurve: currentPBar,
        setpoint: isRegulator ? setPBar : null
      });
    }
    return data;
  }, [max_cv, setPBar, pIn, pOut, backpressure, rho, maxX, isRegulator, currentOpening]);

  const opPoint = useMemo(() => [{
    q: actualFlowLmin,
    p: sensedPBar
  }], [actualFlowLmin, sensedPBar]);

  const yDomain = useMemo(() => {
    const vals = isRegulator ? [setPBar, sensedPBar] : [sensedPBar];
    const minV = Math.max(0, Math.min(...vals) - 2);
    const maxV = Math.max(...vals) + 2;
    return [Math.floor(minV), Math.ceil(maxV)];
  }, [isRegulator, setPBar, sensedPBar]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '11px', fontWeight: '800', color: 'var(--color-brand-dark)', textTransform: 'uppercase', letterSpacing: '0.05em', borderLeft: '3px solid var(--color-primary)', paddingLeft: '8px' }}>
          {isRegulator ? 'Regulation Envelope' : 'Valve Performance'}
        </div>
        <span style={{ 
          fontSize: '9px', fontWeight: 'bold', padding: '2px 6px', borderRadius: 'var(--radius-sm)',
          background: (status === "REGULATING" || status === "ACTIVE") ? '#dcfce7' : '#fee2e2',
          color: (status === "REGULATING" || status === "ACTIVE") ? 'var(--color-success)' : 'var(--color-danger)'
        }}>{status}</span>
      </div>
      
      <div style={{ width: '100%', height: '240px', background: 'var(--color-surface)' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: -20, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
            <XAxis dataKey="q" type="number" domain={[0, maxX]} fontSize={10} tickCount={6} />
            <YAxis type="number" fontSize={10} domain={yDomain} tickCount={6} />
            <Legend verticalAlign="top" align="right" height={40} iconType="plainline" wrapperStyle={{ fontSize: '11px' }} />
            
            {isRegulator && <Line dataKey="setpoint" stroke="var(--color-primary)" strokeWidth={2} dot={false} name="Setpoint" isAnimationActive={false} />}
            <Line dataKey="currentCurve" stroke="var(--color-brand-dark)" strokeWidth={2.5} dot={false} name="Current Pos" isAnimationActive={false} />
            <Line dataKey="limit" stroke="var(--color-border-hover)" strokeWidth={1} dot={false} name="Max Open" isAnimationActive={false} />
            
            {telemetry && <Scatter name="Operating Point" dataKey="p" data={opPoint} fill="var(--color-primary)" isAnimationActive={false} shape="cross" />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div style={{ background: 'var(--color-surface-hover)', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11.5px', color: 'var(--color-text-secondary)', fontWeight: '500' }}>Current Opening:</span>
          <span style={{ fontSize: '11.5px', color: 'var(--color-text-primary)', fontWeight: '700', fontFamily: 'var(--font-mono)' }}>{currentOpening?.toFixed(1)} %</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11.5px', color: 'var(--color-text-secondary)', fontWeight: '500' }}>Sensed Pressure:</span>
          <span style={{ fontSize: '11.5px', color: 'var(--color-primary)', fontWeight: '700', fontFamily: 'var(--font-mono)' }}>{sensedPBar.toFixed(2)} bar(a)</span>
        </div>
        {isRegulator && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11.5px', color: 'var(--color-text-secondary)', fontWeight: '500' }}>Target Setpoint:</span>
            <span style={{ fontSize: '11.5px', color: 'var(--color-text-primary)', fontWeight: '700', fontFamily: 'var(--font-mono)' }}>{setPBar.toFixed(2)} bar(a)</span>
          </div>
        )}
      </div>
    </div>
  );
});

export default ValveDetails;