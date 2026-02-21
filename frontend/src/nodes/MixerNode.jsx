import { Handle, Position } from 'reactflow';
import { paToBar, m3sToLmin } from '../utils/converters';

export default function MixerNode({ data }) {
  const telemetry = data.telemetry;
  const p = telemetry?.outlets?.[0]?.pressure || 0;
  const q = telemetry?.outlets?.[0]?.flow_rate || 0;

  return (
    <div style={{ position: 'relative' }}>
      {/* Telemetry Display Above the Node */}
      <div style={{
        position: 'absolute', top: -35, left: '50%', transform: 'translateX(-50%)',
        textAlign: 'center', width: '80px', pointerEvents: 'none'
      }}>
        <div style={{ fontSize: '9px', fontWeight: 'bold', color: '#64748b' }}>
          {paToBar(p)} bar
        </div>
        <div style={{ fontSize: '8px', color: '#64748b' }}>
          {m3sToLmin(q)} L/min
        </div>
      </div>

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
    </div>
  );
}
