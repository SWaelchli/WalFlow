import { Handle, Position } from 'reactflow';

export default function TankNode({ data }) {
  return (
    // The outer div defines the physical shape and colors of the Tank
    <div style={{
      width: 90, height: 110, background: '#e0f2fe',
      border: '2px solid #0284c7', borderRadius: '4px',
      display: 'flex', flexDirection: 'column', overflow: 'hidden'
    }}>
      {/* Tank Header/Label */}
      <div style={{ 
        background: '#0284c7', color: 'white', textAlign: 'center', 
        padding: '4px', fontSize: '12px', fontWeight: 'bold' 
      }}>
        {data.label}
      </div>
      
      {/* Tank Body (where we can later animate fluid levels) */}
      <div style={{ 
        flex: 1, display: 'flex', alignItems: 'center', 
        justifyContent: 'center', fontSize: '10px', color: '#333' 
      }}>
        Lvl: {data.level}m
      </div>
      
      {/* The Physical Ports */}
      <Handle type="target" position={Position.Left} id="inlet" style={{ background: '#0284c7', width: '8px', height: '8px' }} />
      <Handle type="source" position={Position.Right} id="outlet" style={{ background: '#0284c7', width: '8px', height: '8px' }} />
    </div>
  );
}