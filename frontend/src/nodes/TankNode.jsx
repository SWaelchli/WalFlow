import { Handle, Position } from 'reactflow';
import { paToBar, kToC } from '../utils/converters';

export default function TankNode({ data }) {
  const telemetry = data.telemetry;
  const p = telemetry?.outlets?.[0]?.pressure || 0;
  const t = telemetry?.outlets?.[0]?.temperature || 293.15;

  return (
    <div style={{
      width: 100, height: 130, background: '#e0f2fe',
      border: '2px solid #0284c7', borderRadius: '4px',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
    }}>
      {/* Tank Header/Label */}
      <div style={{ 
        background: '#0284c7', color: 'white', textAlign: 'center', 
        padding: '4px', fontSize: '11px', fontWeight: 'bold' 
      }}>
        {data.label}
      </div>
      
      {/* Tank Body (Level and Telemetry) */}
      <div style={{ 
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', 
        justifyContent: 'center', fontSize: '10px', color: '#334155', gap: '4px'
      }}>
        <div style={{ fontWeight: 'bold' }}>{data.level}m</div>
        <div style={{ borderTop: '1px solid #bae6fd', width: '80%', margin: '2px 0' }} />
        <div>{paToBar(p)} bar</div>
        <div style={{ color: '#0369a1' }}>{kToC(t)}°C</div>
      </div>
      
      {/* The Physical Ports - Blue for In, Red for Out */}
      <Handle type="target" position={Position.Left} id="inlet-0" style={{ background: '#3b82f6', width: '8px', height: '8px' }} />
      <Handle type="source" position={Position.Right} id="outlet-0" style={{ background: '#ef4444', width: '8px', height: '8px' }} />
    </div>
  );
}
