import React, { useMemo, memo } from 'react';
import { 
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Scatter
} from 'recharts';
import { useUnits } from '../../context/UnitContext';
import { niceTicks, formatTick } from '../../utils/chartTicks';
import { ResultSection, ResultTable, ResultRow, ResultChart } from './ResultBlocks';
import { CHART_TICK, CHART_MARGIN, CHART_GRID, chartAxisLabel, CHART_Y_WIDTH } from './chartProps';

const ValveDetails = memo(function ValveDetails({ node }) {
  const { labels, isImperial, lminToDisplay, absPaToDisplay, formatPressurePa, formatDimensionless } = useUnits();
  const { type } = node;
  const { set_pressure_pa, backpressure, telemetry, opening_pct } = node.data;
  
  const currentOpening = telemetry?.opening_pct ?? (opening_pct ?? 100);
  const inPort = telemetry?.inlets?.[0];
  const outPort = telemetry?.outlets?.[0];
  const currentQ = inPort?.flow_rate || 0;
  const qOp = Math.abs(currentQ);
  const pIn = inPort?.pressure ?? 101325;
  const pOut = outPort?.pressure ?? 101325;
  const p0In = inPort?.total_pressure ?? pIn;
  const p0Out = outPort?.total_pressure ?? pOut;
  const sign = currentQ < 0 ? -1 : 1;
  const hvInOp = p0In - pIn;
  const hvOutOp = p0Out - pOut;
  
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

  const actualFlowLmin = qOp * 60000.0;

  const flowMultiplier = lminToDisplay(1);

  // Valve curves come from the backend (SI: m3/s, Pa), only converted to display units here
  const curves = telemetry?.valve_curves;

  const chartData = useMemo(() => {
    if (!curves?.flow_m3s?.length) return null;
    return curves.flow_m3s.map((qM3s, i) => {
      const dpFullOpen = curves.dp_full_open_pa[i];
      const dpCurrent = curves.dp_current_pa[i];
      const scaleHv = qOp > 1e-9 ? (qM3s / qOp) ** 2 : 0;
      const limitPa = backpressure
        ? (p0Out + sign * dpFullOpen - hvInOp * scaleHv)
        : (p0In - sign * dpFullOpen - hvOutOp * scaleHv);
      const currentPa = backpressure
        ? (p0Out + sign * dpCurrent - hvInOp * scaleHv)
        : (p0In - sign * dpCurrent - hvOutOp * scaleHv);
      // Rounded so float noise such as 3.0000000000000004 does not reach the chart
      const limitP = Number(absPaToDisplay(limitPa).toPrecision(10));
      const currentP = Number(absPaToDisplay(currentPa).toPrecision(10));
      return {
        q: qM3s * 60000 * flowMultiplier,
        limit: limitP,
        currentCurve: currentP,
        setpoint: isRegulator ? setPDisp : null
      };
    });
  }, [curves, qOp, backpressure, p0Out, sign, hvInOp, p0In, hvOutOp, absPaToDisplay, flowMultiplier, isRegulator, setPDisp]);

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

  // The plot frames the setpoint, the operating point and the start of both curves (zero flow), so every curve
  // in the legend is drawn. Further along they fall away steeply and the axis clips them, so the scale stays readable.
  // An absolute pressure is never below zero.
  const yDomain = useMemo(() => {
    const vals = [ownPDisp, ...(isRegulator ? [setPDisp] : [])];
    if (chartData?.length) vals.push(chartData[0].limit, chartData[0].currentCurve);
    const finite = vals.filter(Number.isFinite);
    const margin = isImperial ? 30 : 2;
    return [Math.max(0, Math.floor(Math.min(...finite) - margin)), Math.ceil(Math.max(...finite) + margin)];
  }, [isRegulator, setPDisp, ownPDisp, isImperial, chartData]);

  const statusBadge = { text: status, kind: (status === 'REGULATING' || status === 'ACTIVE') ? 'success' : 'warning' };

  return (
    <>
      <ResultSection title={isRegulator ? 'Regulation Envelope' : 'Valve Performance'} badge={statusBadge}>
        <ResultChart legend={legendPayload} empty={!chartData && 'Run a simulation to see the valve curves'}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 240, height: 160 }}>
            <ComposedChart data={chartData} margin={CHART_MARGIN}>
              <CartesianGrid {...CHART_GRID} />
              <XAxis dataKey="q" type="number" domain={[0, xMaxDisplay]} ticks={xTicks} tick={CHART_TICK} tickFormatter={formatTick} height={36}
                label={chartAxisLabel(labels.flow)} />
              <YAxis type="number" domain={yDomain} tick={CHART_TICK} tickCount={6} tickFormatter={formatTick} width={CHART_Y_WIDTH} allowDataOverflow
                label={chartAxisLabel(labels.pressureAbs, true)} />
              {isRegulator && <Line dataKey="setpoint" stroke="var(--color-primary)" strokeWidth={2} dot={false} name="Setpoint" legendType="plainline" activeDot={false} isAnimationActive={false} />}
              <Line dataKey="currentCurve" stroke="var(--color-brand-dark)" strokeWidth={2.5} dot={false} name="Current Pos" legendType="plainline" activeDot={false} isAnimationActive={false} />
              <Line dataKey="limit" stroke="var(--color-border-hover)" strokeWidth={1} dot={false} name="Max Open" legendType="plainline" activeDot={false} isAnimationActive={false} />
              {telemetry && <Scatter name="Operating Point" dataKey="p" data={opPoint} fill="var(--color-primary)" isAnimationActive={false} shape="cross" activeShape="cross" legendType="cross" />}
            </ComposedChart>
          </ResponsiveContainer>
        </ResultChart>
      </ResultSection>

      <ResultSection title="Operating Point">
        <ResultTable>
          <ResultRow label="Current Opening" value={formatDimensionless(currentOpening, 'percent')} unit="%" />
          <ResultRow label="Sensed Pressure" value={formatPressurePa(sensedP)} unit={labels.pressureAbs} />
          {isRegulator && <ResultRow label="Target Setpoint" value={formatPressurePa(set_pressure_pa || 500000)} unit={labels.pressureAbs} />}
        </ResultTable>
      </ResultSection>
    </>
  );
});

export default ValveDetails;
