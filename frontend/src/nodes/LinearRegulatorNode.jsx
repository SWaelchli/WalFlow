import { Handle, Position } from 'reactflow';

/**
 * Pressure Regulator (ISA / PFD style)
 * Maintains a set pressure either upstream or downstream.
 */
export default function LinearRegulatorNode({ id, data }) {
  const telemetry = data.telemetry;
  const opening = data.opening ?? 100;
  const setP = data.set_pressure ?? 500000;
  
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ width: 60, height: 60, background: 'transparent', position: 'relative' }}>
        <svg width="60" height="60" viewBox="0 0 60 60">
          {/* Actuator line and diaphragm */}
          <line x1="30" y1="35" x2="30" y2="15" stroke="#334155" strokeWidth="1.5" />
          <path d="M 15 15 L 45 15" stroke="#334155" strokeWidth="2.5" />
          
          {/* Main Valve Body */}
          <path d="M 10 20 L 30 35 L 10 50 Z" fill="white" stroke="#334155" strokeWidth="2.5" />
          <path d="M 50 20 L 30 35 L 50 50 Z" fill="white" stroke="#334155" strokeWidth="2.5" />
          
          {/* Sensing line indicator */}
          <line x1="15" y1="15" x2="10" y2="20" stroke="#334155" strokeWidth="1" strokeDasharray="2,2" />
        </svg>

        {/* Inlet */}
        <Handle 
          type="target" 
          position={Position.Left} 
          id="inlet-0" 
          style={{ top: '35px', left: '10px', background: '#3b82f6', width: '8px', height: '8px' }} 
        />
        
        {/* Outlet */}
        <Handle 
          type="source" 
          position={Position.Right} 
          id="outlet-0" 
          style={{ top: '35px', right: '10px', background: '#ef4444', width: '8px', height: '8px' }} 
        />
      </div>

      <div style={{ textAlign: 'center', marginTop: '2px' }}>
        <div style={{ fontSize: '9px', color: '#334155', fontWeight: 'bold' }}>
          {data.label || 'REGULATOR'}
        </div>

        {/* Telemetry below Name Tag */}
        <div style={{ marginTop: '2px' }}>
          <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#0369a1' }}> 
            Set: {(setP / 100000).toFixed(1)} bar
          </div>
          <div style={{ fontSize: '9px', color: '#64748b' }}>
            Pos: {opening.toFixed(1)} %
          </div>
        </div>
      </div>
    </div>
  );
}
