import { Handle, Position } from 'reactflow';

/**
 * Shell and Tube Heat Exchanger (ISA / PFD style)
 */
export default function HeatExchangerNode({ data }) {
  const telemetry = data.telemetry;
  const tIn = telemetry?.inlets?.[0]?.temperature || 293.15;
  const tOut = telemetry?.outlets?.[0]?.temperature || 293.15;
  const duty = data.heat_duty_kw || 0;

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ width: 60, height: 60, background: 'transparent', position: 'relative' }}>
        <svg width="60" height="60" viewBox="0 0 60 60">
          {/* Main Circle Body - starts at x=5, ends at x=55 */}
          <circle cx="30" cy="30" r="25" fill="white" stroke="#334155" strokeWidth="2.5" />
          <path d="M 10 30 L 20 20 L 30 40 L 40 20 L 50 30" fill="none" stroke="#334155" strokeWidth="2" />
        </svg>

        {/* Process Inlet - Exactly on left edge at x=5 */}
        <Handle 
          type="target" 
          position={Position.Left} 
          id="inlet-0" 
          style={{ background: '#3b82f6', width: '8px', height: '8px' }} 
        />
        
        {/* Process Outlet - Exactly on right edge at x=55 */}
        <Handle 
          type="source" 
          position={Position.Right} 
          id="outlet-0" 
          style={{ background: '#ef4444', width: '8px', height: '8px' }} 
        />
      </div>

      <div style={{ textAlign: 'center', marginTop: '2px' }}>
        <div style={{ fontSize: '9px', color: '#334155', fontWeight: 'bold' }}>
          {data.label || 'HEAT EXCH'}
        </div>

        {/* Telemetry below Name Tag */}
        <div style={{ marginTop: '2px' }}>
          <div style={{ fontSize: '10px', fontWeight: 'bold', color: duty < 0 ? '#3b82f6' : '#ef4444' }}> 
            {duty} kW
          </div>
          <div style={{ fontSize: '9px', color: '#64748b' }}>
            ΔT: {(tOut - tIn).toFixed(1)} K
          </div>
        </div>
      </div>
    </div>
  );
}
