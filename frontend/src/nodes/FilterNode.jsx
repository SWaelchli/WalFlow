import { Handle, Position } from 'reactflow';

export default function FilterNode({ data }) {
  return (
    <div style={{
      width: 60, height: 80, background: '#f8fafc',
      border: '2px solid #64748b', borderRadius: '4px',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', position: 'relative',
      boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
    }}>
      {/* Visual representation of a filter element (the internal line) */}
      <div style={{
        position: 'absolute', top: '50%', left: '10%', right: '10%',
        height: '2px', background: '#94a3b8', borderStyle: 'dashed'
      }} />
      
      <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#475569', zIndex: 1 }}>
        FILTER
      </div>
      
      {/* Inlet */}
      <Handle type="target" position={Position.Left} id="inlet-0" style={{ background: '#64748b' }} />
      
      {/* Outlet */}
      <Handle type="source" position={Position.Right} id="outlet-0" style={{ background: '#64748b' }} />
    </div>
  );
}
