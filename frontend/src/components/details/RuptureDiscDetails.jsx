import React from 'react';
import { useUnits } from '../../context/UnitContext';
import { ResultSection, ResultTable, ResultRow, ResultMeter } from './ResultBlocks';
import { utilisationTone } from './resultTone';
import LinePressureRows from './LinePressureRows';

const STATUS_BADGES = {
  intact: { text: 'INTACT', kind: 'success' },
  burst: { text: 'BURST', kind: 'danger' },
  overcapacity: { text: 'OVERCAPACITY (>100%)', kind: 'danger' },
};

/**
 * Inspector detail card for Rupture Disc (Burst Diaphragm) equipment nodes.
 */
export default function RuptureDiscDetails({ node, unmitigatedTelemetry }) {
  const { labels, formatGaugeValue, formatPressurePa, formatFlowM3s, formatDiameter, formatDimensionless, atmosphericPa } = useUnits();
  if (!node) return null;

  const data = node.data || {};
  const telemetry = data.telemetry || {};
  const unmitTelemetry = unmitigatedTelemetry?.nodes?.[node.id] || telemetry;

  const burstPressureBarg = data.burst_pressure_barg ? Number(data.burst_pressure_barg) : null;
  const boreType = data.bore_type || 'full_bore';
  const cv = data.cv || 10.0;
  const orificeDiameterM = data.orifice_diameter_m || 0.01;
  const status = telemetry.status || 'intact';
  const capacityPct = telemetry.capacity_utilization_pct || 0.0;

  const pIn = telemetry.inlets?.[0]?.pressure || 0;
  const pInBar = pIn / 100000.0;
  // Gauge line pressure for comparison with the burst pressure; atmosphere from the solver's bar a / bar g pair
  const pAtmBar = burstPressureBarg !== null && telemetry?.set_pressure_bara != null ? telemetry.set_pressure_bara - burstPressureBarg : atmosphericPa / 100000;
  const pInBarg = pInBar - pAtmBar;
  const pUnmitigatedIn = unmitTelemetry.inlets?.[0]?.pressure || pIn;
  const actualFlow = telemetry.outlets?.[0]?.flow_rate || 0;

  const badge = STATUS_BADGES[status] || STATUS_BADGES.intact;

  const boreDisplay = boreType === 'reduced_bore'
    ? `Reduced Bore (${formatDiameter(orificeDiameterM)} ${labels.diameter} Orifice)`
    : `Full Bore (Cv ${formatDimensionless(cv, 'cv')})`;

  return (
    <>
      <ResultSection title="Safety Relief Assessment" badge={badge}>
        <ResultTable>
          <ResultRow label="Burst Pressure" text={burstPressureBarg === null} {...(burstPressureBarg !== null ? { value: formatGaugeValue(burstPressureBarg), unit: labels.pressureGauge } : { value: 'missing' })} />
          <ResultRow label="Bore Configuration" text value={boreDisplay} />
        </ResultTable>
      </ResultSection>

      <ResultSection title="Operational Telemetry & Safety Baseline">
        <ResultTable>
          <LinePressureRows label="Mitigated Line Pressure" pPa={pIn} pBarg={pInBarg} />
          <ResultRow label="Relief Flow (Q relief)" value={formatFlowM3s(Math.abs(actualFlow))} unit={labels.flow} />
          <ResultRow label="Unmitigated Peak Pressure" value={formatPressurePa(pUnmitigatedIn)} unit={labels.pressureAbs} />
          <ResultRow label="Capacity Used (of rated flow at 110 % burst)" value={formatDimensionless(capacityPct, 'percent')} unit="%" />
        </ResultTable>
        <ResultMeter value={capacityPct} tone={utilisationTone(capacityPct)} />
      </ResultSection>
    </>
  );
}
