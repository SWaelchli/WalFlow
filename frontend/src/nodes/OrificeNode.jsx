import { Handle, Position } from 'reactflow';
import { paToBar, m3sToLmin } from '../utils/converters';

export default function OrificeNode({ data }) {
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
        
        <Handle type="target" position={Position.Left} id="inlet-0" style={{ background: '#0f172a', width: '8px', height: '8px' }} />
        <Handle type="source" position={Position.Right} id="outlet-0" style={{ background: '#0f172a', width: '8px', height: '8px' }} />
      </div>
    </div>
  );
}