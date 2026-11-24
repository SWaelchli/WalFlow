import React, { useMemo, useState, useCallback, memo } from 'react';
import { 
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Scatter
} from 'recharts';
import { useUnits } from '../../context/UnitContext';
import { niceTicks, niceStep, formatTick } from '../../utils/chartTicks';
import { ResultSection, ResultTable, ResultRow, ResultCallout, ResultChart } from './ResultBlocks';
import { CHART_TICK, CHART_MARGIN, CHART_GRID, chartAxisLabel, CHART_Y_WIDTH } from './chartProps';
import { isNodeOff } from '../../utils/nodeReadouts';
import SegmentedToggle from './SegmentedToggle';

const MODES = [
  { value: 'pressure', label: 'Pressure' },
  { value: 'head', label: 'Head' },
];
const G = 9.80665;

const OFF_BADGE = { text: 'OFF', kind: 'danger', title: 'Component is currently inactive (Off)' };

const PumpDetails = memo(function PumpDetails({ node }) {
  const { labels, isImperial, lminToDisplay, diffPaToDisplay, formatDiffPressurePa, formatPressure, formatFlowM3s, formatPower, formatLength, lengthToDisplay, formatDimensionless } = useUnits();
  const [mode, setMode] = useState('pressure');
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
  
  const actualFlowLmin = Math.abs(currentQ) * 60000.0;
  const isVolumetric = type === 'volumetric_pump';

  const flowMultiplier = lminToDisplay(1);
  const pressMultiplier = diffPaToDisplay(100000);

  const curves = telemetry?.pump_curves;

  const rho = inPort?.density > 0 ? inPort.density : 1000;
  const isHead = mode === 'head';
  // Pressure mode keeps bar x display multiplier; head mode is dP / (rho g) in the display length unit
  const toY = useCallback((pa) => (isHead
    ? lengthToDisplay(pa / (rho * G))
    : (pa / 100000) * pressMultiplier), [isHead, rho, lengthToDisplay, pressMultiplier]);

  const absQ = Math.abs(currentQ);
  const hasFlow = absQ > 1e-7;
  const systemArr = Array.isArray(curves?.system_dp_pa) && curves.system_dp_pa.length === curves?.flow_m3s?.length ? curves.system_dp_pa : null;
  const hasSystem = hasFlow && curves?.flow_m3s?.length > 0;

  const chartData = useMemo(() => {
    if (!curves?.flow_m3s?.length) return null;
    const K = hasFlow ? Math.max(0, currentDpPa) / (absQ ** 2) : 0;
    const sysAt = (i, qM3s) => (systemArr ? systemArr[i] : K * (qM3s ** 2));
    const rows = [];
    for (let i = 0; i < curves.flow_m3s.length; i++) {
      const qM3s = curves.flow_m3s[i];
      const dp = curves.dp_pa[i];
      if (!isVolumetric && dp < 0) {
        // Curve ends on the axis at the zero-head flow
        if (i > 0 && curves.dp_pa[i - 1] > 0) {
          const dp0 = curves.dp_pa[i - 1];
          const f = dp0 / (dp0 - dp);
          const q0 = curves.flow_m3s[i - 1];
          const qZ = q0 + (qM3s - q0) * f;
          const s0 = sysAt(i - 1, q0);
          const sZ = systemArr ? s0 + (systemArr[i] - s0) * f : K * (qZ ** 2);
          rows.push({ q: qZ * 60000 * flowMultiplier, pump: toY(0), system: hasSystem ? toY(sZ) : null });
        }
        break;
      }
      rows.push({ q: qM3s * 60000 * flowMultiplier, pump: toY(dp), system: hasSystem ? toY(sysAt(i, qM3s)) : null });
    }
    return rows.length ? rows : null;
  }, [curves, systemArr, hasFlow, hasSystem, absQ, currentDpPa, flowMultiplier, toY, isVolumetric]);

  const opQ = actualFlowLmin * flowMultiplier;
  const opP = toY(currentDpPa);
  const opPoint = useMemo(() => [{ q: opQ, p: opP }], [opQ, opP]);

  const xMaxDisplay = chartData ? Math.max(chartData[chartData.length - 1].q, opQ > chartData[chartData.length - 1].q ? opQ * 1.05 : 0) : 0;
  const xTicks = useMemo(
    () => (xMaxDisplay > 0 ? niceTicks(xMaxDisplay, 5).filter((t) => t <= xMaxDisplay * (1 + 1e-9)) : undefined),
    [xMaxDisplay]
  );

  // Lower bound 0 (below the operating point if that is negative); upper bound from the pump curve and operating point only,
  // the system curve is clipped by the axis
  const { minY, maxY, yTicks } = useMemo(() => {
    if (!chartData) return { minY: 0, maxY: 10, yTicks: undefined };
    const pumpMax = Math.max(...chartData.map((d) => d.pump));
    const hi = 1.2 * Math.max(pumpMax, opP, 0);
    if (opP < 0) {
      const lo = 1.2 * opP;
      const step = niceStep((hi - lo) || 1, 6);
      const mn = Math.floor(lo / step) * step;
      const mx = Math.max(Math.ceil(hi / step) * step, step);
      const ticks = [];
      for (let v = mn; v <= mx + step * 1e-9; v += step) ticks.push(Number(v.toPrecision(12)));
      return { minY: mn, maxY: mx, yTicks: ticks };
    }
    const ticks = niceTicks(hi > 0 ? hi : 1, 5);
    return { minY: 0, maxY: ticks[ticks.length - 1], yTicks: ticks };
  }, [chartData, opP]);

  const legendPayload = [
    { value: 'Pump Curve', type: 'plainline', color: 'var(--color-primary)' },
    ...(hasSystem ? [{ value: 'System (estimate)', type: 'plainline', color: 'var(--color-success)' }] : []),
    ...(telemetry ? [{ value: 'Operating Point', type: 'cross', color: 'var(--color-brand-dark)' }] : []),
  ];

  const hydraulicPowerKW = (currentDpPa * Math.abs(currentQ)) / 1000;
  const motorLoadPct = telemetry?.motor_load_pct;
  const shaftPowerKW = telemetry?.shaft_power_kw;

  const pumpOff = isNodeOff(data);
  const reverseFlow = !!telemetry && !pumpOff && currentQ < 0;
  const pastZeroHead = !!telemetry && !pumpOff && !isVolumetric && currentQ > 1e-7 && currentDpPa < 0;
  const ratedFlowLmin = parseFloat(data.flow_rated_lmin) || 0;
  const flowPctRated = ratedFlowLmin > 0 ? (actualFlowLmin / ratedFlowLmin) * 100 : null;

  const hasAlerts = reverseFlow || pastZeroHead || showCavitationWarning || telemetry?.motor_overload || telemetry?.power_limited || telemetry?.pressure_cap_reached;
  const npshaM = telemetry?.npsha_m;
  const npshRequiredM = (telemetry?.npshr_m || 0) + (telemetry?.npsh_margin_m ?? 0.5);

  return (
    <>
      {hasAlerts && (
        <ResultSection title="Alerts">
          {reverseFlow && (
            <ResultCallout tone="warning" title="REVERSE FLOW">
              Flow runs backwards through the running pump. The curve shows forward flow only.
            </ResultCallout>
          )}
          {pastZeroHead && (
            <ResultCallout tone="warning" title="PAST ZERO-HEAD FLOW">
              The pump is driven beyond the flow where its head reaches zero and acts as a resistance.
            </ResultCallout>
          )}
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

      <ResultSection title="Performance Curve" badge={pumpOff ? OFF_BADGE : undefined}
        actions={<SegmentedToggle options={MODES} value={mode} onChange={setMode} ariaLabel="Pump chart" />}>
        <ResultChart legend={legendPayload}
          empty={pumpOff ? 'Pump is off, so there is no curve to show.' : (!chartData && 'Run a simulation to see the pump curve')}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 240, height: 160 }}>
            <ComposedChart data={chartData} margin={CHART_MARGIN}>
              <CartesianGrid {...CHART_GRID} />
              <XAxis dataKey="q" type="number" domain={[0, xMaxDisplay]} ticks={xTicks} tickFormatter={formatTick} tick={CHART_TICK} height={36}
                label={chartAxisLabel(labels.flow)} />
              <YAxis type="number" domain={[minY, maxY]} ticks={yTicks} tickFormatter={formatTick} tick={CHART_TICK} width={CHART_Y_WIDTH} allowDataOverflow
                label={chartAxisLabel(isHead ? `Head (${labels.length})` : labels.pressureDiff, true)} />
              <Line dataKey="pump" stroke="var(--color-primary)" strokeWidth={2.5} dot={false} name="Pump Curve" legendType="plainline" activeDot={false} isAnimationActive={false} />
              {hasSystem && <Line dataKey="system" stroke="var(--color-success)" strokeWidth={2} dot={false} name="System (estimate)" legendType="plainline" activeDot={false} isAnimationActive={false} />}
              {telemetry && <Scatter name="Operating Point" dataKey="p" data={opPoint} fill="var(--color-brand-dark)" isAnimationActive={false} shape="cross" legendType="cross" />}
            </ComposedChart>
          </ResponsiveContainer>
        </ResultChart>
      </ResultSection>

      <ResultSection title="Operating Point">
        <ResultTable>
          <ResultRow label="Flow" value={formatFlowM3s(Math.abs(currentQ))} unit={labels.flow} />
          {flowPctRated != null && <ResultRow label="Flow (% of rated)" value={formatDimensionless(flowPctRated, 'percentWhole')} unit="%" />}
          <ResultRow label="Pressure Increase" value={formatDiffPressurePa(currentDpPa)} unit={labels.pressureDiff} />
          <ResultRow label="Hydraulic Power" value={formatPower(Math.max(0, hydraulicPowerKW))} unit={labels.power} />
          {isVolumetric ? (
            <ResultRow label="Motor Load [% of rating]" title="Shaft power as a percentage of the motor rating"
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
