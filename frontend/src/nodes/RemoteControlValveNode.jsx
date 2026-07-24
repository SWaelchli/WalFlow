import { Handle, Position } from 'reactflow';
import { useMemo } from 'react';
import { getRotatedPosition } from '../components/canvas/NodeRotationHandle';
import { SensingPin } from '../components/canvas/SensingPin';
import BaseNode from './BaseNode';

/**
 * Remote Control Valve (RCV)
 * Similar to Linear Control Valve, but controls to a remote sensing signal.
 */
export default function RemoteControlValveNode({ id, data, selected }) {
  const telemetry = data.telemetry;
  const rotation = data.rotation || 0;
  const sensing = useMemo(() => data.sensing || {}, [data.sensing]);
  const opening = telemetry?.opening_pct ?? (data.opening ?? 50.0);
  const flow = telemetry?.outlets?.[0]?.flow_rate || 0;
  const flowLmin = (flow * 60000).toFixed(1);

  return (
    <BaseNode
      id={id}
      data={data}
      selected={selected}
      width={60}
      height={60}
      footer={
        <>
          <div style={{ fontSize: '9px', color: '#334155', fontWeight: 'bold' }}>{data.label || 'RCV'}</div>
          <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#0369a1' }}>{opening.toFixed(1)} %</div>
          <div style={{ fontSize: '9px', color: '#64748b' }}>{flowLmin} L/min</div>
          <div style={{ fontSize: '8px', color: '#854d0e', fontWeight: 'bold' }}>SET: {((data.set_pressure || 500000) / 100000).toFixed(1)} bar</div>
        </>
      }
    >
      <svg width="60" height="60" viewBox="0 0 60 60">
        <line x1="30" y1="35" x2="30" y2="15" stroke="#334155" strokeWidth="1.5" />
        <path d="M 20 15 Q 30 5 40 15 Z" fill="#fef08a" stroke="#854d0e" strokeWidth="1.5" />
        <path d="M 10 20 L 30 35 L 10 50 Z" fill="white" stroke="#334155" strokeWidth="2.5" />
        <path d="M 50 20 L 30 35 L 50 50 Z" fill="white" stroke="#334155" strokeWidth="2.5" />
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
          background: '#FA8507', 
          width: '8px', 
          height: '8px',
          border: '1.5px solid #E07600',
          boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
        }} 
      />

      {/* Hydraulic Inlets/Outlets */}
      <Handle 
        type="target" 
        position={getRotatedPosition(Position.Left, rotation)} 
        id="inlet-0" 
        className="handle-inlet"
        style={{ 
          top: '35px', left: '10px', 
          marginTop: '-4px', marginLeft: '-4px',
          right: 'auto', bottom: 'auto', transform: 'none',
          background: '#0284C7', width: '8px', height: '8px' 
        }} 
      />
      {sensing['inlet-0'] && <SensingPin portId="inlet-0" offset={{ x: -20, y: 5 }} />}

      <Handle 
        type="source" 
        position={getRotatedPosition(Position.Right, rotation)} 
        id="outlet-0" 
        className="handle-outlet"
        style={{ 
          top: '35px', left: '50px', 
          marginTop: '-4px', marginLeft: '-4px',
          right: 'auto', bottom: 'auto', transform: 'none',
          background: '#E11D48', width: '8px', height: '8px' 
        }} 
      />
      {sensing['outlet-0'] && <SensingPin portId="outlet-0" offset={{ x: 20, y: 5 }} />}
    </BaseNode>
  );
}
