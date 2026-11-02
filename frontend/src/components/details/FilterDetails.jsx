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

const FilterDetails = memo(function FilterDetails({ node }) {
  const { labels, isImperial, lminToDisplay, formatDiffPressurePa, formatDimensionless } = useUnits();
  const { clogging_pct, telemetry } = node.data;
  
  const neutral = neutralPorts(telemetry);
  const actualFlowLmin = (neutral?.flow ?? 0) * 60000.0;

  const portTotal = (p) => p?.total_pressure ?? p?.pressure ?? 0;
  const currentDpMeasuredPa = neutral ? Math.max(0, portTotal(neutral.up) - portTotal(neutral.down)) : 0;
  const currentDpBar = currentDpMeasuredPa / 100000;

  const flowMultiplier = lminToDisplay(1);
  const pressMultiplier = isImperial ? 14.5037738 : 1.0;

  const curves = telemetry?.filter_curves;

  const chartData = useMemo(() => {
    if (!curves?.flow_m3s?.length) return null;
    return curves.flow_m3s.map((qM3s, i) => ({
      q: qM3s * 60000 * flowMultiplier,
      clean: (curves.dp_clean_pa[i] / 100000) * pressMultiplier,
      current: (curves.dp_current_pa[i] / 100000) * pressMultiplier,
      terminal: (curves.dp_terminal_pa[i] / 100000) * pressMultiplier,
    }));
  }, [curves, flowMultiplier, pressMultiplier]);

  const xMaxDisplay = chartData ? chartData[chartData.length - 1].q : 0;
  const xTicks = useMemo(
    () => (xMaxDisplay > 0 ? niceTicks(xMaxDisplay, 5).filter((t) => t <= xMaxDisplay * (1 + 1e-9)) : undefined),
    [xMaxDisplay]
  );

  const opPoint = useMemo(() => [{
    q: actualFlowLmin * flowMultiplier,
    dp: currentDpBar * pressMultiplier,
  }], [actualFlowLmin, currentDpBar, flowMultiplier, pressMultiplier]);

  const legendPayload = [
    { value: 'Clean', type: 'plainline', color: 'var(--color-success)' },
    { value: 'Current', type: 'plainline', color: 'var(--color-primary)' },
    { value: 'Terminal', type: 'plainline', color: 'var(--color-danger)' },
    { value: 'Operating Point', type: 'cross', color: 'var(--color-brand-dark)' },
  ];

  return (
    <>
      <ResultSection title="Filter Performance (ΔP)">
        <NeutralFlowCaption telemetry={telemetry} />
        <ResultChart legend={legendPayload} empty={!chartData && 'Run a simulation to see the filter curves'}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 240, height: 160 }}>
            <ComposedChart data={chartData} margin={CHART_MARGIN}>
              <CartesianGrid {...CHART_GRID} />
              <XAxis dataKey="q" type="number" domain={[0, xMaxDisplay]} ticks={xTicks} tick={CHART_TICK} tickFormatter={formatTick} height={36}
                label={chartAxisLabel(labels.flow)} />
              <YAxis type="number" tick={CHART_TICK} tickCount={6} tickFormatter={formatTick} width={CHART_Y_WIDTH}
                label={chartAxisLabel(labels.pressureDiff, true)} />
              <Line dataKey="clean" stroke="var(--color-success)" strokeWidth={1.5} dot={false} name="Clean" legendType="plainline" activeDot={false} isAnimationActive={false} />
              <Line dataKey="current" stroke="var(--color-primary)" strokeWidth={2.5} dot={false} name="Current" legendType="plainline" activeDot={false} isAnimationActive={false} />
              <Line dataKey="terminal" stroke="var(--color-danger)" strokeWidth={1.5} dot={false} name="Terminal" legendType="plainline" activeDot={false} isAnimationActive={false} />
              {telemetry && <Scatter name="Operating Point" dataKey="dp" data={opPoint} fill="var(--color-brand-dark)" isAnimationActive={false} shape="cross" legendType="cross" />}
            </ComposedChart>
          </ResponsiveContainer>
        </ResultChart>
      </ResultSection>

      <ResultSection title="Operating Point">
        <ResultTable>
          <ResultRow label="Clogging" value={formatDimensionless(clogging_pct, 'percent')} unit="%" />
          <ResultRow label="Current ΔP" value={formatDiffPressurePa(currentDpMeasuredPa)} unit={labels.pressureDiff} />
        </ResultTable>
      </ResultSection>
    </>
  );
});

export default FilterDetails;
