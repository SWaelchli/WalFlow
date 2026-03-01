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
        width: 50, height: 40, background: '#fff',
        border: '2px solid #0f172a', display: 'flex', alignItems: 'center',
        justifyContent: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        clipPath: 'polygon(0% 0%, 100% 50%, 0% 100%)', // Triangle symbol pointing right
      }}>
        {/* We need to use a sub-div because the parent is clip-pathed */}
        <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#0f172a', marginLeft: '-15px' }}>MIX</div>
      </div>

      {/* 2 Inlets (Targets) - Blue Handles */}
      <Handle 
        type="target" 
        position={Position.Left} 
        id="inlet-0" 
        style={{ background: '#3b82f6', width: '8px', height: '8px', top: '25%' }} 
      />
      <Handle 
        type="target" 
        position={Position.Left} 
        id="inlet-1" 
        style={{ background: '#3b82f6', width: '8px', height: '8px', top: '75%' }} 
      />
      
      {/* 1 Outlet (Source) - Red Handle */}
      <Handle 
        type="source" 
        position={Position.Right} 
        id="outlet-0" 
        style={{ background: '#ef4444', width: '8px', height: '8px', right: '-4px' }} 
      />
    </div>
  );
}
