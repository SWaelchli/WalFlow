import { Handle, Position } from 'reactflow';
import { paToBar, m3sToLmin } from '../utils/converters';

export default function SplitterNode({ data }) {
  const telemetry = data.telemetry;
  const p = telemetry?.inlets?.[0]?.pressure || 0;
  const q = telemetry?.inlets?.[0]?.flow_rate || 0;

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
        clipPath: 'polygon(100% 0%, 0% 50%, 100% 100%)', // Triangle symbol pointing left
      }}>
        <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#0f172a', marginRight: '-15px' }}>SPLIT</div>
      </div>

      {/* 1 Inlet (Target) - Blue Handle */}
      <Handle 
        type="target" 
        position={Position.Left} 
        id="inlet-0" 
        style={{ background: '#3b82f6', width: '8px', height: '8px', left: '-4px' }} 
      />

      {/* 2 Outlets (Sources) - Red Handles */}
      <Handle 
        type="source" 
        position={Position.Right} 
        id="outlet-0" 
        style={{ background: '#ef4444', width: '8px', height: '8px', top: '25%' }} 
      />
      <Handle 
        type="source" 
        position={Position.Right} 
        id="outlet-1" 
        style={{ background: '#ef4444', width: '8px', height: '8px', top: '75%' }} 
      />
    </div>
  );
}
