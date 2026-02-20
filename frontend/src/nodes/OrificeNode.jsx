import { Handle, Position } from 'reactflow';

export default function OrificeNode({ data }) {
  return (
    // A square node with a visual representation of a restricted pipe
    <div style={{
      width: 80, height: 60, background: '#fff',
      border: '2px solid #0f172a', borderRadius: '4px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative', boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
    }}>
      {/* Top and Bottom "plate" lines to mimic an orifice restriction */}
      <div style={{ width: '6px', height: '15px', background: '#0f172a', position: 'absolute', top: 0 }}></div>
      <div style={{ width: '6px', height: '15px', background: '#0f172a', position: 'absolute', bottom: 0 }}></div>
      
      <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#0f172a' }}>
        ORIFICE
      </div>
      
      <Handle type="target" position={Position.Left} id="inlet" style={{ background: '#0f172a', width: '8px', height: '8px' }} />
      <Handle type="source" position={Position.Right} id="outlet" style={{ background: '#0f172a', width: '8px', height: '8px' }} />
    </div>
  );
}