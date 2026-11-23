import React, { useMemo, useState, memo } from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Scatter, ReferenceArea
} from 'recharts';
import { useUnits } from '../../context/UnitContext';
import { niceTicks, formatTick } from '../../utils/chartTicks';
import { ResultSection, ResultTable, ResultRow, ResultChart, ResultCallout, ResultMeter } from './ResultBlocks';
import { CHART_TICK, CHART_MARGIN, CHART_GRID, chartAxisLabel, CHART_Y_WIDTH } from './chartProps';
import SegmentedToggle from './SegmentedToggle';
import { utilisationTone } from './resultTone';

const MODES = [
  { value: 'dp-flow', label: 'ΔP – Flow' },
  { value: 'flow-cv', label: 'Flow – Cv' },
];

// Opening bands of the Flow - Cv chart (percent): below LOW poor control, up to HIGH control range, above near saturation
const BAND_LOW = 20;
const BAND_HIGH = 80;
const OPENING_TICKS = [0, 20, 50, 80, 100];
const BANDS = [
  { key: 'poor', label: 'Poor control (< 20 %)', fill: 'var(--color-danger-tint)', mark: 'var(--color-danger)' },
  { key: 'control', label: 'Control range (20–80 %)', fill: 'var(--color-success-tint)', mark: 'var(--color-success)' },
  { key: 'sat', label: 'Near saturation (> 80 %)', fill: 'var(--color-warning-bg)', mark: 'var(--color-warning)' },
];
const bandOf = (openingPct) => (openingPct < BAND_LOW ? BANDS[0] : (openingPct > BAND_HIGH ? BANDS[2] : BANDS[1]));

// Linear interpolation of y over ascending xs
const interp = (xs, ys, x) => {
  if (!xs.length) return null;
  if (x <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) {
    if (x <= xs[i]) {
      const span = xs[i] - xs[i - 1];
      return span > 0 ? ys[i - 1] + ((ys[i] - ys[i - 1]) * (x - xs[i - 1])) / span : ys[i];
    }
  }
  return ys[ys.length - 1];
};

const ValveDetails = memo(function ValveDetails({ node }) {
  const { labels, lminToDisplay, diffPaToDisplay, formatPressurePa, formatDiffPressurePa, formatFlowM3s, formatDimensionless } = useUnits();
  const [mode, setMode] = useState('dp-flow');
  const { type } = node;
  const { set_pressure_pa, backpressure, telemetry, opening_pct } = node.data;

  const currentOpening = telemetry?.opening_pct ?? (opening_pct ?? 100);
  const inPort = telemetry?.inlets?.[0];
  const outPort = telemetry?.outlets?.[0];
  const qOp = Math.abs(inPort?.flow_rate || 0);
  const pIn = inPort?.pressure ?? 101325;
  const pOut = outPort?.pressure ?? 101325;

  const isRegulator = type === 'linear_regulator' || type === 'remote_control_valve';
  const sensedP = telemetry?.sensed_pressure !== undefined ? telemetry.sensed_pressure : (backpressure ? pIn : pOut);

  const setPBar = (set_pressure_pa || 500000) / 100000;
  const sensedPBar = sensedP / 100000;

  const status = useMemo(() => {
    if (!isRegulator) return "ACTIVE";
    const error = Math.abs(sensedPBar - setPBar);
    const isSaturated = (currentOpening >= 99.9 || currentOpening <= 0.15);
    return error < 0.1 ? "REGULATING" : (isSaturated ? "SATURATED" : "ADJUSTING");
  }, [isRegulator, sensedPBar, setPBar, currentOpening]);

  // Valve curves come from the backend (SI: m3/s, Pa), only converted to display units here
  const curves = telemetry?.valve_curves;
  const flowMultiplier = lminToDisplay(1);
  const toFlow = (m3s) => m3s * 60000 * flowMultiplier;
  const toDp = (pa) => Number(diffPaToDisplay(pa).toPrecision(10));

  const dpOpPa = curves?.dp_op_pa ?? null;
  const qFullM3s = curves?.flow_full_open_m3s ?? null;
  const flowing = dpOpPa != null && qFullM3s != null;
  const capacityPct = flowing && qFullM3s > 0 ? (qOp / qFullM3s) * 100 : null;

  // Delta-P vs flow
  const dpData = useMemo(() => {
    if (!curves?.flow_m3s?.length) return null;
    return curves.flow_m3s.map((q, i) => ({
      q: toFlow(q),
      current: toDp(curves.dp_current_pa[i]),
      full: toDp(curves.dp_full_open_pa[i]),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curves, flowMultiplier, diffPaToDisplay]);

  const qMaxDisplay = dpData ? dpData[dpData.length - 1].q : 0;
  const qTicks = useMemo(
    () => (qMaxDisplay > 0 ? niceTicks(qMaxDisplay, 5).filter((t) => t <= qMaxDisplay * (1 + 1e-9)) : undefined),
    [qMaxDisplay]
  );

  // Frame the operating point with headroom; where the valve is shut (no flow) frame the full-open curve.
  // The steeper curve is clipped by the axis so the scale stays readable.
  const dpMax = useMemo(() => {
    if (!dpData) return 1;
    const raw = flowing ? toDp(dpOpPa) * 1.5 : Math.max(...dpData.map((d) => d.full));
    return niceTicks(Math.max(raw, 1e-6), 5).pop() || 1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dpData, flowing, dpOpPa, diffPaToDisplay]);

  const opDp = flowing ? [{ q: toFlow(qOp), dp: toDp(dpOpPa) }] : [];
  const headroom = flowing ? [{ q: toFlow(qOp), dp: toDp(dpOpPa) }, { q: toFlow(qFullM3s), dp: toDp(dpOpPa) }] : [];

  const dpLegend = [
    { value: 'Current opening', type: 'plainline', color: 'var(--color-brand-dark)' },
    { value: 'Full open', type: 'plainline', color: 'var(--color-border-hover)' },
    ...(flowing ? [
      { value: 'Headroom', type: 'plainline', color: 'var(--color-text-secondary)' },
      { value: 'Operating point', type: 'cross', color: 'var(--color-primary)' },
    ] : []),
  ];

  // Flow vs Cv at the operating pressure drop
  const cvMax = curves?.cv_max ?? 0;
  const cvData = useMemo(() => {
    if (!curves?.cv?.length || !curves?.flow_at_dp_op_m3s?.length) return null;
    return curves.cv.map((cv, i) => ({ cv, opening: curves.opening_pct?.[i], q: toFlow(curves.flow_at_dp_op_m3s[i]) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curves, flowMultiplier]);

  const cvAxisMax = cvMax > 0 ? cvMax : (cvData ? cvData[cvData.length - 1].cv : 0);
  const cvTicks = useMemo(
    () => (cvAxisMax > 0 ? niceTicks(cvAxisMax, 5).filter((t) => t <= cvAxisMax * (1 + 1e-9)) : undefined),
    [cvAxisMax]
  );
  const bandCv = (o) => interp(curves?.opening_pct ?? [], curves?.cv ?? [], o);
  const cvLow = bandCv(BAND_LOW);
  const cvHigh = bandCv(BAND_HIGH);

  const qFlowMax = useMemo(() => {
    if (!cvData) return 1;
    return niceTicks(Math.max(...cvData.map((d) => d.q)) * 1.1 || 1, 5).pop() || 1;
  }, [cvData]);

  const opBand = bandOf(currentOpening);
  const cvOp = telemetry?.cv ?? interp(curves?.opening_pct ?? [], curves?.cv ?? [], currentOpening);
  const opCv = flowing && cvOp != null ? [{ cv: cvOp, q: toFlow(qOp) }] : [];

  const cvLegend = [
    { value: 'Flow at operating ΔP', type: 'plainline', color: 'var(--color-brand-dark)' },
    ...(opCv.length ? [{ value: 'Operating point', type: 'cross', color: opBand.mark }] : []),
    ...BANDS.map((b) => ({ value: b.label, type: 'swatch', color: 'var(--color-text-secondary)', fill: b.fill })),
  ];

  const statusBadge = { text: status, kind: (status === 'REGULATING' || status === 'ACTIVE') ? 'success' : 'warning' };

  const flashing = telemetry?.flashing_warning === true;

  const toggle = (
    <SegmentedToggle options={MODES} value={mode} onChange={setMode} ariaLabel="Valve chart" />
  );

  const noFlowReason = 'No flow through the valve, so there is no operating point to plot';
  const emptyText = (mode === 'dp-flow' ? !dpData : !(cvData && flowing))
    && (!telemetry || !curves ? 'Run a simulation to see the valve curves' : noFlowReason);

  return (
    <>
      <ResultSection title="Valve Performance" badge={statusBadge} actions={toggle}>
        {flashing && (
          <ResultCallout tone="warning" title="FLASHING">Downstream pressure is below the vapour pressure, so the liquid flashes to vapour across the valve.</ResultCallout>
        )}
        {mode === 'dp-flow' ? (
          <ResultChart legend={dpLegend} empty={emptyText}>
            <div className="result-chart-fill" data-testid="valve-chart-dp-flow">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 240, height: 160 }}>
                <ComposedChart data={dpData} margin={CHART_MARGIN}>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis dataKey="q" type="number" domain={[0, qMaxDisplay]} ticks={qTicks} tick={CHART_TICK} tickFormatter={formatTick} height={36}
                    label={chartAxisLabel(labels.flow)} />
                  <YAxis type="number" domain={[0, dpMax]} tick={CHART_TICK} tickCount={6} tickFormatter={formatTick} width={CHART_Y_WIDTH} allowDataOverflow
                    label={chartAxisLabel(labels.pressureDiff, true)} />
                  <Line dataKey="full" stroke="var(--color-border-hover)" strokeWidth={1.5} dot={false} name="Full open" legendType="plainline" activeDot={false} isAnimationActive={false} />
                  <Line dataKey="current" stroke="var(--color-brand-dark)" strokeWidth={2.5} dot={false} name="Current opening" legendType="plainline" activeDot={false} isAnimationActive={false} />
                  {flowing && <Line data={headroom} dataKey="dp" stroke="var(--color-text-secondary)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} name="Headroom" legendType="plainline" activeDot={false} isAnimationActive={false} />}
                  {flowing && <Scatter name="Operating point" dataKey="dp" data={opDp} fill="var(--color-primary)" isAnimationActive={false} shape="cross" legendType="cross" />}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </ResultChart>
        ) : (
          <ResultChart legend={emptyText ? undefined : cvLegend} empty={emptyText}>
            <div className="result-chart-fill" data-testid="valve-chart-flow-cv">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 240, height: 160 }}>
                <ComposedChart data={cvData} margin={CHART_MARGIN}>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis xAxisId="cv" dataKey="cv" type="number" domain={[0, cvAxisMax]} ticks={cvTicks} tick={CHART_TICK} tickFormatter={formatTick} height={36}
                    interval={0} label={chartAxisLabel('Cv')} />
                  <XAxis xAxisId="opening" orientation="top" dataKey="opening" type="number" domain={[0, 100]} ticks={OPENING_TICKS} tick={CHART_TICK}
                    tickFormatter={(v) => `${formatTick(v)} %`} height={24} interval={0} />
                  <YAxis type="number" domain={[0, qFlowMax]} tick={CHART_TICK} tickCount={6} tickFormatter={formatTick} width={CHART_Y_WIDTH} allowDataOverflow
                    label={chartAxisLabel(labels.flow, true)} />
                  {cvLow != null && <ReferenceArea xAxisId="cv" x1={0} x2={cvLow} fill={BANDS[0].fill} fillOpacity={1} stroke="none" ifOverflow="hidden" />}
                  {cvLow != null && cvHigh != null && <ReferenceArea xAxisId="cv" x1={cvLow} x2={cvHigh} fill={BANDS[1].fill} fillOpacity={1} stroke="none" ifOverflow="hidden" />}
                  {cvHigh != null && <ReferenceArea xAxisId="cv" x1={cvHigh} x2={cvAxisMax} fill={BANDS[2].fill} fillOpacity={1} stroke="none" ifOverflow="hidden" />}
                  <Line xAxisId="cv" dataKey="q" stroke="var(--color-brand-dark)" strokeWidth={2.5} dot={false} name="Flow at operating ΔP" legendType="plainline" activeDot={false} isAnimationActive={false} />
                  <Line xAxisId="opening" dataKey="q" stroke="none" dot={false} activeDot={false} legendType="none" isAnimationActive={false} tooltipType="none" />
                  {opCv.length > 0 && <Scatter xAxisId="cv" name="Operating point" dataKey="q" data={opCv} fill={opBand.mark} isAnimationActive={false} shape="cross" legendType="cross" />}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </ResultChart>
        )}
      </ResultSection>

      <ResultSection title="Operating Point">
        <ResultTable>
          <ResultRow label="Current Opening" value={formatDimensionless(currentOpening, 'percent')} unit="%" />
          <ResultRow label="Valve ΔP" value={flowing ? formatDiffPressurePa(dpOpPa) : '—'} unit={labels.pressureDiff} />
          <ResultRow label="Max flow, full open" value={flowing ? formatFlowM3s(qFullM3s) : '—'} unit={labels.flow} />
          <ResultRow label="Capacity used" value={capacityPct != null ? formatDimensionless(capacityPct, 'percent') : '—'} unit="%"
            title="Flow now divided by the flow the valve passes fully open at the same ΔP" />
        </ResultTable>
        {capacityPct != null && <ResultMeter value={capacityPct} tone={utilisationTone(capacityPct)} />}
        <ResultTable>
          <ResultRow label="Sensed Pressure" value={formatPressurePa(sensedP)} unit={labels.pressureAbs} />
          {isRegulator && <ResultRow label="Target Setpoint" value={formatPressurePa(set_pressure_pa || 500000)} unit={labels.pressureAbs} />}
        </ResultTable>
      </ResultSection>
    </>
  );
});

export default ValveDetails;
