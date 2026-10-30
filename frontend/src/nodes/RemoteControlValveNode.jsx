import { Handle, Position } from 'reactflow';
import { useMemo } from 'react';
import { getRotatedPosition } from '../components/canvas/NodeRotationHandle';
import { SensingPin } from '../components/canvas/SensingPin';
import BaseNode from './BaseNode';
import NodeReadout from './NodeReadout';
import { useUnits } from '../context/UnitContext';

/**
 * Remote Control Valve (RCV)
 * Similar to Linear Control Valve, but controls to a remote sensing signal.
 */
export default function RemoteControlValveNode({ id, data, selected }) {
  const { formatFlowM3s, formatPressurePa, labels } = useUnits();
  const telemetry = data.telemetry;
  const rotation = data.rotation || 0;
  const sensing = useMemo(() => data.sensing || {}, [data.sensing]);
  const opening = telemetry?.opening_pct ?? (data.opening_pct ?? 50.0);
  const flow = telemetry?.outlets?.[0]?.flow_rate || 0;
  const flowFormatted = formatFlowM3s(flow);
  const setPressureFormatted = formatPressurePa(data.set_pressure_pa || 500000);

  return (
    <BaseNode
      id={id}
      data={data}
      selected={selected}
      width={60}
      height={60}
      footer={
        <NodeReadout
          name={data.label || 'RCV'}
          rows={[
            { value: opening.toFixed(1), unit: '%' },
            { value: flowFormatted, unit: labels.flow },
            { label: 'SET:', value: setPressureFormatted, unit: labels.pressureAbs },
          ]}
        />
      }
    >
      <svg width="60" height="60" viewBox="0 0 60 60">
        <line x1="30" y1="35" x2="30" y2="15" stroke="var(--color-brand-dark)" strokeWidth="1.5" />
        <path d="M 20 15 Q 30 5 40 15 Z" fill="var(--color-warning-bg)" stroke="var(--color-warning-text-strong)" strokeWidth="1.5" />
        <path d="M 10 20 L 30 35 L 10 50 Z" fill="var(--color-surface)" stroke="var(--color-brand-dark)" strokeWidth="2.5" />
        <path d="M 50 20 L 30 35 L 50 50 Z" fill="var(--color-surface)" stroke="var(--color-brand-dark)" strokeWidth="2.5" />
      </svg>

      {/* Remote Signal Input (Orange Handle) */}
      <Handle 
        type="target" 
        position={Position.Top} 
        id="signal-in" 
        className="handle-signal"
        style={{ 
          top: '5px', 
          left: '30px', 
          transform: 'translate(-50%, -50%)',
          background: 'var(--color-primary)', 
          width: '8px', 
          height: '8px',
          border: '1.5px solid var(--color-primary-hover)',
          boxShadow: 'var(--shadow-sm)'
        }} 
      />

      {/* Hydraulic Inlets/Outlets */}
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
          top: '35px', left: '50px', 
          marginTop: '-5px', marginLeft: '-5px',
          right: 'auto', bottom: 'auto', transform: 'none',
          background: 'var(--color-outlet)', width: '8px', height: '8px' 
        }} 
      />
      {sensing['outlet-0'] && <SensingPin portId="outlet-0" offset={{ x: 20, y: 5 }} />}
    </BaseNode>
  );
}
