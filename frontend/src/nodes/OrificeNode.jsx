import { Handle, Position } from 'reactflow';
import { paToBar } from '../utils/converters';

/**
 * Orifice Plate (ISA / PFD style)
 * A restriction in the line, typically represented by a narrow gap or perpendicular lines.
 */
export default function OrificeNode({ data }) {
  const telemetry = data.telemetry;
  const pIn = telemetry?.inlets?.[0]?.pressure || 0;
  const pOut = telemetry?.outlets?.[0]?.pressure || 0;
  const dP = pIn - pOut;

  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        position: 'absolute', top: -35, left: '50%', transform: 'translateX(-50%)',
        textAlign: 'center', width: '80px', pointerEvents: 'none'
      }}>
        <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#ef4444' }}> 
          -{paToBar(dP)} bar
        </div>
      </div>

      <div style={{ width: 40, height: 60, background: 'transparent', position: 'relative' }}>
        <svg width="40" height="60" viewBox="0 0 40 60">
          {/* Orifice Plate Marking */}
          <line x1="20" y1="10" x2="20" y2="25" stroke="#334155" strokeWidth="2.5" />
          <line x1="20" y1="35" x2="20" y2="50" stroke="#334155" strokeWidth="2.5" />
          {/* Horizontal line representing the pipe section */}
          <line x1="0" y1="30" x2="40" y2="30" stroke="#334155" strokeWidth="1.5" strokeDasharray="4,4" />
        </svg>

        {/* Inlet - Middle Left */}
        <Handle 
          type="target" 
          position={Position.Left} 
          id="inlet-0" 
          style={{ background: '#3b82f6', width: '8px', height: '8px' }} 
        />
        
        {/* Outlet - Middle Right */}
        <Handle 
          type="source" 
          position={Position.Right} 
          id="outlet-0" 
          style={{ background: '#ef4444', width: '8px', height: '8px' }} 
        />
      </div>
      <div style={{ fontSize: '9px', textAlign: 'center', marginTop: '2px', color: '#334155', fontWeight: 'bold' }}>
        {data.label || 'ORIFICE'}
      </div>
    </div>
  );
}
