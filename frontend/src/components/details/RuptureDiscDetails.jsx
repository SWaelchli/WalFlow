import React from 'react';

/**
 * Inspector detail card for Rupture Disc (Burst Diaphragm) equipment nodes.
 */
export default function RuptureDiscDetails({ node, unmitigatedTelemetry }) {
  if (!node) return null;

  const data = node.data || {};
  const telemetry = data.telemetry || {};
  const unmitTelemetry = unmitigatedTelemetry?.nodes?.[node.id] || telemetry;

  const burstPressureBar = data.burst_pressure_bar || 25.0;
  const boreType = data.bore_type || 'full_bore';
  const cv = data.cv || 10.0;
  const orificeDiameterMm = (data.orifice_diameter ? data.orifice_diameter * 1000 : 10.0).toFixed(1);
  const status = telemetry.status || 'intact';
  const capacityPct = telemetry.capacity_utilization_pct || 0.0;

  const pInBar = (telemetry.inlets?.[0]?.pressure || 0) / 100000.0;
  const pUnmitigatedBar = (unmitTelemetry.inlets?.[0]?.pressure || telemetry.inlets?.[0]?.pressure || 0) / 100000.0;
  const actualFlow = telemetry.outlets?.[0]?.flow_rate || 0;
  const actualFlowLmin = Math.abs(actualFlow) * 60000.0;

  let statusBadgeColor = '#166534';
  let statusBadgeBg = '#DCFCE7';
  let statusLabel = 'INTACT';

  if (status === 'burst') {
    statusBadgeColor = '#DC2626';
    statusBadgeBg = '#FEE2E2';
    statusLabel = 'BURST';
  } else if (status === 'overcapacity') {
    statusBadgeColor = '#DC2626';
    statusBadgeBg = '#FEE2E2';
    statusLabel = 'OVERCAPACITY (>100%)';
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Diaphragm Status Header */}
      <div style={{ background: '#F8FAFC', padding: '10px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '11.5px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#64748B', fontWeight: '600' }}>Diaphragm Status:</span>
          <span style={{ fontSize: '10.5px', fontWeight: '800', color: statusBadgeColor, backgroundColor: statusBadgeBg, padding: '2px 8px', borderRadius: '4px', border: `1px solid ${statusBadgeColor}33` }}>
            {statusLabel}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#64748B' }}>Burst Pressure:</span>
          <span style={{ fontWeight: '700', color: '#FA8507' }}>{burstPressureBar.toFixed(2)} bar(a)</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#64748B' }}>Bore Configuration:</span>
          <span style={{ fontWeight: '700', color: '#1C2B2C' }}>
            {boreType === 'reduced_bore' ? `Reduced Bore (${orificeDiameterMm} mm Orifice)` : `Full Bore (Cv ${cv.toFixed(1)})`}
          </span>
        </div>
      </div>

      {/* Telemetry & Sizing Card */}
      <div style={{ background: '#FFFFFF', padding: '12px', borderRadius: '8px', border: '1px solid #D8E2E1', fontSize: '11.5px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ fontWeight: '700', fontSize: '11px', color: '#395253', borderBottom: '1px solid #EBF0EF', paddingBottom: '4px' }}>
          Operational Telemetry & Safety Baseline
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#587071' }}>Mitigated Line Pressure:</span>
          <span style={{ fontWeight: '700', color: pInBar >= burstPressureBar ? '#D97706' : '#166534' }}>
            {pInBar.toFixed(2)} bar(a)
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#587071' }}>Relief Flow (Q relief):</span>
          <span style={{ fontWeight: '700', color: actualFlowLmin > 0 ? '#D97706' : '#64748B' }}>
            {actualFlowLmin.toFixed(1)} L/min
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#FEF2F2', padding: '6px 8px', borderRadius: '6px', border: '1px solid #FEE2E2' }}>
          <span style={{ color: '#991B1B', fontWeight: '600' }}>Unmitigated Peak Pressure:</span>
          <span style={{ fontWeight: '800', color: '#DC2626' }}>
            {pUnmitigatedBar.toFixed(2)} bar(a)
          </span>
        </div>

        {/* Orifice / Seat Capacity Utilization Bar */}
        <div style={{ marginTop: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', marginBottom: '3px' }}>
            <span style={{ color: '#587071', fontWeight: '600' }}>Discharge Capacity Utilization:</span>
            <span style={{ fontWeight: '700', color: capacityPct > 100 ? '#DC2626' : (capacityPct > 80 ? '#D97706' : '#166534') }}>
              {capacityPct.toFixed(1)}%
            </span>
          </div>
          <div style={{ width: '100%', height: '8px', backgroundColor: '#E2E8F0', borderRadius: '4px', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${Math.min(100, capacityPct)}%`,
                backgroundColor: capacityPct > 100 ? '#DC2626' : (capacityPct > 80 ? '#D97706' : '#166534'),
                transition: 'width 0.3s ease'
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
