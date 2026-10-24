import React, { memo } from 'react';
import { useUnits } from '../../context/UnitContext';

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
  closed: { text: 'CLOSED', bg: 'var(--color-bg-canvas)', color: 'var(--color-text-secondary)' },
  modulating: { text: 'MODULATING', bg: '#FEF3C7', color: 'var(--color-warning-text-strong)' },
  open: { text: 'OPEN (FULL LIFT)', bg: '#FEF3C7', color: 'var(--color-warning-text-strong)' },
  cycling: { text: 'CYCLING (OVERSIZED)', bg: '#FEF3C7', color: 'var(--color-warning-text-strong)' },
  overcapacity: { text: 'OVERCAPACITY (UNDERSIZED)', bg: '#FEE2E2', color: 'var(--color-danger-text)' }
};

const card = { background: 'var(--color-surface)', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontSize: 'var(--fs-sm)', display: 'flex', flexDirection: 'column', gap: '6px' };
const cardTitle = { fontWeight: '800', fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', borderBottom: '1px solid var(--color-border)', paddingBottom: '4px', marginBottom: '2px' };
const rowStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' };
const labelStyle = { color: 'var(--color-text-secondary)', fontWeight: '500' };
const valueStyle = { fontWeight: '700', color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)', textAlign: 'right' };

function Row({ label, children, color }) {
  return (
    <div style={rowStyle}>
      <span style={labelStyle}>{label}</span>
      <span style={color ? { ...valueStyle, color } : valueStyle}>{children}</span>
    </div>
  );
}

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
      style={{ position: 'relative', height: '40px', margin: '4px 6px 2px' }}
    >
      <div style={{ position: 'absolute', top: '10px', left: 0, right: 0, height: '6px', borderRadius: '3px', background: 'var(--color-border)' }} />
      {/* Relief zone: opening to +10 % overpressure */}
      <div style={{ position: 'absolute', top: '10px', height: '6px', left: pos(openBarg), width: `calc(${pos(fullLiftBarg)} - ${pos(openBarg)})`, background: 'rgba(245, 158, 11, 0.35)' }} />
      {band && (
        <div style={{ position: 'absolute', top: '7px', height: '12px', left: pos(cycleLow), width: `calc(${pos(cycleHigh)} - ${pos(cycleLow)})`, background: 'rgba(250, 133, 7, 0.55)', border: '1px solid var(--color-primary)', borderRadius: '2px' }} />
      )}
      {ticks.map(t => (
        <div key={t.label} style={{ position: 'absolute', left: pos(t.v), top: '4px', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: '1.5px', height: '18px', background: 'var(--color-text-secondary)' }} />
          <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>{t.label}</span>
        </div>
      ))}
      {!band && inletBarg != null && (
        <div title={`Inlet ${formatPressureGauge(inletBarg)}`} style={{ position: 'absolute', left: pos(inletBarg), top: '2px', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '8px solid var(--color-brand-dark)' }} />
      )}
    </div>
  );
}

const PressureSafetyValveDetails = memo(function PressureSafetyValveDetails({ node, unmitigatedTelemetry, allNodes = [] }) {
  const { labels, formatPressureGauge, formatPressurePa, formatFlowM3s, formatFlow } = useUnits();
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
  const pIn = telemetry?.inlets?.[0]?.pressure || 101325;
  // Set pressure is gauge; the atmospheric pressure follows from the solver's set pressure in bar(a)
  const pAtmBar = setPressureBarg !== null && telemetry.set_pressure_bara != null ? telemetry.set_pressure_bara - setPressureBarg : 1.01325;
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
  const capColor = capUtil > 100 ? 'var(--color-danger)' : (capUtil > 80 ? 'var(--color-warning)' : 'var(--color-success)');

  let liftText = '—';
  if (isCycling) liftText = '— (cycling)';
  else if (liftPct != null && status !== 'closed') liftText = liftPct >= 99.9 ? 'Full lift' : `${liftPct.toFixed(0)} %`;
  else if (status === 'closed') liftText = '0 %';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Header Badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
        <div style={{ fontSize: 'var(--fs-xs)', fontWeight: '800', color: 'var(--color-brand-dark)', textTransform: 'uppercase', letterSpacing: '0.05em', borderLeft: '3px solid var(--color-primary)', paddingLeft: '8px' }}>
          Safety Relief Assessment
        </div>
        <span style={{ fontSize: 'var(--fs-xs)', fontWeight: '800', padding: '2px 8px', borderRadius: 'var(--radius-sm)', background: badge.bg, color: badge.color, border: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>
          {badgeText}
        </span>
      </div>

      {/* Configuration */}
      <div style={{ ...card, background: 'var(--color-surface-hover)' }}>
        <div style={cardTitle}>Configuration</div>
        <Row label="Valve type">{VALVE_TYPE_LABELS[valveType] || valveType}</Row>
        {valveType === 'pilot' && (
          <Row label="Pilot senses">{pilotNode ? (pilotNode.data?.label || pilotNode.id) : 'Own inlet'}</Row>
        )}
        <Row label="Action">{MODE_LABELS[actionMode] || actionMode}</Row>
        <Row label="Set pressure" color="var(--color-primary-text)">{setPressureBarg !== null ? formatPressureGauge(setPressureBarg) : 'missing'}</Row>
        {valveType === 'conventional' && cdtpBarg !== null && (
          <Row label="Spring set (CDTP)">{formatPressureGauge(cdtpBarg)}</Row>
        )}
        {openBarg !== null && setPressureBarg !== null && Math.abs(openBarg - setPressureBarg) >= 0.005 && (
          <Row label="Opens at inlet">{formatPressureGauge(openBarg)}</Row>
        )}
        {reseatBarg !== null && (
          <Row label="Reseat at inlet">{formatPressureGauge(reseatBarg)} ({blowdownPct} % blowdown)</Row>
        )}
        <Row label="Flow coefficient (Cv)">{cv.toFixed(2)}</Row>
      </div>

      {/* Relief result */}
      <div style={card}>
        <div style={cardTitle}>Relief Result</div>
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
        {isCycling ? (
          <Row label="Inlet cycles between" color="var(--color-warning-text-strong)">{formatPressureGauge(cycleLow)} – {formatPressureGauge(cycleHigh)}</Row>
        ) : (
          <Row label="Inlet pressure" color={setPressureBarg !== null && inletBarg !== null && inletBarg >= openBarg ? 'var(--color-warning-text-strong)' : undefined}>
            {inletBarg !== null ? formatPressureGauge(inletBarg) : '—'}
          </Row>
        )}
        <Row label={isCycling ? 'Average relief load' : 'Relief flow'} color={currentQ > 1e-6 ? 'var(--color-warning-text-strong)' : undefined}>
          {formatFlowM3s(currentQ)} {labels.flow}
        </Row>
        <Row label="Lift">{liftText}</Row>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '2px' }}>
          <Row label="Capacity used (of rated)" color={capColor}>{capUtil.toFixed(1)} %</Row>
          {ratedFlowLmin > 0 && (
            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)' }}>
              Rated {formatFlow(ratedFlowLmin)} {labels.flow} at full lift, 10 % overpressure
            </div>
          )}
          <div style={{ width: '100%', height: '6px', background: 'var(--color-border)', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, capUtil)}%`, height: '100%', background: capColor, transition: 'width 0.3s ease' }} />
          </div>
        </div>
        <div style={{ ...rowStyle, background: '#FEF2F2', padding: '6px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid #FEE2E2', marginTop: '4px' }}>
          <span style={{ color: 'var(--color-danger-text)', fontWeight: '600' }}>Unmitigated peak pressure</span>
          <span style={{ fontWeight: '800', color: 'var(--color-danger-text)', fontFamily: 'var(--font-mono)' }}>
            {formatPressurePa(pUnmitigatedIn)} {labels.pressureAbs}
          </span>
        </div>
        {isCycling && (
          <div role="status" style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-warning-text-strong)', background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 'var(--radius-sm)', padding: '6px 8px', lineHeight: 1.45 }}>
            Pop valve oversized for this load: the inlet cycles between reseat and set; the flow is the average relief load.
          </div>
        )}
      </div>

      {/* Backpressure */}
      {bp && (
        <div style={card}>
          <div style={cardTitle}>Backpressure</div>
          <Row label="Superimposed">{formatPressureGauge(bp.superimposed_bp_barg)}{setPressureBarg ? ` · ${(100 * bp.superimposed_bp_barg / setPressureBarg).toFixed(1)} %` : ''}</Row>
          <Row label="Built-up">{formatPressureGauge(bp.built_up_bp_barg)}{setPressureBarg ? ` · ${(100 * bp.built_up_bp_barg / setPressureBarg).toFixed(1)} %` : ''}</Row>
          <Row label="Total">{formatPressureGauge(bp.total_bp_barg)}{setPressureBarg ? ` · ${(100 * bp.total_bp_barg / setPressureBarg).toFixed(1)} %` : ''}</Row>
          {bp.bp_limit_pct != null ? (
            <div style={{ ...rowStyle, alignItems: 'center' }}>
              <span style={labelStyle}>Limit ({bp.bp_basis === 'built_up' ? 'built-up' : 'total'} ≤ {bp.bp_limit_pct} % of set)</span>
              <span style={{
                fontSize: 'var(--fs-xs)', fontWeight: '800', padding: '1px 8px', borderRadius: '10px', whiteSpace: 'nowrap',
                background: bp.bp_exceeded ? '#FEF2F2' : 'var(--color-bg-canvas)',
                color: bp.bp_exceeded ? 'var(--color-danger-text)' : 'var(--color-success)',
                border: `1px solid ${bp.bp_exceeded ? '#FEE2E2' : 'var(--color-border)'}`
              }}>
                {bp.bp_exceeded ? `EXCEEDS ${bp.bp_limit_pct} %` : 'OK'}
              </span>
            </div>
          ) : (
            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)' }}>Pilot-operated: opening independent of backpressure.</div>
          )}
          {bp.bp_exceeded && (
            <div role="alert" style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-danger-text)', background: '#FEF2F2', border: '1px solid #FEE2E2', borderRadius: 'var(--radius-sm)', padding: '6px 8px', lineHeight: 1.45 }}>
              {bp.bp_basis === 'built_up'
                ? `Built-up backpressure ${bp.bp_pct_of_set.toFixed(1)} % of set exceeds the 10 % limit of a conventional valve: enlarge the outlet line or use a balanced bellows or pilot valve.`
                : `Total backpressure ${bp.bp_pct_of_set.toFixed(1)} % of set exceeds the 50 % limit of a balanced bellows valve: enlarge the outlet line or use a pilot valve.`}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default PressureSafetyValveDetails;
