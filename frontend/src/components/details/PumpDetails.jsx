import React, { useMemo, memo } from 'react';
import { 
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Scatter, Legend
} from 'recharts';
import { useUnits } from '../../context/UnitContext';

const CavitationWarning = () => (
  <div style={{
    background: '#fff1f2',
    padding: '10px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--color-danger)',
    display: 'flex',
    flexDirection: 'column', gap: '4px', marginBottom: '10px'
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--color-danger)', fontWeight: 'bold' }}>
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 9v4m0 4h.01M2.75 12A9.25 9.25 0 0 1 12 2.75 9.25 9.25 0 0 1 21.25 12 9.25 9.25 0 0 1 12 21.25 9.25 9.25 0 0 1 2.75 12Z"/>
      </svg>
      CAVITATION RISK
    </div>
    <p style={{ fontSize: '11px', color: 'var(--color-danger)', margin: 0, paddingLeft: '24px' }}>
      Suction pressure is critically low. Pump may be cavitating, leading to damage.
    </p>
  </div>
);

const PumpDetails = memo(function PumpDetails({ node }) {
  const { labels, isImperial, formatPressurePa, formatFlowM3s, formatPower } = useUnits();
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
  
  const actualFlowLmin = Math.abs(currentQ) * 60000.0;
  const isVolumetric = type === 'volumetric_pump';
  
  const ratedFlow = isVolumetric ? parseFloat(flow_rated || 100) : parseFloat(flow_rated_lmin || 100);
  const maxX_lmin = Math.max(200, ratedFlow * 1.5, actualFlowLmin * 1.2);

  const { chartData, maxX, maxY, opPoint } = useMemo(() => {
    const dataPoints = [];
    const absQ = Math.abs(currentQ);
    const K = (absQ > 1e-7) ? Math.max(0, currentDpBar) / (absQ ** 2) : 0;

    let localMaxY = 0;
    const steps = 60;

    const flowMultiplier = isImperial ? 0.264172052 : 1.0;
    const pressMultiplier = isImperial ? 14.5037738 : 1.0;

    for (let i = 0; i <= steps; i++) {
      const qLmin = (maxX_lmin * i) / steps;
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
      if (systemBar > localMaxY && qLmin <= maxX_lmin) localMaxY = systemBar;

      dataPoints.push({ 
        q: qLmin * flowMultiplier, 
        pump: pumpBar * pressMultiplier, 
        system: systemBar * pressMultiplier 
      });
    }

    const opQ = actualFlowLmin * flowMultiplier;
    const opP = currentDpBar * pressMultiplier;

    return { 
      chartData: dataPoints, 
      maxX: maxX_lmin * flowMultiplier, 
      maxY: (localMaxY * pressMultiplier) * 1.1,
      opPoint: [{ q: opQ, p: opP }]
    };
  }, [isVolumetric, flow_rated_lmin, pressure_rated_bar, rise_to_shutoff_pct, flow_rated, motor_power, efficiency, currentQ, currentDpBar, maxX_lmin, isImperial, actualFlowLmin]);

  const hydraulicPowerKW = (currentDpPa * Math.abs(currentQ)) / 1000;
  const motorLimitKW = isVolumetric ? (motor_power * (efficiency / 100)) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontFamily: 'inherit' }}>
      {showCavitationWarning && <CavitationWarning />}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--color-brand-dark)', textTransform: 'uppercase', letterSpacing: '0.05em', borderLeft: '3px solid var(--color-primary)', paddingLeft: '8px' }}>
          Performance Curve
        </span>
      </div>
      
      <div style={{ width: '100%', height: '240px', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: -20, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
            <XAxis dataKey="q" type="number" domain={[0, maxX]} fontSize={10} tickCount={6} unit={` ${labels.flow}`} />
            <YAxis type="number" domain={[0, maxY]} fontSize={10} tickCount={6} unit={` ${labels.pressureDiff}`} />
            <Legend verticalAlign="top" align="right" height={40} iconType="plainline" wrapperStyle={{ fontSize: '11px' }} />
            <Line dataKey="pump" stroke="var(--color-primary)" strokeWidth={2.5} dot={false} name="Pump Curve" isAnimationActive={false} />
            <Line dataKey="system" stroke="var(--color-success)" strokeWidth={2} dot={false} name="System" isAnimationActive={false} />
            {telemetry && <Scatter name="Operating Point" dataKey="p" data={opPoint} fill="var(--color-brand-dark)" isAnimationActive={false} shape="cross" />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div style={{ background: 'var(--color-surface-hover)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
          <div style={{ fontSize: '10.5px', color: 'var(--color-text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.02em', marginBottom: '2px' }}>Flow</div>
          <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>{formatFlowM3s(Math.abs(currentQ))} <span style={{ fontSize: '9px', fontWeight: '500' }}>{labels.flow}</span></div>
        </div>
        <div style={{ background: 'var(--color-surface-hover)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
          <div style={{ fontSize: '10.5px', color: 'var(--color-text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.02em', marginBottom: '2px' }}>Pressure Increase</div>
          <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-primary)', fontFamily: 'var(--font-mono)' }}>{formatPressurePa(currentDpPa)} <span style={{ fontSize: '9px', fontWeight: '500' }}>{labels.pressureDiff}</span></div>
        </div>
        <div style={{ background: 'var(--color-surface-hover)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
          <div style={{ fontSize: '10.5px', color: 'var(--color-text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.02em', marginBottom: '2px' }}>Hydraulic Power</div>
          <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>{formatPower(Math.max(0, hydraulicPowerKW))} <span style={{ fontSize: '9px', fontWeight: '500' }}>{labels.power}</span></div>
        </div>
        <div style={{ background: 'var(--color-surface-hover)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
          <div style={{ fontSize: '10.5px', color: 'var(--color-text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.02em', marginBottom: '2px' }}>Load Factor</div>
          <div style={{ fontSize: '12px', fontWeight: '700', color: isVolumetric && hydraulicPowerKW > motorLimitKW * 0.95 ? 'var(--color-danger)' : 'var(--color-success)', fontFamily: 'var(--font-mono)' }}>
            {isVolumetric ? ((Math.max(0, hydraulicPowerKW) / motorLimitKW) * 100).toFixed(0) : '—'} <span style={{ fontSize: '9px', fontWeight: '500' }}>%</span>
          </div>
        </div>
      </div>
    </div>
  );
});

export default PumpDetails;