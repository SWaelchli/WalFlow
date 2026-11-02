import React, { memo } from 'react';
import { useUnits } from '../../context/UnitContext';
import { ResultSection, ResultTable, ResultRow, ResultCallout, ResultMeter } from './ResultBlocks';
import LinePressureRows from './LinePressureRows';
import { utilisationTone } from './resultTone';

const VALVE_TYPE_LABELS = {
  conventional: 'Conventional (spring)',
  balanced_bellows: 'Balanced bellows',
  pilot: 'Pilot-operated'
};

const MODE_LABELS = {
  pop_action: 'Pop action – reseats',
  pop_latching: 'Pop action – latching',
  modulating: 'Modulating'
};

// Status text first, colour second
const STATUS_BADGES = {
  closed: { text: 'CLOSED', kind: 'neutral' },
  modulating: { text: 'MODULATING', kind: 'warning' },
  open: { text: 'OPEN (FULL LIFT)', kind: 'warning' },
  cycling: { text: 'CYCLING (OVERSIZED)', kind: 'warning' },
  overcapacity: { text: 'OVERCAPACITY (UNDERSIZED)', kind: 'danger' }
};

/**
 * Inlet pressure against the valve's characteristic pressures: ticks at reseat, opening and +10 % overpressure,
 * the inlet as a marker, or the reseat → opening band of a cycling valve. The opening inlet pressure differs
 * from the set pressure where backpressure or a remote pilot shifts it.
 */
function PressureScale({ setBarg, openBarg, reseatBarg, inletBarg, cycleLow, cycleHigh, formatPressureGauge }) {
  const fullLiftBarg = openBarg + setBarg * 0.1;
  const ticks = [
    reseatBarg != null && { v: reseatBarg, label: 'Reseat' },
    { v: openBarg, label: Math.abs(openBarg - setBarg) < 0.005 ? 'Set' : 'Opens' },
    { v: fullLiftBarg, label: '+10 %' }
  ].filter(Boolean);
  const values = [...ticks.map(t => t.v), inletBarg, cycleLow, cycleHigh].filter(v => v != null && !isNaN(v));
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = Math.max((hi - lo) * 0.08, setBarg * 0.02);
  const min = lo - pad;
  const span = hi + pad - min;
  const pos = (v) => `${((v - min) / span) * 100}%`;
  const band = cycleLow != null && cycleHigh != null;

  return (
    <div
      role="img"
      aria-label={band
        ? `Inlet cycles between ${formatPressureGauge(cycleLow)} and ${formatPressureGauge(cycleHigh)}`
        : `Inlet ${formatPressureGauge(inletBarg)}, opens at ${formatPressureGauge(openBarg)}`}
      className="result-scale"
    >
      <div className="result-scale-track" />
      {/* Relief zone: opening to +10 % overpressure */}
      <div className="result-scale-relief" style={{ left: pos(openBarg), width: `calc(${pos(fullLiftBarg)} - ${pos(openBarg)})` }} />
      {band && (
        <div className="result-scale-band" style={{ left: pos(cycleLow), width: `calc(${pos(cycleHigh)} - ${pos(cycleLow)})` }} />
      )}
      {ticks.map(t => (
        <div key={t.label} className="result-scale-tick" style={{ left: pos(t.v) }}>
          <div className="result-scale-tick-line" />
          <span className="result-scale-tick-label">{t.label}</span>
        </div>
      ))}
      {!band && inletBarg != null && (
        <div title={`Inlet ${formatPressureGauge(inletBarg)}`} className="result-scale-marker" style={{ left: pos(inletBarg) }} />
      )}
    </div>
  );
}

const PressureSafetyValveDetails = memo(function PressureSafetyValveDetails({ node, unmitigatedTelemetry, allNodes = [] }) {
  const { labels, formatPressureGauge, formatGaugeValue, formatPressurePa, formatFlowM3s, formatFlow, formatDimensionless, atmosphericPa } = useUnits();
  const data = node.data || {};
  const telemetry = data.telemetry || {};

  const setPressureBarg = data.set_pressure_barg ? parseFloat(data.set_pressure_barg) : null;
  const actionMode = data.action_mode || 'pop_action';
  const valveType = data.valve_type || 'conventional';
  const cv = parseFloat(data.cv || 10.0);
  const blowdownPct = parseFloat(data.blowdown_pct ?? 7.0);
  const cdtpBarg = telemetry.cdtp_barg ?? (setPressureBarg !== null ? Math.max(0.01, setPressureBarg - Number(data.design_superimposed_bp_barg || 0)) : null);

  const hasResult = telemetry.inlets?.[0]?.pressure != null;
  const currentQ = Math.abs(telemetry?.outlets?.[0]?.flow_rate || 0);
  const pIn = telemetry?.inlets?.[0]?.pressure || atmosphericPa;
  // Set pressure is gauge; the atmospheric pressure follows from the solver's absolute set pressure (bar a), else the site value
  const pAtmBar = setPressureBarg !== null && telemetry.set_pressure_bara != null ? telemetry.set_pressure_bara - setPressureBarg : atmosphericPa / 100000;
  const inletBarg = hasResult ? pIn / 100000 - pAtmBar : null;
  const ratedFlowLmin = parseFloat(telemetry?.rated_flow_lmin || 0.0);
  const liftPct = telemetry?.lift_pct;
  const cycleLow = telemetry?.cycle_low_barg;
  const cycleHigh = telemetry?.cycle_high_barg;
  // Inlet pressures at which the valve opens and reseats, from the solver (they follow the outlet pressure of a
  // conventional valve and the sensed pressure of a pilot); before a result, the set pressure
  const openBarg = telemetry.opening_pressure_barg ?? setPressureBarg;
  const reseatBarg = actionMode !== 'pop_action' || setPressureBarg === null ? null
    : (telemetry.reseat_pressure_barg ?? setPressureBarg * (1 - blowdownPct / 100));

  const status = telemetry?.status === 'cracked' ? 'open' : (telemetry?.status || 'closed');
  const isCycling = status === 'cycling' && cycleLow != null && cycleHigh != null;
  const capUtil = parseFloat(telemetry?.capacity_utilization_pct || 0.0);
  const badge = STATUS_BADGES[status] || STATUS_BADGES.closed;
  const badgeText = status === 'modulating' && liftPct != null ? `MODULATING ${Math.round(liftPct)} %` : badge.text;

  const unmitigatedNodeTel = unmitigatedTelemetry?.nodes?.[node.id];
  const pUnmitigatedIn = unmitigatedNodeTel?.inlets?.[0]?.pressure || pIn;

  const pilotNode = telemetry.pilot_sensing_node_id ? allNodes.find(n => n.id === telemetry.pilot_sensing_node_id) : null;
  const bp = telemetry.backpressure;

  let liftText = '—';
  if (isCycling) liftText = '— (cycling)';
  else if (liftPct != null && status !== 'closed') liftText = liftPct >= 99.9 ? 'Full lift' : `${formatDimensionless(liftPct, 'percentWhole')} %`;
  else if (status === 'closed') liftText = '0 %';

  const gaugeUnit = labels.pressureGauge;
  const gauge = (barg) => ({ value: formatGaugeValue(barg), unit: gaugeUnit });
  const pctOfSet = (barg) => (setPressureBarg ? { value: formatDimensionless(100 * barg / setPressureBarg, 'percent'), unit: '%' } : null);
  const bpValues = (barg) => [gauge(barg), pctOfSet(barg)].filter(Boolean);

  const bpLimitBarg = bp?.bp_limit_pct != null && setPressureBarg ? setPressureBarg * bp.bp_limit_pct / 100 : null;
  const bpVerdict = bp?.bp_limit_pct != null
    ? { text: bp.bp_exceeded ? `EXCEEDS ${bp.bp_limit_pct} % LIMIT` : 'WITHIN LIMIT', kind: bp.bp_exceeded ? 'danger' : 'success' }
    : undefined;

  return (
    <>
      <ResultSection title="Safety Relief Assessment" badge={{ text: badgeText, kind: badge.kind }}>
        <ResultTable>
          <ResultRow label="Valve type" text value={VALVE_TYPE_LABELS[valveType] || valveType} />
          {valveType === 'pilot' && (
            <ResultRow label="Pilot senses" text value={pilotNode ? (pilotNode.data?.label || pilotNode.id) : 'Own inlet'} />
          )}
          <ResultRow label="Action" text value={MODE_LABELS[actionMode] || actionMode} />
          <ResultRow label="Set pressure" text={setPressureBarg === null} {...(setPressureBarg !== null ? gauge(setPressureBarg) : { value: 'missing' })} />
          {valveType === 'conventional' && cdtpBarg !== null && (
            <ResultRow label="Spring set (CDTP)" {...gauge(cdtpBarg)} />
          )}
          {openBarg !== null && setPressureBarg !== null && Math.abs(openBarg - setPressureBarg) >= 0.005 && (
            <ResultRow label="Opens at inlet" {...gauge(openBarg)} />
          )}
          {reseatBarg !== null && (
            <ResultRow label="Reseat at inlet" value={formatGaugeValue(reseatBarg)} unit={`${gaugeUnit} (${blowdownPct} % blowdown)`} />
          )}
          <ResultRow label="Flow coefficient (Cv)" value={formatDimensionless(cv, 'cv')} />
        </ResultTable>
      </ResultSection>

      <ResultSection title="Relief Result">
        {setPressureBarg !== null && hasResult && (
          <PressureScale
            setBarg={setPressureBarg}
            openBarg={openBarg}
            reseatBarg={reseatBarg}
            inletBarg={inletBarg}
            cycleLow={isCycling ? cycleLow : null}
            cycleHigh={isCycling ? cycleHigh : null}
            formatPressureGauge={formatPressureGauge}
          />
        )}
        <ResultTable>
          {isCycling ? (
            <ResultRow label="Inlet cycles between" value={`${formatGaugeValue(cycleLow)} – ${formatGaugeValue(cycleHigh)}`} unit={gaugeUnit} />
          ) : (
            <LinePressureRows label="Inlet pressure" pPa={hasResult ? pIn : null} pBarg={inletBarg} />
          )}
          <ResultRow label={isCycling ? 'Average relief load' : 'Relief flow'} value={formatFlowM3s(currentQ)} unit={labels.flow} />
          <ResultRow label="Lift" text value={liftText} />
          <ResultRow label="Unmitigated peak pressure" value={formatPressurePa(pUnmitigatedIn)} unit={labels.pressureAbs} />
          <ResultRow label="Capacity used (of rated)" value={formatDimensionless(capUtil, 'percent')} unit="%" />
        </ResultTable>
        <ResultMeter value={capUtil} tone={utilisationTone(capUtil)} />
        {ratedFlowLmin > 0 && (
          <div className="result-caption-sm">
            Rated {formatFlow(ratedFlowLmin)} {labels.flow} at full lift, 10 % overpressure
          </div>
        )}
        {isCycling && (
          <ResultCallout tone="warning" role="status">
            Pop valve oversized for this load: the inlet cycles between reseat and set; the flow is the average relief load.
          </ResultCallout>
        )}
      </ResultSection>

      {bp && (
        <ResultSection title="Backpressure" badge={bpVerdict}>
          <ResultTable columns={setPressureBarg ? ['Pressure', '% of set'] : ['Pressure']}>
            <ResultRow label="Superimposed" values={bpValues(bp.superimposed_bp_barg)} />
            <ResultRow label="Built-up" values={bpValues(bp.built_up_bp_barg)} />
            <ResultRow label="Total" values={bpValues(bp.total_bp_barg)} />
            {bpLimitBarg !== null && (
              <ResultRow
                label={`Limit (${bp.bp_basis === 'built_up' ? 'built-up' : 'total'})`}
                values={[gauge(bpLimitBarg), { value: formatDimensionless(bp.bp_limit_pct, 'percent'), unit: '%' }]}
              />
            )}
          </ResultTable>
          {bp.bp_limit_pct == null && (
            <div className="result-caption-sm">Pilot-operated: opening independent of backpressure.</div>
          )}
          {bp.bp_exceeded && (
            <ResultCallout tone="danger">
              {bp.bp_basis === 'built_up'
                ? `Built-up backpressure ${formatDimensionless(bp.bp_pct_of_set, 'percent')} % of set exceeds the 10 % limit of a conventional valve: enlarge the outlet line or use a balanced bellows or pilot valve.`
                : `Total backpressure ${formatDimensionless(bp.bp_pct_of_set, 'percent')} % of set exceeds the 50 % limit of a balanced bellows valve: enlarge the outlet line or use a pilot valve.`}
            </ResultCallout>
          )}
        </ResultSection>
      )}
    </>
  );
});

export default PressureSafetyValveDetails;
