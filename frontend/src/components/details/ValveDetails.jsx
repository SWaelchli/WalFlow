import React, { useMemo, memo } from 'react';
import { 
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Scatter, Legend
} from 'recharts';
import { useUnits } from '../../context/UnitContext';
import { niceTicks, formatTick } from '../../utils/chartTicks';

// Legend with an inline SVG icon per entry type (line, cross)
const LEGEND_ICON = {
  plainline: (c) => <line x1="0" y1="7" x2="14" y2="7" stroke={c} strokeWidth="2" />,
  cross: (c) => <path d="M7 1V13M1 7H13" stroke={c} strokeWidth="2.5" />
};
const ValveLegend = ({ payload }) => (
  <div style={{ display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: '10px', fontSize: 'var(--fs-xs)' }}>
    {payload.map((e) => (
      <span key={e.value} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: e.color }}>
        <svg width="14" height="14" viewBox="0 0 14 14">{LEGEND_ICON[e.type](e.color)}</svg>
        {e.value}
      </span>
    ))}
  </div>
);

const ValveDetails = memo(function ValveDetails({ node }) {
  const { labels, isImperial, lminToDisplay, absPaToDisplay, formatPressurePa } = useUnits();
  const { type } = node;
  const { set_pressure_pa, backpressure, telemetry, opening_pct } = node.data;
  
  const currentOpening = telemetry?.opening_pct ?? (opening_pct ?? 100);
  const currentQ = telemetry?.inlets?.[0]?.flow_rate || 0;
  const pIn = telemetry?.inlets?.[0]?.pressure || 101325;
  const pOut = telemetry?.outlets?.[0]?.pressure || 101325;
  
  const isRegulator = type === 'linear_regulator' || type === 'remote_control_valve';
  const sensedP = telemetry?.sensed_pressure !== undefined ? telemetry.sensed_pressure : (backpressure ? pIn : pOut);
  
  const setPBar = (set_pressure_pa || 500000) / 100000;
  const sensedPBar = sensedP / 100000;
  const setPDisp = absPaToDisplay(set_pressure_pa || 500000);

  const status = useMemo(() => {
    if (!isRegulator) return "ACTIVE";
    const error = Math.abs(sensedPBar - setPBar);
    const isSaturated = (currentOpening >= 99.9 || currentOpening <= 0.15);
    return error < 0.1 ? "REGULATING" : (isSaturated ? "SATURATED" : "ADJUSTING");
  }, [isRegulator, sensedPBar, setPBar, currentOpening]);

  const actualFlowLmin = Math.abs(currentQ) * 60000.0;

  const flowMultiplier = lminToDisplay(1);

  // Valve curves come from the backend (SI: m3/s, Pa), only converted to display units here
  const curves = telemetry?.valve_curves;

  const chartData = useMemo(() => {
    if (!curves?.flow_m3s?.length) return null;
    return curves.flow_m3s.map((qM3s, i) => {
      const dpFullOpen = curves.dp_full_open_pa[i];
      const dpCurrent = curves.dp_current_pa[i];
      // Rounded so float noise such as 3.0000000000000004 does not reach the chart
      const limitP = Number(absPaToDisplay(backpressure ? pOut + dpFullOpen : pIn - dpFullOpen).toPrecision(10));
      const currentP = Number(absPaToDisplay(backpressure ? pOut + dpCurrent : pIn - dpCurrent).toPrecision(10));
      return {
        q: qM3s * 60000 * flowMultiplier,
        limit: limitP,
        currentCurve: currentP,
        setpoint: isRegulator ? setPDisp : null
      };
    });
  }, [curves, setPDisp, pIn, pOut, backpressure, isRegulator, flowMultiplier, absPaToDisplay]);

  // Axis ends at the last curve point; round ticks stay within it
  const xMaxDisplay = chartData ? chartData[chartData.length - 1].q : 0;
  const xTicks = useMemo(
    () => (xMaxDisplay > 0 ? niceTicks(xMaxDisplay, 5).filter((t) => t <= xMaxDisplay * (1 + 1e-9)) : undefined),
    [xMaxDisplay]
  );

  // Operating point sits on the valve's own curve: inlet pressure for backpressure, outlet otherwise
  const ownPDisp = absPaToDisplay(backpressure ? pIn : pOut);
  const opPoint = useMemo(() => [{
    q: actualFlowLmin * flowMultiplier,
    p: ownPDisp
  }], [actualFlowLmin, ownPDisp, flowMultiplier]);

  const legendPayload = [
    ...(isRegulator ? [{ value: 'Setpoint', type: 'plainline', color: 'var(--color-primary)' }] : []),
    { value: 'Current Pos', type: 'plainline', color: 'var(--color-brand-dark)' },
    { value: 'Max Open', type: 'plainline', color: 'var(--color-border-hover)' },
    ...(telemetry ? [{ value: 'Operating Point', type: 'cross', color: 'var(--color-primary)' }] : [])
  ];

  const yDomain = useMemo(() => {
    const vals = isRegulator ? [setPDisp, ownPDisp] : [ownPDisp];
    const margin = isImperial ? 30 : 2;
    const minV = Math.min(...vals) - margin;
    const maxV = Math.max(...vals) + margin;
    return [Math.floor(minV), Math.ceil(maxV)];
  }, [isRegulator, setPDisp, ownPDisp, isImperial]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 'var(--fs-xs)', fontWeight: '800', color: 'var(--color-brand-dark)', textTransform: 'uppercase', letterSpacing: '0.05em', borderLeft: '3px solid var(--color-primary)', paddingLeft: '8px' }}>
          {isRegulator ? 'Regulation Envelope' : 'Valve Performance'}
        </div>
        <span style={{ 
          fontSize: 'var(--fs-xs)', fontWeight: 'bold', padding: '2px 6px', borderRadius: 'var(--radius-sm)',
          background: (status === "REGULATING" || status === "ACTIVE") ? '#dcfce7' : '#fee2e2',
          color: (status === "REGULATING" || status === "ACTIVE") ? 'var(--color-success)' : 'var(--color-danger)'
        }}>{status}</span>
      </div>
      
      <div style={{ width: '100%', height: '240px', background: 'var(--color-surface)' }}>
        {!chartData ? (
          <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--fs-sm)', fontStyle: 'italic', padding: '10px 0', textAlign: 'center' }}>
            Run a simulation to see the valve curves
          </div>
        ) : (
        <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 240, height: 160 }}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 4, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
            <XAxis dataKey="q" type="number" domain={[0, xMaxDisplay]} ticks={xTicks} fontSize={10} tickFormatter={formatTick} height={36}
              label={{ value: labels.flow, position: 'insideBottomRight', offset: -2, fontSize: 10, fill: 'var(--color-text-secondary)' }} />
            <YAxis type="number" domain={yDomain} fontSize={10} tickCount={6} tickFormatter={formatTick} width={45}
              label={{ value: labels.pressureAbs, angle: -90, position: 'insideLeft', offset: 10, fontSize: 10, fill: 'var(--color-text-secondary)', style: { textAnchor: 'middle' } }} />
            <Legend verticalAlign="top" align="right" height={40} content={() => <ValveLegend payload={legendPayload} />} />
            
            {isRegulator && <Line dataKey="setpoint" stroke="var(--color-primary)" strokeWidth={2} dot={false} name="Setpoint" legendType="plainline" activeDot={false} isAnimationActive={false} />}
            <Line dataKey="currentCurve" stroke="var(--color-brand-dark)" strokeWidth={2.5} dot={false} name="Current Pos" legendType="plainline" activeDot={false} isAnimationActive={false} />
            <Line dataKey="limit" stroke="var(--color-border-hover)" strokeWidth={1} dot={false} name="Max Open" legendType="plainline" activeDot={false} isAnimationActive={false} />
            
            {telemetry && <Scatter name="Operating Point" dataKey="p" data={opPoint} fill="var(--color-primary)" isAnimationActive={false} shape="cross" activeShape="cross" legendType="cross" />}
          </ComposedChart>
        </ResponsiveContainer>
        )}
      </div>

      <div style={{ background: 'var(--color-surface-hover)', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--color-text-secondary)', fontWeight: '500' }}>Current Opening:</span>
          <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--color-text-primary)', fontWeight: '700', fontFamily: 'var(--font-mono)' }}>{currentOpening?.toFixed(1)} %</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--color-text-secondary)', fontWeight: '500' }}>Sensed Pressure:</span>
          <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--color-primary-text)', fontWeight: '700', fontFamily: 'var(--font-mono)' }}>{formatPressurePa(sensedP)} {labels.pressureAbs}</span>
        </div>
        {isRegulator && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--color-text-secondary)', fontWeight: '500' }}>Target Setpoint:</span>
            <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--color-text-primary)', fontWeight: '700', fontFamily: 'var(--font-mono)' }}>{formatPressurePa(set_pressure_pa || 500000)} {labels.pressureAbs}</span>
          </div>
        )}
      </div>
    </div>
  );
});

export default ValveDetails;