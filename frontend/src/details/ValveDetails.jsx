import React, { useMemo, memo } from 'react';
import { 
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Scatter, Legend
} from 'recharts';
import { m3sToLmin, paToBar } from '../utils/converters';

const ValveDetails = memo(function ValveDetails({ node }) {
  const { type } = node;
  const { max_cv, set_pressure, backpressure, telemetry, opening } = node.data;
  
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
    const isSaturated = (opening >= 99.9 || opening <= 0.15);
    return error < 0.1 ? "REGULATING" : (isSaturated ? "SATURATED" : "ADJUSTING");
  }, [isRegulator, sensedPBar, setPBar, opening]);

  const actualFlowLmin = parseFloat(m3sToLmin(Math.abs(currentQ)));
  const maxX = Math.max(300, actualFlowLmin * 2);

  const chartData = useMemo(() => {
    const data = [];
    const steps = 60; 
    const safeMaxCv = Math.max(0.0001, max_cv || 0.05);
    const currentOpening = opening || 50;
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
  }, [max_cv, setPBar, pIn, pOut, backpressure, rho, maxX, isRegulator, opening]);

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
        <div style={{ fontSize: '12px', color: '#0f172a', fontWeight: 'bold', borderLeft: '3px solid #3b82f6', paddingLeft: '8px' }}>
          {isRegulator ? 'Regulation Envelope' : 'Valve Performance'}
        </div>
        <span style={{ 
          fontSize: '9px', fontWeight: 'bold', padding: '2px 6px', borderRadius: '4px',
          background: (status === "REGULATING" || status === "ACTIVE") ? '#dcfce7' : '#fee2e2',
          color: (status === "REGULATING" || status === "ACTIVE") ? '#166534' : '#991b1b'
        }}>{status}</span>
      </div>
      
      <div style={{ width: '100%', height: '240px', background: '#fff' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: -20, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="q" type="number" domain={[0, maxX]} fontSize={10} tickCount={6} />
            <YAxis type="number" fontSize={10} domain={yDomain} tickCount={6} />
            <Legend verticalAlign="top" align="right" height={40} iconType="plainline" wrapperStyle={{ fontSize: '11px' }} />
            
            {isRegulator && <Line dataKey="setpoint" stroke="#3b82f6" strokeWidth={2} dot={false} name="Setpoint" isAnimationActive={false} />}
            <Line dataKey="currentCurve" stroke="#2563eb" strokeWidth={2} dot={false} name="Current Pos" isAnimationActive={false} />
            <Line dataKey="limit" stroke="#94a3b8" strokeWidth={1} dot={false} name="Max Open" isAnimationActive={false} />
            
            {telemetry && <Scatter name="Operating Point" dataKey="p" data={opPoint} fill="#000" isAnimationActive={false} shape="cross" />}
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
        {isRegulator && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#64748b' }}>Target Setpoint:</span>
            <span style={{ fontWeight: 'bold' }}>{setPBar.toFixed(2)} bar</span>
          </div>
        )}
      </div>
    </div>
  );
});

export default ValveDetails;