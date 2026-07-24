import { Handle, Position } from 'reactflow';
import { getRotatedPosition } from '../components/canvas/NodeRotationHandle';
import BaseNode from './BaseNode';

/**
 * Splitter (ISA / PFD style)
 */
export default function SplitterNode({ id, data, selected }) {
  const telemetry = data.telemetry;
  const rotation = data.rotation || 0;
  const flow = telemetry?.inlets?.[0]?.flow_rate || 0;
  const qLmin = (flow * 60000).toFixed(1);

  return (
    <BaseNode
      id={id}
      data={data}
      selected={selected}
      width={40}
      height={40}
      footer={
        <>
          <div style={{ fontSize: '9px', color: '#334155', fontWeight: 'bold' }}>{data.label || 'SPLITTER'}</div>
          <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#0369a1' }}>{qLmin} L/min</div>
        </>
      }
    >
      <svg width="40" height="40" viewBox="0 0 40 40">
        <circle cx="20" cy="20" r="15" fill="white" stroke="#334155" strokeWidth="2.5" />
        <path d="M 5 20 L 15 20" stroke="#334155" strokeWidth="1.5" />
        <path d="M 25 15 L 35 10" stroke="#334155" strokeWidth="1.5" />
        <path d="M 25 25 L 35 30" stroke="#334155" strokeWidth="1.5" />
      </svg>

      <Handle 
        type="target" 
        position={getRotatedPosition(Position.Left, rotation)} 
        id="inlet-0" 
        className="handle-inlet"
        style={{ 
          top: '20px', left: '5px', 
          marginTop: '-4px', marginLeft: '-4px',
          right: 'auto', bottom: 'auto', transform: 'none',
          background: '#0284C7', width: '8px', height: '8px' 
        }} 
      />
      <Handle 
        type="source" 
        position={getRotatedPosition(Position.Right, rotation)} 
        id="outlet-0" 
        className="handle-outlet"
        style={{ 
          top: '10px', left: '35px', 
          marginTop: '-4px', marginLeft: '-4px',
          right: 'auto', bottom: 'auto', transform: 'none',
          background: '#E11D48', width: '8px', height: '8px' 
        }} 
      />
      <Handle 
        type="source" 
        position={getRotatedPosition(Position.Right, rotation)} 
        id="outlet-1" 
        className="handle-outlet"
        style={{ 
          top: '30px', left: '35px', 
          marginTop: '-4px', marginLeft: '-4px',
          right: 'auto', bottom: 'auto', transform: 'none',
          background: '#E11D48', width: '8px', height: '8px' 
        }} 
      />
    </BaseNode>
  );
}
