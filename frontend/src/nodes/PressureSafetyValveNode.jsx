import { Handle, Position } from 'reactflow';
import { useMemo } from 'react';
import { getRotatedPosition } from '../components/canvas/NodeRotationHandle';
import { SensingPin } from '../components/canvas/SensingPin';
import BaseNode from './BaseNode';
import NodeReadout from './NodeReadout';
import { useUnits } from '../context/UnitContext';

/**
 * Pressure Safety Relief Valve (PSV / PRV) Node
 * Represents an ISA standard 90-degree angle relief valve with live relief badging.
 */
export default function PressureSafetyValveNode({ id, data, selected }) {
  const { formatFlowM3s, formatPressureGauge, labels } = useUnits();
  const telemetry = data.telemetry;
  const rotation = data.rotation || 0;
  const sensing = useMemo(() => data.sensing || {}, [data.sensing]);

  const flow = telemetry?.outlets?.[0]?.flow_rate || 0;
  const flowFormatted = formatFlowM3s(Math.abs(flow));
  
  const status = telemetry?.status || 'closed'; // 'closed', 'modulating', 'open', 'cycling', 'overcapacity'
  const setPressureFormatted = data.set_pressure_barg ? formatPressureGauge(Number(data.set_pressure_barg)) : 'missing';
  const valveType = data.valve_type || 'conventional';
  const liftPct = telemetry?.lift_pct;
  const cycleLow = telemetry?.cycle_low_barg;
  const cycleHigh = telemetry?.cycle_high_barg;
  const isCycling = status === 'cycling' && cycleLow != null && cycleHigh != null;

  let statusText = 'CLOSED';
  let statusKind = 'neutral';

  if (status === 'modulating') {
    statusText = liftPct != null ? `MODULATING ${Math.round(liftPct)} %` : 'MODULATING';
    statusKind = 'warning';
  } else if (status === 'open' || status === 'cracked') {
    statusText = 'OPEN';
    statusKind = 'warning';
  } else if (status === 'cycling') {
    // Pop valve oversized for the load: it would cycle between set and reseat pressure
    statusText = 'CYCLING';
    statusKind = 'warning';
  } else if (status === 'overcapacity') {
    statusText = 'OVERCAPACITY';
    statusKind = 'danger';
  }

  return (
    <BaseNode
      id={id}
      data={data}
      selected={selected}
      width={70}
      height={70}
      footer={
        <NodeReadout
          name={data.label || 'PSV'}
          badges={[{ kind: statusKind, label: statusText }]}
          rows={isCycling
            ? [
                { value: `${formatPressureGauge(cycleLow)}–${formatPressureGauge(cycleHigh)}` },
                { label: 'avg', value: flowFormatted, unit: labels.flow },
              ]
            : [
                { label: 'Set:', value: setPressureFormatted },
                { value: flowFormatted, unit: labels.flow },
              ]}
        />
      }
    >
      <svg width="70" height="70" viewBox="0 0 70 70">
        {/* Main Valve Body - Angle Relief Valve Geometry */}
        {/* Inlet Stem (Left) */}
        <line x1="10" y1="35" x2="25" y2="35" stroke="var(--color-brand-dark)" strokeWidth="2.5" strokeLinecap="round" />
        {/* Outlet Stem (Right) */}
        <line x1="45" y1="35" x2="60" y2="35" stroke="var(--color-brand-dark)" strokeWidth="2.5" strokeLinecap="round" />

        {/* Opposite Triangles (Valve Seat) */}
        <polygon points="25,23 25,47 35,35" fill={status !== 'closed' ? 'var(--color-primary)' : 'var(--color-surface)'} stroke="var(--color-brand-dark)" strokeWidth="2" />
        <polygon points="45,23 45,47 35,35" fill={status !== 'closed' ? 'var(--color-primary)' : 'var(--color-surface)'} stroke="var(--color-brand-dark)" strokeWidth="2" />

        {/* Top Bonnet / Spring Box */}
        <line x1="35" y1="35" x2="35" y2="12" stroke="var(--color-brand-dark)" strokeWidth="2" />
        <rect x="29" y="8" width="12" height="10" fill="var(--color-surface-hover)" stroke="var(--color-brand-dark)" strokeWidth="1.8" rx="2" />
        {valveType === 'pilot' ? (
          // Pilot-operated: pilot box marked "P"
          <text x="35" y="16.2" textAnchor="middle" className="symbol-text-meta">P</text>
        ) : (
          <>
            {/* Spring Coil Lines */}
            <line x1="32" y1="11" x2="38" y2="11" stroke="var(--color-brand-dark)" strokeWidth="1.5" />
            <line x1="32" y1="13.5" x2="38" y2="13.5" stroke="var(--color-brand-dark)" strokeWidth="1.5" />
            <line x1="32" y1="16" x2="38" y2="16" stroke="var(--color-brand-dark)" strokeWidth="1.5" />
          </>
        )}
        {valveType === 'balanced_bellows' && (
          // Bellows on the stem
          <polyline points="35,19 31,21 39,24 31,27 39,30 35,32" fill="none" stroke="var(--color-brand-dark)" strokeWidth="1.3" strokeLinejoin="round" />
        )}
      </svg>

      {valveType === 'pilot' && (
        // Pilot sensing connection: a signal line from a sensing pin or tap (none: the pilot senses the inlet)
        <Handle
          type="target"
          position={Position.Top}
          id="signal-in"
          className="handle-signal"
          title="Pilot sensing connection"
          style={{
            top: '5px',
            left: '35px',
            transform: 'translate(-50%, -50%)',
            background: 'var(--color-primary)',
            width: '8px',
            height: '8px',
            border: '1.5px solid var(--color-primary-hover)',
            boxShadow: 'var(--shadow-sm)'
          }}
        />
      )}

      <Handle
        type="target"
        position={getRotatedPosition(Position.Left, rotation)}
        id="inlet-0"
        className="handle-inlet"
        title="Inlet"
        style={{
          top: '35px', left: '10px',
          marginTop: '-5px', marginLeft: '-5px',
          right: 'auto', bottom: 'auto', transform: 'none',
          background: 'var(--color-inlet)', width: '8px', height: '8px'
        }}
      />
      {sensing['inlet-0'] && <SensingPin portId="inlet-0" offset={{ x: -20, y: 5 }} />}

      <Handle
        type="source"
        position={getRotatedPosition(Position.Right, rotation)}
        id="outlet-0"
        className="handle-outlet"
        title="Outlet"
        style={{
          top: '35px', left: '60px',
          marginTop: '-5px', marginLeft: '-5px',
          right: 'auto', bottom: 'auto', transform: 'none',
          background: 'var(--color-outlet)', width: '8px', height: '8px'
        }}
      />
      {sensing['outlet-0'] && <SensingPin portId="outlet-0" offset={{ x: 20, y: 5 }} />}
    </BaseNode>
  );
}
