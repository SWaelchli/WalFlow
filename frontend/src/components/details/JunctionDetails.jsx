import { WarningIcon } from '../symbols/IconLibrary';
import React, { useMemo } from 'react';
import { Sankey, ResponsiveContainer, Tooltip, Layer, Rectangle } from 'recharts';
import { useUnits } from '../../context/UnitContext';

const theme = {
  primary: 'var(--color-primary)',
  slate50: 'var(--color-surface-hover)',
  slate100: 'var(--color-bg-canvas)',
  slate200: 'var(--color-border)',
  slate500: 'var(--color-text-secondary)',
  slate800: 'var(--color-brand-dark)',
  white: 'var(--color-surface)',
  flow: 'var(--color-primary)',
};

/**
 * Custom Node component - Clean bars only (no labels)
 */
const SimpleNode = (props) => {
  const { x, y, width, height, index } = props;
  return (
    <Layer key={`node-${index}`}>
      <Rectangle
        x={x}
        y={y}
        width={width}
        height={height}
        fill={theme.slate800}
        radius={[2, 2, 2, 2]}
      />
    </Layer>
  );
};

function TelemetryList({ title, total, items, formatFlowM3s, formatTemperatureK, labels }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ borderBottom: `1px solid ${theme.slate200}`, paddingBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 'var(--fs-xs)', fontWeight: '800', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</span>
        <span style={{ fontSize: 'var(--fs-sm)', fontWeight: '700', color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>{formatFlowM3s(total)} <span style={{ fontSize: 'var(--fs-xs)', fontWeight: '500' }}>{labels.flow}</span></span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {items.map((item, i) => (
          <div key={i} style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'flex-start', 
            fontSize: 'var(--fs-xs)', 
            background: theme.slate50, 
            padding: '6px 8px', 
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--color-border)',
            gap: '8px'
          }}>
            <span style={{ 
              fontWeight: '600', 
              color: 'var(--color-text-primary)', 
              flex: 1, 
              whiteSpace: 'normal', 
              lineHeight: '1.2',
              wordBreak: 'break-word'
            }}>
              {item.name}
            </span>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontWeight: '700', color: 'var(--color-primary-text)' }}>{formatFlowM3s(item.flow)} <span style={{ fontSize: 'var(--fs-xs)', fontWeight: '500' }}>{labels.flow}</span></div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)' }}>{formatTemperatureK(item.temp)} {labels.temperature}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function JunctionDetails({ node, allNodes, allEdges }) {
  const { labels, lminToDisplay, formatFlow, formatFlowM3s, formatTemperature, formatTemperatureK } = useUnits();
  const { id, type, data } = node;
  const isTCV = type === 'three_way_tcv';

  const flowMultiplier = lminToDisplay(1);

  const { sankeyData, upstream, downstream, totalIn, totalOut, totalMassIn, totalMassOut, qInP1, qInP2 } = useMemo(() => {
    const nodes = [];
    const links = [];
    const up = [];
    const down = [];
    let tIn = 0;
    let tOut = 0;
    let mIn = 0;
    let mOut = 0;
    let inP1 = 0;
    let inP2 = 0;

    allEdges.forEach(edge => {
      const inletData = edge.data?.telemetry?.inlets?.[0];
      const flow = Math.abs(inletData?.flow_rate || 0);
      const density = inletData?.density || 1000.0;
      const massFlow = flow * density;

      if (edge.target === id) {
        const src = allNodes.find(n => n.id === edge.source);
        if (src && flow > 1e-8) {
          const info = { name: src.data?.label || src.type.toUpperCase(), flow, temp: inletData?.temperature || 293.15 };
          up.push(info);
          tIn += flow;
          mIn += massFlow;
          if (edge.targetHandle === 'inlet-0') inP1 += flow;
          if (edge.targetHandle === 'inlet-1') inP2 += flow;
        }
      }
      if (edge.source === id) {
        const tgt = allNodes.find(n => n.id === edge.target);
        if (tgt) {
          const info = { name: tgt.data?.label || tgt.type.toUpperCase(), flow, temp: inletData?.temperature || 293.15 };
          down.push(info);
          tOut += flow;
          mOut += massFlow;
        }
      }
    });

    if (up.length > 0 && down.length > 0) {
      up.forEach(u => nodes.push({ name: u.name }));
      const offset = nodes.length;
      down.forEach(d => nodes.push({ name: d.name }));
      up.forEach((u, uIdx) => {
        down.forEach((d, dIdx) => {
          const fraction = tOut > 0 ? (d.flow / tOut) : (1 / down.length);
          const linkVal = (u.flow * fraction * 60000.0) * flowMultiplier;
          if (linkVal > 0.01) links.push({ source: uIdx, target: offset + dIdx, value: linkVal });
        });
      });
    }

    return {
      sankeyData: { nodes, links },
      upstream: up,
      downstream: down,
      totalIn: tIn,
      totalOut: tOut,
      totalMassIn: mIn,
      totalMassOut: mOut,
      qInP1: inP1,
      qInP2: inP2,
    };
  }, [id, allNodes, allEdges, flowMultiplier]);

  if (sankeyData.links.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-text-secondary)' }}>
        <p style={{ fontSize: 'var(--fs-sm)' }}>No active flow through this junction.</p>
      </div>
    );
  }

  const imbalance = Math.abs(totalIn - totalOut);
  const massImbalance = Math.abs(totalMassIn - totalMassOut);
  const maxMass = Math.max(totalMassIn, totalMassOut, 1e-6);
  // Physical mass conservation: thermal mixing across different temperatures changes fluid density,
  // meaning volume is not conserved even when mass is strictly conserved. We only flag genuine
  // mass conservation errors (> 0.1 g/s and > 0.5% relative mismatch).
  const hasError = massImbalance > 1e-4 && (massImbalance / maxMass) > 0.005;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: 'var(--fs-xs)', fontWeight: '800', color: 'var(--color-brand-dark)', textTransform: 'uppercase', letterSpacing: '0.05em', borderLeft: '3px solid var(--color-primary)', paddingLeft: '8px' }}>
          Flow Balance
        </span>
      </div>

      {/* Reduced height diagram (150px) with no labels */}
      <div style={{ width: '100%', height: '150px', background: theme.slate50, borderRadius: 'var(--radius-sm)', border: `1px solid var(--color-border)` }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 240, height: 160 }}>
          <Sankey
            data={sankeyData}
            node={<SimpleNode />}
            link={{ stroke: theme.flow, strokeOpacity: 0.4, fill: theme.flow, fillOpacity: 0.2 }}
            margin={{ left: 10, right: 10, top: 10, bottom: 10 }}
            nodePadding={20}
          >
            <Tooltip 
              formatter={(value) => [`${formatFlow(value / flowMultiplier)} ${labels.flow}`, 'Flow']}
              contentStyle={{ fontSize: 'var(--fs-xs)', borderRadius: 'var(--radius-sm)', border: `1px solid var(--color-border)` }}
            />
          </Sankey>
        </ResponsiveContainer>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <TelemetryList title="Supply" total={totalIn} items={upstream} formatFlowM3s={formatFlowM3s} formatTemperatureK={formatTemperatureK} labels={labels} />
        <TelemetryList title="Demand" total={totalOut} items={downstream} formatFlowM3s={formatFlowM3s} formatTemperatureK={formatTemperatureK} labels={labels} />
      </div>

      {isTCV && (() => {
        // 3-way TCV mechanical trim opening vs actual hydraulic flow distribution
        const portOpenings = data.telemetry?.port_openings_pct;
        const hotOpening = data.telemetry?.opening_pct ?? 50;
        const openingP1 = portOpenings ? portOpenings[0] : (data.hot_port_idx === 0 ? hotOpening : (100 - hotOpening));
        const openingP2 = portOpenings ? portOpenings[1] : (data.hot_port_idx === 1 ? hotOpening : (100 - hotOpening));
        const roleP1 = data.hot_port_idx === 0 ? 'Hot' : 'Cold';
        const roleP2 = data.hot_port_idx === 1 ? 'Hot' : 'Cold';

        const totalMeasuredIn = (qInP1 + qInP2);
        const flowPctP1 = totalMeasuredIn > 1e-9 ? (qInP1 / totalMeasuredIn) * 100 : 50;
        const flowPctP2 = totalMeasuredIn > 1e-9 ? (qInP2 / totalMeasuredIn) * 100 : 50;

        return (
          <div style={{ 
            background: 'var(--color-surface-hover)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)',
            display: 'flex', flexDirection: 'column', gap: '12px'
          }}>
            <div style={{ fontSize: 'var(--fs-xs)', fontWeight: '800', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mixing Balance</div>
            
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: 'var(--fs-xl)', fontWeight: '800', color: 'var(--color-primary-text)' }}>
                {formatTemperatureK(data.telemetry?.outlets?.[0]?.temperature || 293.15)} {labels.temperature}
              </span>
              <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)' }}>
                Target: {formatTemperature(parseFloat(data.set_temperature_c) || 20.0)} {labels.temperature}
              </span>
            </div>

            {/* Valve Trim Opening (Mechanical Position) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)' }}>
                <span style={{ fontWeight: '600' }}>Valve Opening:</span>
                <span>Port 1: {openingP1.toFixed(0)}% | Port 2: {openingP2.toFixed(0)}%</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'var(--color-border)', borderRadius: '4px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ 
                  position: 'absolute', left: 0, top: 0, height: '100%', 
                  width: `${Math.min(100, Math.max(0, openingP1))}%`, 
                  background: 'var(--color-primary)', transition: 'width 0.3s' 
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)' }}>
                <span>Port 1 ({roleP1})</span>
                <span>Port 2 ({roleP2})</span>
              </div>
            </div>

            {/* Actual Hydraulic Flow Split */}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-xs)', borderTop: '1px solid var(--color-border)', paddingTop: '8px', color: 'var(--color-text-secondary)' }}>
              <span style={{ fontWeight: '600' }}>Flow Split:</span>
              <span>
                Port 1: {flowPctP1.toFixed(0)}% | Port 2: {flowPctP2.toFixed(0)}%
              </span>
            </div>
          </div>
        );
      })()}

      {hasError && (
        <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-danger-text)', background: '#FEF2F2', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid #FEE2E2' }}>
          <WarningIcon size={12} style={{ marginRight: '4px', verticalAlign: '-2px' }} /><strong>Imbalance:</strong> {formatFlowM3s(imbalance)} {labels.flow} difference.
        </div>
      )}
    </div>
  );
}
