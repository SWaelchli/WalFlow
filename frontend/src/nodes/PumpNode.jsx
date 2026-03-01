import { Handle, Position } from 'reactflow';
import { paToBar, m3sToLmin } from '../utils/converters';

/**
 * Centrifugal Pump (ISA / PFD style)
 * A circle with a discharge line tangential to the top.
 */
export default function PumpNode({ data }) {
  const telemetry = data.telemetry;
  const pIn = telemetry?.inlets?.[0]?.pressure || 0;
  const pOut = telemetry?.outlets?.[0]?.pressure || 0;
  const q = telemetry?.outlets?.[0]?.flow_rate || 0;
  const dP = pOut - pIn;

  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        position: 'absolute', top: -35, left: '50%', transform: 'translateX(-50%)',
        textAlign: 'center', width: '80px', pointerEvents: 'none'
      }}>
        <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#0369a1' }}> 
          +{paToBar(dP)} bar
        </div>
        <div style={{ fontSize: '9px', color: '#64748b' }}>
          {m3sToLmin(q)} L/min
        </div>
      </div>

      <div style={{ width: 60, height: 60, background: 'transparent', position: 'relative' }}>
        <svg width="60" height="60" viewBox="0 0 60 60">
          {/* Main Circle Body - left edge at 10, right edge at 50 */}
          <circle cx="30" cy="35" r="20" fill="white" stroke="#334155" strokeWidth="2.5" />
          <line x1="30" y1="15" x2="30" y2="55" stroke="#334155" strokeWidth="1" strokeDasharray="2,2" />
          <line x1="10" y1="35" x2="50" y2="35" stroke="#334155" strokeWidth="1" strokeDasharray="2,2" />
          {/* Discharge connection point - ends at 60 */}
          <line x1="30" y1="15" x2="60" y2="15" stroke="#334155" strokeWidth="2.5" />
        </svg>

        {/* Suction (Inlet) - EXACTLY on the left edge of the circle (x=10) */}
        <Handle 
          type="target" 
          position={Position.Left} 
          id="inlet-0" 
          style={{ top: '35px', left: '10px', background: '#3b82f6', width: '8px', height: '8px' }} 
        />

        {/* Discharge (Outlet) - EXACTLY at the end of the discharge line (x=60) */}
        <Handle 
          type="source" 
          position={Position.Right} 
          id="outlet-0" 
          style={{ top: '15px', right: '-4px', background: '#ef4444', width: '8px', height: '8px' }} 
        />
      </div>
      <div style={{ fontSize: '9px', textAlign: 'center', marginTop: '2px', color: '#334155', fontWeight: 'bold' }}>
        {data.label || 'PUMP'}
      </div>
    </div>
  );
}
