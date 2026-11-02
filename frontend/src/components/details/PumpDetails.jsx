import React, { useMemo, memo } from 'react';
import { 
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Scatter
} from 'recharts';
import { useUnits } from '../../context/UnitContext';
import { niceTicks, formatTick } from '../../utils/chartTicks';
import { ResultSection, ResultTable, ResultRow, ResultCallout, ResultChart } from './ResultBlocks';
import { CHART_TICK, CHART_MARGIN, CHART_GRID, chartAxisLabel, CHART_Y_WIDTH } from './chartProps';
import { isNodeOff } from '../../utils/nodeReadouts';

const OFF_BADGE = { text: 'OFF', kind: 'danger', title: 'Component is currently inactive (Off)' };

const PumpDetails = memo(function PumpDetails({ node }) {
  const { labels, isImperial, lminToDisplay, formatDiffPressurePa, formatPressure, formatFlowM3s, formatPower, formatLength, formatDimensionless } = useUnits();
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
    // A volumetric curve keeps falling past its limit; show from 0 (or the operating point) and let the axis clip it
    const minY = isVolumetric ? Math.floor(Math.min(0, currentDpBar * pressMultiplier))
      : (localMinY < 0 ? Math.floor(localMinY * pressMultiplier * 1.1) : 0);
    const rawMaxY = Math.max(localMaxY * pressMultiplier * 1.1, (localMinY < 0 ? 0 : 0.5));
    const maxY = niceTicks(rawMaxY, 5).pop() || 1;
    return { minY, maxY };
  }, [chartData, curves, currentDpBar, pressMultiplier, isVolumetric]);

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

  const hasAlerts = showCavitationWarning || telemetry?.motor_overload || telemetry?.power_limited || telemetry?.pressure_cap_reached;
  const npshaM = telemetry?.npsha_m;
  const npshRequiredM = (telemetry?.npshr_m || 0) + (telemetry?.npsh_margin_m ?? 0.5);

  return (
    <>
      {hasAlerts && (
        <ResultSection title="Alerts">
          {showCavitationWarning && (
            <ResultCallout tone="danger" title="CAVITATION RISK">
              {npshaM != null
                ? `NPSHa ${formatLength(npshaM)} ${labels.length} is below NPSHr + margin (${formatLength(npshRequiredM)} ${labels.length}). Pump may be cavitating, leading to damage.`
                : 'Suction pressure is critically low. Pump may be cavitating, leading to damage.'}
            </ResultCallout>
          )}
          {telemetry?.motor_overload && (
            <ResultCallout tone="danger" title={`MOTOR OVERLOADED (${Math.round(motorLoadPct || 0)} % OF RATING)`}>
              Shaft power exceeds the motor rating. A fixed-speed motor keeps the flow but would overheat and trip; reduce the discharge pressure or use a larger motor.
            </ResultCallout>
          )}
          {telemetry?.power_limited && (
            <ResultCallout tone="warning" title="POWER-LIMITED">
              The drive has reduced the speed to stay within the motor rating, so the flow is below displacement.
            </ResultCallout>
          )}
          {telemetry?.pressure_cap_reached && (
            <ResultCallout tone="danger" title={`DISCHARGE PRESSURE LIMIT REACHED (${formatPressure(maxDischargeBara, isImperial ? 0 : 2)} ${labels.pressureAbs.toUpperCase()})`}>
              The internal relief recirculates the excess flow to suction, so the delivered flow is below displacement. Check for a closed or undersized outlet path.
            </ResultCallout>
          )}
        </ResultSection>
      )}

      <ResultSection title="Performance Curve" badge={isNodeOff(data) ? OFF_BADGE : undefined}>
        <ResultChart legend={legendPayload}
          empty={isNodeOff(data) ? 'Pump is off, so there is no curve to show.' : (!chartData && 'Run a simulation to see the pump curve')}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 240, height: 160 }}>
            <ComposedChart data={chartData} margin={CHART_MARGIN}>
              <CartesianGrid {...CHART_GRID} />
              <XAxis dataKey="q" type="number" domain={[0, xMaxDisplay]} ticks={xTicks} tickFormatter={formatTick} tick={CHART_TICK} height={36}
                label={chartAxisLabel(labels.flow)} />
              <YAxis type="number" domain={[minY, maxY]} tickCount={6} tickFormatter={formatTick} tick={CHART_TICK} width={CHART_Y_WIDTH} allowDataOverflow
                label={chartAxisLabel(labels.pressureDiff, true)} />
              <Line dataKey="pump" stroke="var(--color-primary)" strokeWidth={2.5} dot={false} name="Pump Curve" legendType="plainline" activeDot={false} isAnimationActive={false} />
              <Line dataKey="system" stroke="var(--color-success)" strokeWidth={2} dot={false} name="System" legendType="plainline" activeDot={false} isAnimationActive={false} />
              {telemetry && <Scatter name="Operating Point" dataKey="p" data={opPoint} fill="var(--color-brand-dark)" isAnimationActive={false} shape="cross" legendType="cross" />}
            </ComposedChart>
          </ResponsiveContainer>
        </ResultChart>
      </ResultSection>

      <ResultSection title="Operating Point">
        <ResultTable>
          <ResultRow label="Flow" value={formatFlowM3s(Math.abs(currentQ))} unit={labels.flow} />
          <ResultRow label="Pressure Increase" value={formatDiffPressurePa(currentDpPa)} unit={labels.pressureDiff} />
          <ResultRow label="Hydraulic Power" value={formatPower(Math.max(0, hydraulicPowerKW))} unit={labels.power} />
          {isVolumetric ? (
            <ResultRow label="Motor Load (% of rating)" title="Shaft power as a percentage of the motor rating"
              value={motorLoadPct !== undefined ? formatDimensionless(motorLoadPct, 'percentWhole') : null} unit="%" />
          ) : (
            <ResultRow label="Shaft Power" value={shaftPowerKW !== undefined ? formatPower(shaftPowerKW) : null} unit={labels.power} />
          )}
          {npshaM != null && <ResultRow label="NPSHa" value={formatLength(npshaM)} unit={labels.length} />}
        </ResultTable>
      </ResultSection>
    </>
  );
});

export default PumpDetails;
