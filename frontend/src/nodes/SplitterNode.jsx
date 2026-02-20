import { Handle, Position } from 'reactflow';

export default function SplitterNode({ data }) {
  return (
    <div style={{
      width: 40, height: 40, borderRadius: '50%', background: '#fff',
      border: '2px solid #334155', display: 'flex', alignItems: 'center',
      justifyContent: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
    }}>
      <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#334155' }}>T</div>
      
      {/* 1 Inlet */}
      <Handle type="target" position={Position.Left} id="inlet-0" style={{ background: '#334155' }} />
      
      {/* 2 Outlets */}
      <Handle type="source" position={Position.Top} id="outlet-0" style={{ background: '#334155', top: '10%' }} />
      <Handle type="source" position={Position.Right} id="outlet-1" style={{ background: '#334155' }} />
      <Handle type="source" position={Position.Bottom} id="outlet-2" style={{ background: '#334155', top: '90%' }} />
    </div>
  );
}
