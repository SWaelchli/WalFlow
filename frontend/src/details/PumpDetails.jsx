import React, { useMemo, memo } from 'react';
import { 
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Scatter, Legend
} from 'recharts';
import { m3sToLmin } from '../utils/converters';

const CavitationWarning = () => (
  <div style={{
    background: '#fff1f2',
    padding: '10px',
    borderRadius: '6px',
    border: '1px solid #ffdde0',
    display: 'flex',
    flexDirection: 'column', gap: '4px', marginBottom: '10px'
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#be123c', fontWeight: 'bold' }}>
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 9v4m0 4h.01M2.75 12A9.25 9.25 0 0 1 12 2.75 9.25 9.25 0 0 1 21.25 12 9.25 9.25 0 0 1 12 21.25 9.25 9.25 0 0 1 2.75 12Z"/>
      </svg>
      CAVITATION RISK
    </div>
    <p style={{ fontSize: '11px', color: '#be123c', margin: 0, paddingLeft: '24px' }}>
      Suction pressure is critically low. Pump may be cavitating, leading to damage.
    </p>
  </div>
);

const PumpDetails = memo(function PumpDetails({ node }) {
  const { type, data } = node;
  const { 
    flow_rated_lmin, pressure_rated_bar, rise_to_shutoff_pct, 
    flow_rated, motor_power, efficiency, telemetry 
  } = data;
  
  const showCavitationWarning = telemetry?.cavitation_warning === true;
  const currentQ = telemetry?.inlets?.[0]?.flow_rate || 0;
  const currentPin = telemetry?.inlets?.[0]?.pressure || 0;
  const currentPout = telemetry?.outlets?.[0]?.pressure || 0;
  const currentDpPa = currentPout - currentPin;
  const currentDpBar = currentDpPa / 100000;
  
  const actualFlowLmin = parseFloat(m3sToLmin(Math.abs(currentQ)));
  const isVolumetric = type === 'volumetric_pump';
  
  const ratedFlow = isVolumetric ? parseFloat(flow_rated || 100) : parseFloat(flow_rated_lmin || 100);
  const maxX = Math.max(200, ratedFlow * 1.5, actualFlowLmin * 1.2);

  const { chartData, maxY } = useMemo(() => {
    const dataPoints = [];
    const absQ = Math.abs(currentQ);
    const K = (absQ > 1e-7) ? Math.max(0, currentDpBar) / (absQ ** 2) : 0;

    let localMaxY = 0;
    const steps = 60; // Increased for smoothness

    for (let i = 0; i <= steps; i++) {
      const qLmin = (maxX * i) / steps;
      const qM3s = qLmin / 60000;
      
      let pumpBar = 0;
      if (isVolumetric) {
          const flow_rated_m3s = (parseFloat(flow_rated) || 100) / 60000;
          const power_w = (parseFloat(motor_power) || 5) * 1000;
          const eff_dec = (parseFloat(efficiency) || 85) / 100;
          const stiffness = 10_000_000.0 / (0.01 * flow_rated_m3s);
          const dp_displacement = Math.max(0, stiffness * (flow_rated_m3s - qM3s));
          const dp_power = (power_w * eff_dec) / Math.sqrt(qM3s**2 + 1e-10);
          pumpBar = Math.min(dp_displacement, dp_power, 20_000_000.0) / 100000;
      } else {
          const q_rated_m3s = (parseFloat(flow_rated_lmin) || 100) / 60000;
          const p_rated_pa = (parseFloat(pressure_rated_bar) || 5.0) * 100000;
          const rise = parseFloat(rise_to_shutoff_pct) || 20.0;
          const p_shutoff = p_rated_pa * (1.0 + rise / 100.0);
          let c_coeff = (q_rated_m3s > 0) ? (p_rated_pa - p_shutoff) / (q_rated_m3s ** 2) : 0;
          pumpBar = Math.max(0, p_shutoff + c_coeff * (qM3s ** 2)) / 100000;
      }

      const systemBar = K * (qM3s ** 2);
      if (pumpBar > localMaxY) localMaxY = pumpBar;
      if (systemBar > localMaxY && qLmin <= maxX) localMaxY = systemBar;

      dataPoints.push({ q: qLmin, pump: pumpBar, system: systemBar });
    }
    return { chartData: dataPoints, maxY: localMaxY * 1.1 };
  }, [type, flow_rated_lmin, pressure_rated_bar, rise_to_shutoff_pct, flow_rated, motor_power, efficiency, currentQ, currentDpBar, maxX]);

  const hydraulicPowerKW = (currentDpPa * Math.abs(currentQ)) / 1000;
  const motorLimitKW = isVolumetric ? (motor_power * (efficiency / 100)) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontFamily: 'inherit' }}>
      {showCavitationWarning && <CavitationWarning />}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ width: '3px', height: '14px', background: '#2563eb', borderRadius: '2px' }} />
        <span style={{ fontSize: '13px', fontWeight: '700', color: '#1e293b', textTransform: 'uppercase' }}>Performance Curve</span>
      </div>
      
      <div style={{ width: '100%', height: '240px', background: '#fff', borderRadius: '8px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: -20, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="q" type="number" domain={[0, maxX]} fontSize={10} tickCount={6} />
            <YAxis type="number" domain={[0, maxY]} fontSize={10} tickCount={6} />
            <Legend verticalAlign="top" align="right" height={40} iconType="plainline" wrapperStyle={{ fontSize: '11px' }} />
            <Line dataKey="pump" stroke="#2563eb" strokeWidth={2.5} dot={false} name="Pump Curve" isAnimationActive={false} />
            <Line dataKey="system" stroke="#10b981" strokeWidth={2} dot={false} name="System" isAnimationActive={false} />
            {telemetry && <Scatter name="Operating Point" dataKey="p" data={[{q: actualFlowLmin, p: currentDpBar}]} fill="#000" isAnimationActive={false} shape="cross" />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '10px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', marginBottom: '4px' }}>Flow</div>
          <div style={{ fontSize: '14px', fontWeight: '700', color: '#1e293b' }}>{actualFlowLmin.toFixed(1)} <span style={{ fontSize: '10px', fontWeight: '500' }}>L/min</span></div>
        </div>
        <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '10px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', marginBottom: '4px' }}>Pressure Increase</div>
          <div style={{ fontSize: '14px', fontWeight: '700', color: '#2563eb' }}>{currentDpBar.toFixed(2)} <span style={{ fontSize: '10px', fontWeight: '500' }}>bar</span></div>
        </div>
        <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '10px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', marginBottom: '4px' }}>Hydraulic Power</div>
          <div style={{ fontSize: '14px', fontWeight: '700', color: '#1e293b' }}>{Math.max(0, hydraulicPowerKW).toFixed(2)} <span style={{ fontSize: '10px', fontWeight: '500' }}>kW</span></div>
        </div>
        <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '10px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', marginBottom: '4px' }}>Load Factor</div>
          <div style={{ fontSize: '14px', fontWeight: '700', color: isVolumetric && hydraulicPowerKW > motorLimitKW * 0.95 ? '#ef4444' : '#10b981' }}>
            {isVolumetric ? ((Math.max(0, hydraulicPowerKW) / motorLimitKW) * 100).toFixed(0) : '—'} <span style={{ fontSize: '10px', fontWeight: '500' }}>%</span>
          </div>
        </div>
      </div>
    </div>
  );
});

export default PumpDetails;