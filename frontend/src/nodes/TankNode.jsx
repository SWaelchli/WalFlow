import { Handle, Position } from 'reactflow';

/**
 * Vertical Tank (ISA / PFD style)
 * Domed top and bottom.
 */
export default function TankNode({ data }) {
  const telemetry = data.telemetry;
  const level = data.level || 0;
  const temp = telemetry?.outlets?.[0]?.temperature || data.temperature || 293.15;
  const tempC = (temp - 273.15).toFixed(1);

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ width: 60, height: 100, background: 'transparent', position: 'relative' }}>
        <svg width="60" height="100" viewBox="0 0 60 100">
          {/* Main Body with Dome Top/Bottom - starts at x=10, ends at x=50 */}
          <path 
            d="M 10 20 L 10 80 Q 10 95 30 95 Q 50 95 50 80 L 50 20 Q 50 5 30 5 Q 10 5 10 20 Z" 
            fill="white" 
            stroke="#334155" 
            strokeWidth="2.5" 
          />
          {/* Level Fill */}
          <rect 
            x="10" 
            y={80 - Math.min(60, (level/5)*60)} 
            width="40" 
            height={Math.min(60, (level/5)*60)} 
            fill="#3b82f633" 
          />
        </svg>

        {/* Tank Inlet - Top left at x=10 */}
        <Handle 
          type="target" 
          position={Position.Left} 
          id="inlet-0" 
          style={{ top: '25px', left: '10px', background: '#3b82f6', width: '8px', height: '8px' }} 
        />
        
        {/* Tank Outlet - Bottom Right (side) at x=50, y=80 */}
        <Handle 
          type="source" 
          position={Position.Right} 
          id="outlet-0" 
          style={{ top: '80px', right: '10px', background: '#ef4444', width: '8px', height: '8px' }} 
        />
      </div>

      <div style={{ textAlign: 'center', marginTop: '2px' }}>
        <div style={{ fontSize: '9px', color: '#334155', fontWeight: 'bold' }}>
          {data.label || 'TANK'}
        </div>
        
        {/* Telemetry below Name Tag */}
        <div style={{ marginTop: '2px' }}>
          <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#0369a1' }}> 
            {level.toFixed(2)} m
          </div>
          <div style={{ fontSize: '9px', color: '#64748b' }}>
            {tempC} °C
          </div>
        </div>
      </div>
    </div>
  );
}
