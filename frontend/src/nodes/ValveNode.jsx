import { Handle, Position } from 'reactflow';

/**
 * Control Valve (ISA / PFD style)
 * Includes an interactive slider for the opening percentage.
 */
export default function ValveNode({ id, data }) {
  const telemetry = data.telemetry;
  const opening = data.opening ?? 50;
  const flow = telemetry?.outlets?.[0]?.flow_rate || 0;
  const flowLmin = (flow * 60000).toFixed(1);

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ width: 60, height: 60, background: 'transparent', position: 'relative' }}>
        <svg width="60" height="60" viewBox="0 0 60 60">
          <line x1="30" y1="35" x2="30" y2="15" stroke="#334155" strokeWidth="1.5" />
          <path d="M 20 15 Q 30 5 40 15 Z" fill="white" stroke="#334155" strokeWidth="1.5" />
          
          {/* Main Valve Body - starts at x=10, ends at x=50 */}
          <path d="M 10 20 L 30 35 L 10 50 Z" fill="white" stroke="#334155" strokeWidth="2.5" />
          <path d="M 50 20 L 30 35 L 50 50 Z" fill="white" stroke="#334155" strokeWidth="2.5" />
        </svg>

        {/* Inlet - Far Left at x=10 */}
        <Handle 
          type="target" 
          position={Position.Left} 
          id="inlet-0" 
          style={{ top: '35px', left: '10px', background: '#3b82f6', width: '8px', height: '8px' }} 
        />
        
        {/* Outlet - Far Right at x=50 */}
        <Handle 
          type="source" 
          position={Position.Right} 
          id="outlet-0" 
          style={{ top: '35px', right: '10px', background: '#ef4444', width: '8px', height: '8px' }} 
        />
      </div>

      <div style={{ textAlign: 'center', marginTop: '2px' }}>
        {/* Interactive Slider - ABOVE Name Tag */}
        <div className="nodrag" style={{ padding: '2px 0' }}>
          <input 
            type="range" 
            min="0.1" 
            max="100" 
            step="0.1"
            value={opening} 
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (data.onChange) data.onChange(val, id);
            }}
            style={{ width: '60px', cursor: 'pointer', display: 'block', margin: '0 auto' }}
          />
        </div>

        <div style={{ fontSize: '9px', color: '#334155', fontWeight: 'bold' }}>
          {data.label || 'VALVE'}
        </div>

        {/* Telemetry below Name Tag */}
        <div style={{ marginTop: '2px' }}>
          <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#0369a1' }}> 
            {opening.toFixed(1)} %
          </div>
          <div style={{ fontSize: '9px', color: '#64748b' }}>
            {flowLmin} L/min
          </div>
        </div>
      </div>
    </div>
  );
}
