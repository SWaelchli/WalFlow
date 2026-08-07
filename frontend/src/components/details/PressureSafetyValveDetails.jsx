import React, { memo } from 'react';
import { m3sToLmin } from '../../utils/converters';

const PressureSafetyValveDetails = memo(function PressureSafetyValveDetails({ node, unmitigatedTelemetry }) {
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
  const pUnmitigatedBar = pUnmitigatedIn / 100000;

  const actualFlowLmin = parseFloat(m3sToLmin(Math.abs(currentQ)));

  let statusBg = '#F1F5F9';
  let statusColor = '#64748B';
  let statusText = 'SEALED (CLOSED)';

  if (status === 'cracked') {
    statusBg = '#FEF3C7';
    statusColor = '#D97706';
    statusText = 'CRACKED (RELIEVING)';
  } else if (status === 'overcapacity') {
    statusBg = '#FEE2E2';
    statusColor = '#DC2626';
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
        <div style={{ fontSize: '12px', color: '#395253', fontWeight: '700', borderLeft: '3px solid #FA8507', paddingLeft: '8px' }}>
          Safety Relief Assessment
        </div>
        <span style={{
          fontSize: '9.5px', fontWeight: '800', padding: '2px 8px', borderRadius: '4px',
          background: statusBg, color: statusColor, border: `1px solid ${statusColor}33`
        }}>
          {statusText}
        </span>
      </div>

      {/* Primary Metrics Card */}
      <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '11.5px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#64748B' }}>Action Mode:</span>
          <span style={{ fontWeight: '700', color: '#1C2B2C' }}>{modeLabels[actionMode] || actionMode}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#64748B' }}>Cracking Set Pressure:</span>
          <span style={{ fontWeight: '700', color: '#FA8507' }}>{setPressureBar.toFixed(2)} bar(a)</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#64748B' }}>Rated Capacity (Cv):</span>
          <span style={{ fontWeight: '700', color: '#1C2B2C' }}>{cv.toFixed(2)}</span>
        </div>
        {actionMode === 'pop_action' && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#64748B' }}>Blowdown Reset:</span>
            <span style={{ fontWeight: '700', color: '#1C2B2C' }}>{(setPressureBar * (1 - blowdownPct / 100)).toFixed(2)} bar(a) ({blowdownPct}%)</span>
          </div>
        )}
      </div>

      {/* Telemetry Comparison & Sizing Card */}
      <div style={{ background: '#FFFFFF', padding: '12px', borderRadius: '8px', border: '1px solid #D8E2E1', fontSize: '11.5px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ fontWeight: '700', fontSize: '11px', color: '#395253', borderBottom: '1px solid #EBF0EF', paddingBottom: '4px' }}>
          Operational Telemetry & Failure Baseline
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#587071' }}>Mitigated Line Pressure:</span>
          <span style={{ fontWeight: '700', color: pInBar >= setPressureBar ? '#D97706' : '#166534' }}>
            {pInBar.toFixed(2)} bar(a)
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#587071' }}>Active Relief Flow (Q relief):</span>
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '2px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px' }}>
            <span style={{ color: '#587071' }}>Orifice Capacity Sizing:</span>
            <span style={{ fontWeight: '700', color: capUtil > 100 ? '#DC2626' : (capUtil > 80 ? '#D97706' : '#166534') }}>
              {capUtil.toFixed(1)} %
            </span>
          </div>
          <div style={{ width: '100%', height: '6px', background: '#E2E8F0', borderRadius: '3px', overflow: 'hidden' }}>
            <div
              style={{
                width: `${Math.min(100, capUtil)}%`,
                height: '100%',
                background: capUtil > 100 ? '#DC2626' : (capUtil > 80 ? '#D97706' : '#166534'),
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
