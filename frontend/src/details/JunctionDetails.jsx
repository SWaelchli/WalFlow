import React, { useMemo } from 'react';
import { Sankey, ResponsiveContainer, Tooltip, Layer, Rectangle } from 'recharts';
import { m3sToLmin } from '../utils/converters';

const theme = {
  primary: '#2563eb',
  slate50: '#f8fafc',
  slate100: '#f1f5f9',
  slate200: '#e2e8f0',
  slate500: '#64748b',
  slate800: '#1e293b',
  white: '#ffffff',
  flow: '#3b82f6',
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

function TelemetryList({ title, total, items }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ borderBottom: `1px solid ${theme.slate200}`, paddingBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: '10px', fontWeight: '800', color: theme.slate500, textTransform: 'uppercase' }}>{title}</span>
        <span style={{ fontSize: '11px', fontWeight: '700', color: theme.slate800 }}>{m3sToLmin(total)} <span style={{ fontSize: '9px', fontWeight: '500' }}>L/min</span></span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {items.map((item, i) => (
          <div key={i} style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'flex-start', 
            fontSize: '10px', 
            background: theme.slate50, 
            padding: '6px 8px', 
            borderRadius: '4px',
            gap: '8px'
          }}>
            <span style={{ 
              fontWeight: '600', 
              color: theme.slate800, 
              flex: 1, 
              whiteSpace: 'normal', 
              lineHeight: '1.2',
              wordBreak: 'break-word'
            }}>
              {item.name}
            </span>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontWeight: '700', color: theme.primary }}>{m3sToLmin(item.flow)} <span style={{ fontSize: '8px', fontWeight: '500' }}>L/min</span></div>
              <div style={{ fontSize: '9px', color: theme.slate500 }}>{(item.temp - 273.15).toFixed(1)}°C</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function JunctionDetails({ node, allNodes, allEdges }) {
  const { id, type, data } = node;

  const { sankeyData, upstream, downstream, totalIn, totalOut } = useMemo(() => {
    const nodes = [];
    const links = [];
    const up = [];
    const down = [];
    let tIn = 0;
    let tOut = 0;

    allEdges.forEach(edge => {
      if (edge.target === id) {
        const src = allNodes.find(n => n.id === edge.source);
        const flow = Math.abs(edge.data?.telemetry?.inlets?.[0]?.flow_rate || 0);
        if (src && flow > 1e-8) {
          const info = { name: src.data?.label || src.type.toUpperCase(), flow, temp: edge.data?.telemetry?.inlets?.[0]?.temperature || 293.15 };
          up.push(info);
          tIn += flow;
        }
      }
      if (edge.source === id) {
        const tgt = allNodes.find(n => n.id === edge.target);
        const flow = Math.abs(edge.data?.telemetry?.inlets?.[0]?.flow_rate || 0);
        if (tgt) {
          const info = { name: tgt.data?.label || tgt.type.toUpperCase(), flow, temp: edge.data?.telemetry?.inlets?.[0]?.temperature || 293.15 };
          down.push(info);
          tOut += flow;
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
          const linkVal = parseFloat(m3sToLmin(u.flow * fraction));
          if (linkVal > 0.01) links.push({ source: uIdx, target: offset + dIdx, value: linkVal });
        });
      });
    }

    return { sankeyData: { nodes, links }, upstream: up, downstream: down, totalIn: tIn, totalOut: tOut };
  }, [id, allNodes, allEdges]);

  if (sankeyData.links.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px', color: theme.slate500 }}>
        <p style={{ fontSize: '12px' }}>No active flow through this junction.</p>
      </div>
    );
  }

  const imbalance = Math.abs(totalIn - totalOut);
  const hasError = imbalance > 1e-7;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '12px', color: '#0f172a', fontWeight: 'bold', borderLeft: '3px solid #3b82f6', paddingLeft: '8px' }}>
          Flow Balance
        </span>
      </div>

      {/* Reduced height diagram (150px) with no labels */}
      <div style={{ width: '100%', height: '150px', background: theme.slate50, borderRadius: '8px', border: `1px solid ${theme.slate200}` }}>
        <ResponsiveContainer width="100%" height="100%">
          <Sankey
            data={sankeyData}
            node={<SimpleNode />}
            link={{ stroke: theme.flow, strokeOpacity: 0.4, fill: theme.flow, fillOpacity: 0.2 }}
            margin={{ left: 10, right: 10, top: 10, bottom: 10 }}
            nodePadding={20}
          >
            <Tooltip 
              formatter={(value) => [`${value.toFixed(1)} L/min`, 'Flow']}
              contentStyle={{ fontSize: '11px', borderRadius: '8px', border: `1px solid ${theme.slate200}` }}
            />
          </Sankey>
        </ResponsiveContainer>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <TelemetryList title="Supply" total={totalIn} items={upstream} />
        <TelemetryList title="Demand" total={totalOut} items={downstream} />
      </div>

      {hasError && (
        <div style={{ fontSize: '10px', color: '#991b1b', background: '#fef2f2', padding: '10px', borderRadius: '6px', border: '1px solid #fecaca' }}>
          ⚠️ <strong>Imbalance:</strong> {m3sToLmin(imbalance)} L/min difference.
        </div>
      )}
    </div>
  );
}
