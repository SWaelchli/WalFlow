import React, { useMemo, memo } from 'react';
import { 
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Scatter, Legend
} from 'recharts';
import { useUnits } from '../../context/UnitContext';
import { niceTicks, formatTick } from '../../utils/chartTicks';
import ChartLegend from './ChartLegend';

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
  const { labels, isImperial, lminToDisplay, formatDiffPressurePa, formatPressure, formatFlowM3s, formatPower } = useUnits();
  const { type, data } = node;
  const { max_discharge_pressure_bara, telemetry } = data;
  const maxDischargeBara = parseFloat(max_discharge_pressure_bara ?? 50) || 50;
  
  const showCavitationWarning = telemetry?.cavitation_warning === true;
  const inPort = telemetry?.inlets?.[0];
  const outPort = telemetry?.outlets?.[0];
  const currentQ = inPort?.flow_rate || 0;
  const pInTotal = inPort?.total_pressure ?? inPort?.pressure ?? 0;
  const pOutTotal = outPort?.total_pressure ?? outPort?.pressure ?? 0;
  const currentDpPa = pOutTotal - pInTotal;
  const currentDpBar = currentDpPa / 100000;
  
  const actualFlowLmin = Math.abs(currentQ) * 60000.0;
  const isVolumetric = type === 'volumetric_pump';

  const flowMultiplier = lminToDisplay(1);
  const pressMultiplier = isImperial ? 14.5037738 : 1.0;

  const curves = telemetry?.pump_curves;

  const chartData = useMemo(() => {
    if (!curves?.flow_m3s?.length) return null;
    const absQ = Math.abs(currentQ);
    const K = (absQ > 1e-7) ? Math.max(0, currentDpBar) / (absQ ** 2) : 0;
    return curves.flow_m3s.map((qM3s, i) => {
      const pumpBar = curves.dp_pa[i] / 100000;
      const systemBar = K * (qM3s ** 2);
      return {
        q: qM3s * 60000 * flowMultiplier,
        pump: pumpBar * pressMultiplier,
        system: systemBar * pressMultiplier,
      };
    });
  }, [curves, currentQ, currentDpBar, flowMultiplier, pressMultiplier]);

  const xMaxDisplay = chartData ? chartData[chartData.length - 1].q : 0;
  const xTicks = useMemo(
    () => (xMaxDisplay > 0 ? niceTicks(xMaxDisplay, 5).filter((t) => t <= xMaxDisplay * (1 + 1e-9)) : undefined),
    [xMaxDisplay]
  );

  const { minY, maxY } = useMemo(() => {
    if (!chartData || !chartData.length) return { minY: 0, maxY: 10 };
    let localMinY = currentDpBar;
    let localMaxY = currentDpBar;
    for (let i = 0; i < (curves?.dp_pa?.length || 0); i++) {
      const pumpBar = curves.dp_pa[i] / 100000;
      if (pumpBar < localMinY) localMinY = pumpBar;
      if (pumpBar > localMaxY) localMaxY = pumpBar;
    }
    for (const pt of chartData) {
      const sysBar = pt.system / pressMultiplier;
      if (sysBar > localMaxY) localMaxY = sysBar;
    }
    const minY = localMinY < 0 ? Math.floor(localMinY * pressMultiplier * 1.1) : 0;
    const rawMaxY = Math.max(localMaxY * pressMultiplier * 1.1, (localMinY < 0 ? 0 : 0.5));
    const maxY = niceTicks(rawMaxY, 5).pop() || 1;
    return { minY, maxY };
  }, [chartData, curves, currentDpBar, pressMultiplier]);

  const opQ = actualFlowLmin * flowMultiplier;
  const opP = currentDpBar * pressMultiplier;
  const opPoint = useMemo(() => [{ q: opQ, p: opP }], [opQ, opP]);

  const legendPayload = [
    { value: 'Pump Curve', type: 'plainline', color: 'var(--color-primary)' },
    { value: 'System', type: 'plainline', color: 'var(--color-success)' },
    ...(telemetry ? [{ value: 'Operating Point', type: 'cross', color: 'var(--color-brand-dark)' }] : []),
  ];

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
        <PumpWarning tone="danger" title={`DISCHARGE PRESSURE LIMIT REACHED (${formatPressure(maxDischargeBara, isImperial ? 0 : 2)} ${labels.pressureAbs.toUpperCase()})`}
          text="The internal relief recirculates the excess flow to suction, so the delivered flow is below displacement. Check for a closed or undersized outlet path." />
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: 'var(--fs-xs)', fontWeight: '800', color: 'var(--color-brand-dark)', textTransform: 'uppercase', letterSpacing: '0.05em', borderLeft: '3px solid var(--color-primary)', paddingLeft: '8px' }}>
          Performance Curve
        </span>
      </div>
      
      <div style={{ width: '100%', height: '240px', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)' }}>
        {!chartData ? (
          <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--fs-sm)', fontStyle: 'italic', padding: '10px 0', textAlign: 'center' }}>
            Run a simulation to see the pump curve
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 240, height: 160 }}>
            <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 4, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
              <XAxis dataKey="q" type="number" domain={[0, xMaxDisplay]} ticks={xTicks} tickFormatter={formatTick} fontSize={10} height={36}
                label={{ value: labels.flow, position: 'insideBottomRight', offset: -2, fontSize: 10, fill: 'var(--color-text-secondary)' }} />
              <YAxis type="number" domain={[minY, maxY]} tickCount={6} tickFormatter={formatTick} fontSize={10} width={45}
                label={{ value: labels.pressureDiff, angle: -90, position: 'insideLeft', offset: 10, fontSize: 10, fill: 'var(--color-text-secondary)', style: { textAnchor: 'middle' } }} />
              <Legend verticalAlign="top" align="right" height={40} content={() => <ChartLegend payload={legendPayload} />} />
              <Line dataKey="pump" stroke="var(--color-primary)" strokeWidth={2.5} dot={false} name="Pump Curve" legendType="plainline" activeDot={false} isAnimationActive={false} />
              <Line dataKey="system" stroke="var(--color-success)" strokeWidth={2} dot={false} name="System" legendType="plainline" activeDot={false} isAnimationActive={false} />
              {telemetry && <Scatter name="Operating Point" dataKey="p" data={opPoint} fill="var(--color-brand-dark)" isAnimationActive={false} shape="cross" legendType="cross" />}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div style={{ background: 'var(--color-surface-hover)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', fontWeight: '600', letterSpacing: '0.02em', marginBottom: '2px' }}>Flow</div>
          <div style={{ fontSize: 'var(--fs-sm)', fontWeight: '700', color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>{formatFlowM3s(Math.abs(currentQ))} <span style={{ fontSize: 'var(--fs-xs)', fontWeight: '500' }}>{labels.flow}</span></div>
        </div>
        <div style={{ background: 'var(--color-surface-hover)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', fontWeight: '600', letterSpacing: '0.02em', marginBottom: '2px' }}>Pressure Increase</div>
          <div style={{ fontSize: 'var(--fs-sm)', fontWeight: '700', color: 'var(--color-primary-text)', fontFamily: 'var(--font-mono)' }}>{formatDiffPressurePa(currentDpPa)} {labels.pressureDiff}</div>
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
