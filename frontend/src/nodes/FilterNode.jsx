import { Handle, Position } from 'reactflow';
import { paToBar, m3sToLmin } from '../utils/converters';

export default function FilterNode({ data }) {
  const telemetry = data.telemetry;
  const pIn = telemetry?.inlets?.[0]?.pressure || 0;
  const pOut = telemetry?.outlets?.[0]?.pressure || 0;
  const q = telemetry?.outlets?.[0]?.flow_rate || 0;
  const dP = pIn - pOut;

  return (
    <div style={{ position: 'relative' }}>
      {/* Telemetry Display Above the Node */}
      <div style={{
        position: 'absolute', top: -45, left: '50%', transform: 'translateX(-50%)',
        textAlign: 'center', width: '80px', pointerEvents: 'none'
      }}>
        <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#64748b' }}> 
          {paToBar(dP)} bar
        </div>
        <div style={{ fontSize: '9px', color: '#64748b' }}>
          {m3sToLmin(q)} L/min
        </div>
      </div>

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

        {/* Inlet - Blue */}
        <Handle type="target" position={Position.Left} id="inlet-0" style={{ background: '#3b82f6', width: '8px', height: '8px' }} />

        {/* Outlet - Red */}
        <Handle type="source" position={Position.Right} id="outlet-0" style={{ background: '#ef4444', width: '8px', height: '8px' }} />
      </div>
    </div>
  );
}
