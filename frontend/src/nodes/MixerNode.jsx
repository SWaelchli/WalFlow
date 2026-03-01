import { Handle, Position } from 'reactflow';

/**
 * Mixer (ISA / PFD style)
 * Convergence point for multiple streams.
 */
export default function MixerNode({ data }) {
  const telemetry = data.telemetry;
  const qOut = telemetry?.outlets?.[0]?.flow_rate || 0;
  const qLmin = (qOut * 60000).toFixed(1);

  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        position: 'absolute', top: -35, left: '50%', transform: 'translateX(-50%)',
        textAlign: 'center', width: '80px', pointerEvents: 'none'
      }}>
        <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#0369a1' }}> 
          {qLmin} L/min
        </div>
      </div>

      <div style={{ width: 40, height: 40, background: 'transparent', position: 'relative' }}>
        <svg width="40" height="40" viewBox="0 0 40 40">
          {/* Circular junction point */}
          <circle cx="20" cy="20" r="15" fill="white" stroke="#334155" strokeWidth="2.5" />
          {/* Flow arrows/lines showing convergence */}
          <path d="M 5 10 L 15 15" stroke="#334155" strokeWidth="1.5" />
          <path d="M 5 30 L 15 25" stroke="#334155" strokeWidth="1.5" />
          <path d="M 25 20 L 35 20" stroke="#334155" strokeWidth="1.5" />
        </svg>

        {/* Inlets */}
        <Handle 
          type="target" 
          position={Position.Left} 
          id="inlet-0" 
          style={{ top: '10px', background: '#3b82f6', width: '8px', height: '8px' }} 
        />
        <Handle 
          type="target" 
          position={Position.Left} 
          id="inlet-1" 
          style={{ top: '30px', background: '#3b82f6', width: '8px', height: '8px' }} 
        />
        
        {/* Outlet */}
        <Handle 
          type="source" 
          position={Position.Right} 
          id="outlet-0" 
          style={{ top: '20px', background: '#ef4444', width: '8px', height: '8px' }} 
        />
      </div>
      <div style={{ fontSize: '9px', textAlign: 'center', marginTop: '2px', color: '#334155', fontWeight: 'bold' }}>
        {data.label || 'MIXER'}
      </div>
    </div>
  );
}
