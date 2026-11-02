import React, { useMemo, memo } from 'react';
import { 
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Scatter, Legend
} from 'recharts';
import { useUnits } from '../../context/UnitContext';
import { niceTicks, formatTick } from '../../utils/chartTicks';
import { neutralPorts } from '../../utils/nodeReadouts';
import NeutralFlowCaption from './NeutralFlowCaption';
import ChartLegend from './ChartLegend';

const OrificeDetails = memo(function OrificeDetails({ node }) {
  const { labels, isImperial, lminToDisplay, formatDiffPressurePa } = useUnits();
  const { pipe_diameter_m, orifice_diameter_m, telemetry } = node.data;
  
  const neutral = neutralPorts(telemetry);
  const actualFlowLmin = (neutral?.flow ?? 0) * 60000.0;

  const portTotal = (p) => p?.total_pressure ?? p?.pressure ?? 0;
  const currentDpPa = neutral ? Math.max(0, portTotal(neutral.up) - portTotal(neutral.down)) : 0;
  const currentDpBar = currentDpPa / 100000;

  const D = (telemetry?.pipe_diameter ?? pipe_diameter_m) || 0.1;
  const d = orifice_diameter_m || 0.07;
  const beta = d / D;

  const flowMultiplier = lminToDisplay(1);
  const pressMultiplier = isImperial ? 14.5037738 : 1.0;

  const curves = telemetry?.orifice_curves;

  const chartData = useMemo(() => {
    if (!curves?.flow_m3s?.length) return null;
    return curves.flow_m3s.map((qM3s, i) => ({
      q: qM3s * 60000 * flowMultiplier,
      dp: (curves.dp_pa[i] / 100000) * pressMultiplier,
    }));
  }, [curves, flowMultiplier, pressMultiplier]);

  const xMaxDisplay = chartData ? chartData[chartData.length - 1].q : 0;
  const xTicks = useMemo(
    () => (xMaxDisplay > 0 ? niceTicks(xMaxDisplay, 5).filter((t) => t <= xMaxDisplay * (1 + 1e-9)) : undefined),
    [xMaxDisplay]
  );

  const maxY = useMemo(() => {
    let maxVal = currentDpBar * pressMultiplier;
    if (chartData?.length) {
      for (const pt of chartData) {
        if (pt.dp > maxVal) maxVal = pt.dp;
      }
    }
    const rawMax = Math.max(maxVal * 1.1, maxVal + (isImperial ? 5 : 0.5));
    return niceTicks(rawMax, 5).pop() || 1;
  }, [chartData, currentDpBar, pressMultiplier, isImperial]);

  const opPoint = useMemo(() => [{
    q: actualFlowLmin * flowMultiplier,
    dp: currentDpBar * pressMultiplier,
  }], [actualFlowLmin, currentDpBar, flowMultiplier, pressMultiplier]);

  const legendPayload = [
    { value: 'Pressure Loss', type: 'plainline', color: 'var(--color-primary)' },
    { value: 'Operating Point', type: 'cross', color: 'var(--color-brand-dark)' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
      <div style={{ fontSize: 'var(--fs-xs)', fontWeight: '800', color: 'var(--color-brand-dark)', textTransform: 'uppercase', letterSpacing: '0.05em', borderLeft: '3px solid var(--color-primary)', paddingLeft: '8px' }}>
        Orifice Restriction Curve
      </div>
      <NeutralFlowCaption telemetry={telemetry} />
      
      <div style={{ width: '100%', height: '240px', background: 'var(--color-surface)' }}>
        {!chartData ? (
          <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--fs-sm)', fontStyle: 'italic', padding: '10px 0', textAlign: 'center' }}>
            Run a simulation to see the orifice curve
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 240, height: 160 }}>
            <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 4, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
              <XAxis dataKey="q" type="number" domain={[0, xMaxDisplay]} ticks={xTicks} fontSize={10} tickFormatter={formatTick} height={36}
                label={{ value: labels.flow, position: 'insideBottomRight', offset: -2, fontSize: 10, fill: 'var(--color-text-secondary)' }} />
              <YAxis type="number" domain={[0, maxY]} fontSize={10} tickCount={6} tickFormatter={formatTick} width={45}
                label={{ value: labels.pressureDiff, angle: -90, position: 'insideLeft', offset: 10, fontSize: 10, fill: 'var(--color-text-secondary)', style: { textAnchor: 'middle' } }} />
              <Legend verticalAlign="top" align="right" height={40} content={() => <ChartLegend payload={legendPayload} />} />
              <Line dataKey="dp" stroke="var(--color-primary)" strokeWidth={2.5} dot={false} name="Pressure Loss" legendType="plainline" activeDot={false} isAnimationActive={false} />
              {telemetry && <Scatter name="Operating Point" dataKey="dp" data={opPoint} fill="var(--color-brand-dark)" isAnimationActive={false} shape="cross" legendType="cross" />}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      <div style={{ background: 'var(--color-surface-hover)', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--color-text-secondary)', fontWeight: '500' }}>Beta Ratio:</span>
          <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--color-text-primary)', fontWeight: '700', fontFamily: 'var(--font-mono)' }}>{beta.toFixed(3)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--color-text-secondary)', fontWeight: '500' }}>Current ΔP:</span>
          <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--color-text-primary)', fontWeight: '700', fontFamily: 'var(--font-mono)' }}>{formatDiffPressurePa(currentDpPa)} {labels.pressureDiff}</span>
        </div>
      </div>
    </div>
  );
});

export default OrificeDetails;
