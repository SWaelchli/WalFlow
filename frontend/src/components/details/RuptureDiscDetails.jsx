import React from 'react';
import { useUnits } from '../../context/UnitContext';

/**
 * Inspector detail card for Rupture Disc (Burst Diaphragm) equipment nodes.
 */
export default function RuptureDiscDetails({ node, unmitigatedTelemetry }) {
  const { labels, formatPressure, formatPressurePa, formatFlowM3s, formatDiameter } = useUnits();
  if (!node) return null;

  const data = node.data || {};
  const telemetry = data.telemetry || {};
  const unmitTelemetry = unmitigatedTelemetry?.nodes?.[node.id] || telemetry;

  const burstPressureBar = data.burst_pressure_bar || 25.0;
  const boreType = data.bore_type || 'full_bore';
  const cv = data.cv || 10.0;
  const orificeDiameterM = data.orifice_diameter || 0.01;
  const status = telemetry.status || 'intact';
  const capacityPct = telemetry.capacity_utilization_pct || 0.0;

  const pIn = telemetry.inlets?.[0]?.pressure || 0;
  const pInBar = pIn / 100000.0;
  const pUnmitigatedIn = unmitTelemetry.inlets?.[0]?.pressure || pIn;
  const actualFlow = telemetry.outlets?.[0]?.flow_rate || 0;

  let statusBadgeColor = 'var(--color-success)';
  let statusBadgeBg = '#DCFCE7';
  let statusLabel = 'INTACT';

  if (status === 'burst') {
    statusBadgeColor = 'var(--color-danger)';
    statusBadgeBg = '#FEE2E2';
    statusLabel = 'BURST';
  } else if (status === 'overcapacity') {
    statusBadgeColor = 'var(--color-danger)';
    statusBadgeBg = '#FEE2E2';
    statusLabel = 'OVERCAPACITY (>100%)';
  }

  const boreDisplay = boreType === 'reduced_bore' 
    ? `Reduced Bore (${formatDiameter(orificeDiameterM)} ${labels.diameter} Orifice)`
    : `Full Bore (Cv ${cv.toFixed(1)})`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Diaphragm Status Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '11px', fontWeight: '800', color: 'var(--color-brand-dark)', textTransform: 'uppercase', letterSpacing: '0.05em', borderLeft: '3px solid var(--color-primary)', paddingLeft: '8px' }}>
          Safety Relief Assessment
        </div>
        <span style={{ fontSize: '9.5px', fontWeight: '800', color: statusBadgeColor, backgroundColor: statusBadgeBg, padding: '2px 8px', borderRadius: 'var(--radius-sm)', border: `1px solid var(--color-border)` }}>
          {statusLabel}
        </span>
      </div>

      <div style={{ background: 'var(--color-surface-hover)', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontSize: '11.5px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--color-text-secondary)', fontWeight: '500' }}>Burst Pressure:</span>
          <span style={{ fontWeight: '700', color: 'var(--color-primary)', fontFamily: 'var(--font-mono)' }}>{formatPressure(burstPressureBar)} {labels.pressureAbs}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--color-text-secondary)', fontWeight: '500' }}>Bore Configuration:</span>
          <span style={{ fontWeight: '700', color: 'var(--color-text-primary)' }}>
            {boreDisplay}
          </span>
        </div>
      </div>

      {/* Telemetry & Sizing Card */}
      <div style={{ background: 'var(--color-surface)', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontSize: '11.5px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ fontWeight: '800', fontSize: '10.5px', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--color-border)', paddingBottom: '4px' }}>
          Operational Telemetry & Safety Baseline
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--color-text-secondary)', fontWeight: '500' }}>Mitigated Line Pressure:</span>
          <span style={{ fontWeight: '700', color: pInBar >= burstPressureBar ? 'var(--color-warning)' : 'var(--color-success)', fontFamily: 'var(--font-mono)' }}>
            {formatPressurePa(pIn)} {labels.pressureAbs}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--color-text-secondary)', fontWeight: '500' }}>Relief Flow (Q relief):</span>
          <span style={{ fontWeight: '700', color: Math.abs(actualFlow) > 1e-6 ? 'var(--color-warning)' : 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
            {formatFlowM3s(Math.abs(actualFlow))} {labels.flow}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#FEF2F2', padding: '6px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid #FEE2E2' }}>
          <span style={{ color: 'var(--color-danger)', fontWeight: '600' }}>Unmitigated Peak Pressure:</span>
          <span style={{ fontWeight: '800', color: 'var(--color-danger)', fontFamily: 'var(--font-mono)' }}>
            {formatPressurePa(pUnmitigatedIn)} {labels.pressureAbs}
          </span>
        </div>

        {/* Orifice / Seat Capacity Utilization Bar */}
        <div style={{ marginTop: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', marginBottom: '3px', alignItems: 'center' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontWeight: '500' }}>Discharge Capacity Utilization:</span>
            <span style={{ fontWeight: '700', color: capacityPct > 100 ? 'var(--color-danger)' : (capacityPct > 80 ? 'var(--color-warning)' : 'var(--color-success)'), fontFamily: 'var(--font-mono)' }}>
              {capacityPct.toFixed(1)}%
            </span>
          </div>
          <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--color-border)', borderRadius: '4px', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${Math.min(100, capacityPct)}%`,
                backgroundColor: capacityPct > 100 ? 'var(--color-danger)' : (capacityPct > 80 ? 'var(--color-warning)' : 'var(--color-success)'),
                transition: 'width 0.3s ease'
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
