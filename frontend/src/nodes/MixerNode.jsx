import { Handle, Position } from 'reactflow';

export default function MixerNode({ data }) {
  return (
    <div style={{
      width: 40, height: 40, borderRadius: '50%', background: '#fff',
      border: '2px solid #334155', display: 'flex', alignItems: 'center',
      justifyContent: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
    }}>
      <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#334155' }}>M</div>
      
      {/* 2 or 3 Inlets */}
      <Handle type="target" position={Position.Left} id="inlet-0" style={{ background: '#334155' }} />
      <Handle type="target" position={Position.Top} id="inlet-1" style={{ background: '#334155', top: '10%' }} />
      <Handle type="target" position={Position.Bottom} id="inlet-2" style={{ background: '#334155', top: '90%' }} />
      
      {/* 1 Outlet */}
      <Handle type="source" position={Position.Right} id="outlet-0" style={{ background: '#334155' }} />
    </div>
  );
}
