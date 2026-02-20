import { Handle, Position } from 'reactflow';

export default function PumpNode({ data }) {
  return (
    // A classic circular representation for a centrifugal pump
    <div style={{
      width: 70, height: 70, borderRadius: '50%', background: '#fff',
      border: '3px solid #334155', display: 'flex', alignItems: 'center',
      justifyContent: 'center', boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
    }}>
      <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#334155' }}>
        PUMP
      </div>
      
      {/* Inlet (Suction) */}
      <Handle type="target" position={Position.Left} id="inlet" style={{ background: '#334155', width: '10px', height: '10px' }} />
      
      {/* Outlet (Discharge) */}
      <Handle type="source" position={Position.Right} id="outlet" style={{ background: '#334155', width: '10px', height: '10px' }} />
    </div>
  );
}