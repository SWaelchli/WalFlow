import { Handle, Position } from 'reactflow';
import { getRotatedPosition } from '../components/canvas/NodeRotationHandle';
import BaseNode from './BaseNode';

/**
 * Mixer (ISA / PFD style)
 */
export default function MixerNode({ id, data, selected }) {
  const telemetry = data.telemetry;
  const rotation = data.rotation || 0;
  const qOut = telemetry?.outlets?.[0]?.flow_rate || 0;
  const qLmin = (qOut * 60000).toFixed(1);

  return (
    <BaseNode
      id={id}
      data={data}
      selected={selected}
      width={40}
      height={40}
      footer={
        <>
          <div style={{ fontSize: '9px', color: 'var(--color-text-primary)', fontWeight: 'bold' }}>{data.label || 'MIXER'}</div>
          <div style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--color-brand-dark)' }}>{qLmin} L/min</div>
        </>
      }
    >
      <svg width="40" height="40" viewBox="0 0 40 40">
        <circle cx="20" cy="20" r="15" fill="var(--color-surface)" stroke="var(--color-brand-dark)" strokeWidth="2.5" />
        <path d="M 5 10 L 15 15" stroke="var(--color-brand-dark)" strokeWidth="1.5" />
        <path d="M 5 30 L 15 25" stroke="var(--color-brand-dark)" strokeWidth="1.5" />
        <path d="M 25 20 L 35 20" stroke="var(--color-brand-dark)" strokeWidth="1.5" />
      </svg>

      <Handle 
        type="target" 
        position={getRotatedPosition(Position.Left, rotation)} 
        id="inlet-0" 
        className="handle-inlet"
        style={{ 
          top: '10px', left: '5px', 
          marginTop: '-4px', marginLeft: '-4px',
          right: 'auto', bottom: 'auto', transform: 'none',
          background: 'var(--color-inlet)', width: '8px', height: '8px' 
        }} 
      />
      <Handle 
        type="target" 
        position={getRotatedPosition(Position.Left, rotation)} 
        id="inlet-1" 
        className="handle-inlet"
        style={{ 
          top: '30px', left: '5px', 
          marginTop: '-4px', marginLeft: '-4px',
          right: 'auto', bottom: 'auto', transform: 'none',
          background: 'var(--color-inlet)', width: '8px', height: '8px' 
        }} 
      />
      <Handle 
        type="source" 
        position={getRotatedPosition(Position.Right, rotation)} 
        id="outlet-0" 
        className="handle-outlet"
        style={{ 
          top: '20px', left: '35px', 
          marginTop: '-4px', marginLeft: '-4px',
          right: 'auto', bottom: 'auto', transform: 'none',
          background: 'var(--color-outlet)', width: '8px', height: '8px' 
        }} 
      />
    </BaseNode>
  );
}
