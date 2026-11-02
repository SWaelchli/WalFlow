import React, { useMemo, memo } from 'react';
import { 
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Scatter
} from 'recharts';
import { useUnits } from '../../context/UnitContext';
import { niceTicks, formatTick } from '../../utils/chartTicks';
import { neutralPorts } from '../../utils/nodeReadouts';
import NeutralFlowCaption from './NeutralFlowCaption';
import { ResultSection, ResultTable, ResultRow, ResultChart } from './ResultBlocks';
import { CHART_TICK, CHART_MARGIN, CHART_GRID, chartAxisLabel, CHART_Y_WIDTH } from './chartProps';

const OrificeDetails = memo(function OrificeDetails({ node }) {
  const { labels, isImperial, lminToDisplay, formatDiffPressurePa, formatDimensionless } = useUnits();
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
    <>
      <ResultSection title="Orifice Restriction Curve">
        <NeutralFlowCaption telemetry={telemetry} />
        <ResultChart legend={legendPayload} empty={!chartData && 'Run a simulation to see the orifice curve'}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 240, height: 160 }}>
            <ComposedChart data={chartData} margin={CHART_MARGIN}>
              <CartesianGrid {...CHART_GRID} />
              <XAxis dataKey="q" type="number" domain={[0, xMaxDisplay]} ticks={xTicks} tick={CHART_TICK} tickFormatter={formatTick} height={36}
                label={chartAxisLabel(labels.flow)} />
              <YAxis type="number" domain={[0, maxY]} tick={CHART_TICK} tickCount={6} tickFormatter={formatTick} width={CHART_Y_WIDTH} allowDataOverflow
                label={chartAxisLabel(labels.pressureDiff, true)} />
              <Line dataKey="dp" stroke="var(--color-primary)" strokeWidth={2.5} dot={false} name="Pressure Loss" legendType="plainline" activeDot={false} isAnimationActive={false} />
              {telemetry && <Scatter name="Operating Point" dataKey="dp" data={opPoint} fill="var(--color-brand-dark)" isAnimationActive={false} shape="cross" legendType="cross" />}
            </ComposedChart>
          </ResponsiveContainer>
        </ResultChart>
      </ResultSection>

      <ResultSection title="Operating Point">
        <ResultTable>
          <ResultRow label="Beta Ratio" value={formatDimensionless(beta, 'ratio')} />
          <ResultRow label="Current ΔP" value={formatDiffPressurePa(currentDpPa)} unit={labels.pressureDiff} />
        </ResultTable>
      </ResultSection>
    </>
  );
});

export default OrificeDetails;
