import { Handle, Position } from 'reactflow';
import { paToBar } from '../utils/converters';

/**
 * Strainer (ISA style)
 * A rectangle with a diagonal line.
 */
export default function FilterNode({ data }) {
  const telemetry = data.telemetry;
  const pIn = telemetry?.inlets?.[0]?.pressure || 0;
  const pOut = telemetry?.outlets?.[0]?.pressure || 0;
  const dP = pIn - pOut;

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ width: 60, height: 40, background: 'transparent', position: 'relative' }}>
        <svg width="60" height="40" viewBox="0 0 60 40">
          {/* Rectangular Strainer Body - x=5 to x=55 */}
          <rect x="5" y="5" width="50" height="30" fill="white" stroke="#334155" strokeWidth="2.5" />
          {/* Diagonal Line */}
          <line x1="5" y1="35" x2="55" y2="5" stroke="#334155" strokeWidth="2.5" />
        </svg>

        {/* Inlet - Far Left at x=5 */}
        <Handle 
          type="target" 
          position={Position.Left} 
          id="inlet-0" 
          style={{ top: '20px', left: '5px', background: '#3b82f6', width: '8px', height: '8px' }} 
        />
        
        {/* Outlet - Far Right at x=55 */}
        <Handle 
          type="source" 
          position={Position.Right} 
          id="outlet-0" 
          style={{ top: '20px', right: '5px', background: '#ef4444', width: '8px', height: '8px' }} 
        />
      </div>

      <div style={{ textAlign: 'center', marginTop: '2px' }}>
        <div style={{ fontSize: '9px', color: '#334155', fontWeight: 'bold' }}>
          {data.label || 'STRAINER'}
        </div>

        {/* Telemetry below Name Tag */}
        <div style={{ marginTop: '2px' }}>
          <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#ef4444' }}> 
            -{paToBar(dP)} bar
          </div>
        </div>
      </div>
    </div>
  );
}
