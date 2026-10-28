import React, { useMemo, memo } from 'react';
import { 
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Scatter, Legend
} from 'recharts';
import { useUnits } from '../../context/UnitContext';
import { niceTicks, formatTick } from '../../utils/chartTicks';
import { centrifugalDpBar, volumetricDpBar } from '../../utils/pumpCurves';

const CavitationWarning = ({ npsha, required, unit, mult }) => (
  <div style={{
    background: '#fff1f2',
    padding: '10px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--color-danger)',
    display: 'flex',
    flexDirection: 'column', gap: '4px', marginBottom: '10px'
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--fs-sm)', color: 'var(--color-danger-text)', fontWeight: 'bold' }}>
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 9v4m0 4h.01M2.75 12A9.25 9.25 0 0 1 12 2.75 9.25 9.25 0 0 1 21.25 12 9.25 9.25 0 0 1 12 21.25 9.25 9.25 0 0 1 2.75 12Z"/>
      </svg>
      CAVITATION RISK
    </div>
    <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-danger-text)', margin: 0, paddingLeft: '24px' }}>
      {npsha != null
        ? `NPSHa ${(npsha * mult).toFixed(1)} ${unit} is below NPSHr + margin (${(required * mult).toFixed(1)} ${unit}). Pump may be cavitating, leading to damage.`
        : 'Suction pressure is critically low. Pump may be cavitating, leading to damage.'}
    </p>
  </div>
);

const PumpWarning = ({ title, text, tone = 'warning' }) => (
  <div role="alert" style={{
    background: tone === 'danger' ? '#fff1f2' : '#FEF3C7',
    padding: '10px',
    borderRadius: 'var(--radius-sm)',
    border: `1px solid ${tone === 'danger' ? 'var(--color-danger)' : '#FCD34D'}`,
    display: 'flex', flexDirection: 'column', gap: '4px'
  }}>
    <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 'bold', color: tone === 'danger' ? 'var(--color-danger)' : 'var(--color-warning-text-strong)' }}>{title}</div>
    <p style={{ fontSize: 'var(--fs-xs)', color: tone === 'danger' ? 'var(--color-danger)' : 'var(--color-warning-text-strong)', margin: 0 }}>{text}</p>
  </div>
);

const PumpDetails = memo(function PumpDetails({ node }) {
  const { labels, isImperial, formatPressurePa, formatFlowM3s, formatPower } = useUnits();
  const { type, data } = node;
  const { 
    flow_rated_lmin, head_rated_m, rise_to_shutoff_pct, 
    motor_power_kw, efficiency_pct, drive_type, max_discharge_pressure_bara, telemetry 
  } = data;
  const maxDischargeBara = parseFloat(max_discharge_pressure_bara ?? 50) || 50;
  const isFixedSpeed = (drive_type || 'fixed_speed') === 'fixed_speed';
  // Density of the last result; the curve is in head, so ΔP follows ρ
  const rho = telemetry?.inlets?.[0]?.density || 1000;
  
  const showCavitationWarning = telemetry?.cavitation_warning === true;
  const currentQ = telemetry?.inlets?.[0]?.flow_rate || 0;
  const currentPin = telemetry?.inlets?.[0]?.pressure || 0;
  const currentPout = telemetry?.outlets?.[0]?.pressure || 0;
  const currentDpPa = currentPout - currentPin;
  const currentDpBar = currentDpPa / 100000;
  
  const actualFlowLmin = Math.abs(currentQ) * 60000.0;
  const isVolumetric = type === 'volumetric_pump';
  
  const ratedFlow = parseFloat(flow_rated_lmin || 100);
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
      
      // Discharge limit of a PD pump is absolute: the rise is capped at limit − suction pressure
      const pumpBar = isVolumetric
        ? volumetricDpBar({
            flowRatedLmin: flow_rated_lmin, motorPowerKw: motor_power_kw, efficiencyPct: efficiency_pct,
            fixedSpeed: isFixedSpeed, maxDischargeBara, suctionPa: currentPin || 101325,
          }, qM3s)
        : centrifugalDpBar({ flowRatedLmin: flow_rated_lmin, headRatedM: head_rated_m, risePct: rise_to_shutoff_pct }, qM3s, rho);

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
  }, [isVolumetric, isFixedSpeed, maxDischargeBara, currentPin, rho, flow_rated_lmin, head_rated_m, rise_to_shutoff_pct, motor_power_kw, efficiency_pct, currentQ, currentDpBar, maxX_lmin, isImperial, actualFlowLmin]);

  const xTicks = niceTicks(maxX, 5);
  const yTicks = niceTicks(maxY, 5);

  const hydraulicPowerKW = (currentDpPa * Math.abs(currentQ)) / 1000;
  const motorLoadPct = telemetry?.motor_load_pct;
  const shaftPowerKW = telemetry?.shaft_power_kw;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontFamily: 'inherit' }}>
      {showCavitationWarning && (
        <CavitationWarning
          npsha={telemetry?.npsha_m}
          required={(telemetry?.npshr_m || 0) + (telemetry?.npsh_margin_m ?? 0.5)}
          unit={isImperial ? 'ft' : 'm'}
          mult={isImperial ? 3.280839895 : 1}
        />
      )}
      {telemetry?.npsha_m != null && (
        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--color-text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
          <span>NPSHa:</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            {(telemetry.npsha_m * (isImperial ? 3.280839895 : 1)).toFixed(1)} {isImperial ? 'ft' : 'm'}
          </span>
        </div>
      )}
      {telemetry?.motor_overload && (
        <PumpWarning tone="danger" title={`MOTOR OVERLOADED (${Math.round(motorLoadPct || 0)} % OF RATING)`}
          text="Shaft power exceeds the motor rating. A fixed-speed motor keeps the flow but would overheat and trip; reduce the discharge pressure or use a larger motor." />
      )}
      {telemetry?.power_limited && (
        <PumpWarning title="POWER-LIMITED"
          text="The drive has reduced the speed to stay within the motor rating, so the flow is below displacement." />
      )}
      {telemetry?.pressure_cap_reached && (
        <PumpWarning tone="danger" title={`DISCHARGE PRESSURE LIMIT REACHED (${isImperial ? `${(maxDischargeBara * 14.5037738).toFixed(0)} PSI(A)` : `${maxDischargeBara} BAR(A)`})`}
          text="The internal relief recirculates the excess flow to suction, so the delivered flow is below displacement. Check for a closed or undersized outlet path." />
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: 'var(--fs-xs)', fontWeight: '800', color: 'var(--color-brand-dark)', textTransform: 'uppercase', letterSpacing: '0.05em', borderLeft: '3px solid var(--color-primary)', paddingLeft: '8px' }}>
          Performance Curve
        </span>
      </div>
      
      <div style={{ width: '100%', height: '240px', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)' }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 240, height: 160 }}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 4, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
            <XAxis dataKey="q" type="number" domain={[0, xTicks[xTicks.length - 1]]} ticks={xTicks} tickFormatter={formatTick} fontSize={10}
              label={{ value: `Flow (${labels.flow})`, position: 'insideBottom', offset: -6, fontSize: 'var(--fs-xs)' }} height={36} />
            <YAxis type="number" domain={[0, yTicks[yTicks.length - 1]]} ticks={yTicks} tickFormatter={formatTick} fontSize={10} width={44}
              label={{ value: `Pressure (${labels.pressureDiff})`, angle: -90, position: 'insideLeft', offset: 14, fontSize: 'var(--fs-xs)', style: { textAnchor: 'middle' } }} />
            <Legend verticalAlign="top" align="right" height={40} iconType="plainline" wrapperStyle={{ fontSize: 'var(--fs-xs)' }} />
            <Line dataKey="pump" stroke="var(--color-primary)" strokeWidth={2.5} dot={false} name="Pump Curve" isAnimationActive={false} />
            <Line dataKey="system" stroke="var(--color-success)" strokeWidth={2} dot={false} name="System" isAnimationActive={false} />
            {telemetry && <Scatter name="Operating Point" dataKey="p" data={opPoint} fill="var(--color-brand-dark)" isAnimationActive={false} shape="cross" />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div style={{ background: 'var(--color-surface-hover)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', fontWeight: '600', letterSpacing: '0.02em', marginBottom: '2px' }}>Flow</div>
          <div style={{ fontSize: 'var(--fs-sm)', fontWeight: '700', color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>{formatFlowM3s(Math.abs(currentQ))} <span style={{ fontSize: 'var(--fs-xs)', fontWeight: '500' }}>{labels.flow}</span></div>
        </div>
        <div style={{ background: 'var(--color-surface-hover)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', fontWeight: '600', letterSpacing: '0.02em', marginBottom: '2px' }}>Pressure Increase</div>
          <div style={{ fontSize: 'var(--fs-sm)', fontWeight: '700', color: 'var(--color-primary-text)', fontFamily: 'var(--font-mono)' }}>{formatPressurePa(currentDpPa)} <span style={{ fontSize: 'var(--fs-xs)', fontWeight: '500' }}>{labels.pressureDiff}</span></div>
        </div>
        <div style={{ background: 'var(--color-surface-hover)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', fontWeight: '600', letterSpacing: '0.02em', marginBottom: '2px' }}>Hydraulic Power</div>
          <div style={{ fontSize: 'var(--fs-sm)', fontWeight: '700', color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>{formatPower(Math.max(0, hydraulicPowerKW))} <span style={{ fontSize: 'var(--fs-xs)', fontWeight: '500' }}>{labels.power}</span></div>
        </div>
        <div style={{ background: 'var(--color-surface-hover)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
          {isVolumetric ? (
            <>
              <div title="Shaft power as a percentage of the motor rating" style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', fontWeight: '600', letterSpacing: '0.02em', marginBottom: '2px', cursor: 'help' }}>Motor Load (% of rating)</div>
              <div style={{ fontSize: 'var(--fs-sm)', fontWeight: '700', color: (motorLoadPct || 0) > 100 ? 'var(--color-danger)' : 'var(--color-success)', fontFamily: 'var(--font-mono)' }}>
                {motorLoadPct !== undefined ? motorLoadPct.toFixed(0) : '—'} <span style={{ fontSize: 'var(--fs-xs)', fontWeight: '500' }}>%</span>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', fontWeight: '600', letterSpacing: '0.02em', marginBottom: '2px' }}>Shaft Power</div>
              <div style={{ fontSize: 'var(--fs-sm)', fontWeight: '700', color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>
                {shaftPowerKW !== undefined ? formatPower(shaftPowerKW) : '—'} <span style={{ fontSize: 'var(--fs-xs)', fontWeight: '500' }}>{labels.power}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
});

export default PumpDetails;