import React, { memo } from 'react';
import { useUnits } from '../../context/UnitContext';

const PressureSafetyValveDetails = memo(function PressureSafetyValveDetails({ node, unmitigatedTelemetry }) {
  const { labels, formatPressure, formatPressurePa, formatFlowM3s } = useUnits();
  const data = node.data || {};
  const telemetry = data.telemetry || {};

  const setPressureBar = parseFloat(data.set_pressure_bar || 20.0);
  const actionMode = data.action_mode || 'pop_action';
  const cv = parseFloat(data.cv || 10.0);
  const blowdownPct = parseFloat(data.blowdown_pct || 7.0);

  const currentQ = telemetry?.outlets?.[0]?.flow_rate || 0;
  const pIn = telemetry?.inlets?.[0]?.pressure || 101325;
  const pInBar = pIn / 100000;

  const status = telemetry?.status || 'closed';
  const capUtil = parseFloat(telemetry?.capacity_utilization_pct || 0.0);

  // Unmitigated telemetry for this node (if available)
  const unmitigatedNodeTel = unmitigatedTelemetry?.nodes?.[node.id];
  const pUnmitigatedIn = unmitigatedNodeTel?.inlets?.[0]?.pressure || pIn;

  let statusBg = 'var(--color-bg-canvas)';
  let statusColor = 'var(--color-text-secondary)';
  let statusText = 'SEALED (CLOSED)';

  if (status === 'cracked') {
    statusBg = '#FEF3C7';
    statusColor = 'var(--color-warning)';
    statusText = 'CRACKED (RELIEVING)';
  } else if (status === 'overcapacity') {
    statusBg = '#FEE2E2';
    statusColor = 'var(--color-danger)';
    statusText = 'OVERCAPACITY (UNDERSIZED)';
  }

  const modeLabels = {
    pop_action: 'Pop Action (Snap-Open)',
    modulating: 'Modulating (Proportional)',
    rupture_disc: 'Rupture Disc (Burst Diaphragm)'
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Header Badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '11px', fontWeight: '800', color: 'var(--color-brand-dark)', textTransform: 'uppercase', letterSpacing: '0.05em', borderLeft: '3px solid var(--color-primary)', paddingLeft: '8px' }}>
          Safety Relief Assessment
        </div>
        <span style={{
          fontSize: '9.5px', fontWeight: '800', padding: '2px 8px', borderRadius: 'var(--radius-sm)',
          background: statusBg, color: statusColor, border: `1px solid var(--color-border)`
        }}>
          {statusText}
        </span>
      </div>

      {/* Primary Metrics Card */}
      <div style={{ background: 'var(--color-surface-hover)', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontSize: '11.5px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--color-text-secondary)', fontWeight: '500' }}>Action Mode:</span>
          <span style={{ fontWeight: '700', color: 'var(--color-text-primary)' }}>{modeLabels[actionMode] || actionMode}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--color-text-secondary)', fontWeight: '500' }}>Cracking Set Pressure:</span>
          <span style={{ fontWeight: '700', color: 'var(--color-primary)', fontFamily: 'var(--font-mono)' }}>{formatPressure(setPressureBar)} {labels.pressureAbs}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--color-text-secondary)', fontWeight: '500' }}>Rated Capacity (Cv):</span>
          <span style={{ fontWeight: '700', color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>{cv.toFixed(2)}</span>
        </div>
        {actionMode === 'pop_action' && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontWeight: '500' }}>Blowdown Reset:</span>
            <span style={{ fontWeight: '700', color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>{formatPressure(setPressureBar * (1 - blowdownPct / 100))} {labels.pressureAbs} ({blowdownPct}%)</span>
          </div>
        )}
      </div>

      {/* Telemetry Comparison & Sizing Card */}
      <div style={{ background: 'var(--color-surface)', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontSize: '11.5px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ fontWeight: '800', fontSize: '10.5px', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--color-border)', paddingBottom: '4px' }}>
          Operational Telemetry & Failure Baseline
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--color-text-secondary)', fontWeight: '500' }}>Mitigated Line Pressure:</span>
          <span style={{ fontWeight: '700', color: pInBar >= setPressureBar ? 'var(--color-warning)' : 'var(--color-success)', fontFamily: 'var(--font-mono)' }}>
            {formatPressurePa(pIn)} {labels.pressureAbs}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--color-text-secondary)', fontWeight: '500' }}>Active Relief Flow (Q relief):</span>
          <span style={{ fontWeight: '700', color: Math.abs(currentQ) > 1e-6 ? 'var(--color-warning)' : 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
            {formatFlowM3s(Math.abs(currentQ))} {labels.flow}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#FEF2F2', padding: '6px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid #FEE2E2' }}>
          <span style={{ color: 'var(--color-danger)', fontWeight: '600' }}>Unmitigated Peak Pressure:</span>
          <span style={{ fontWeight: '800', color: 'var(--color-danger)', fontFamily: 'var(--font-mono)' }}>
            {formatPressurePa(pUnmitigatedIn)} {labels.pressureAbs}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '2px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', alignItems: 'center' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontWeight: '500' }}>Orifice Capacity Sizing:</span>
            <span style={{ fontWeight: '700', color: capUtil > 100 ? 'var(--color-danger)' : (capUtil > 80 ? 'var(--color-warning)' : 'var(--color-success)'), fontFamily: 'var(--font-mono)' }}>
              {capUtil.toFixed(1)} %
            </span>
          </div>
          <div style={{ width: '100%', height: '6px', background: 'var(--color-border)', borderRadius: '3px', overflow: 'hidden' }}>
            <div
              style={{
                width: `${Math.min(100, capUtil)}%`,
                height: '100%',
                background: capUtil > 100 ? 'var(--color-danger)' : (capUtil > 80 ? 'var(--color-warning)' : 'var(--color-success)'),
                transition: 'width 0.3s ease'
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
});

export default PressureSafetyValveDetails;
