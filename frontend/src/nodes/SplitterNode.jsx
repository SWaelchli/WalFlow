import { Handle, Position } from 'reactflow';

/**
 * Splitter (ISA / PFD style)
 * Divergence point for multiple streams.
 */
export default function SplitterNode({ data }) {
  const telemetry = data.telemetry;
  const qIn = telemetry?.inlets?.[0]?.flow_rate || 0;
  const qLmin = (qIn * 60000).toFixed(1);

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ width: 40, height: 40, background: 'transparent', position: 'relative' }}>
        <svg width="40" height="40" viewBox="0 0 40 40">
          {/* Circular junction point */}
          <circle cx="20" cy="20" r="15" fill="white" stroke="#334155" strokeWidth="2.5" />
          {/* Flow lines showing divergence */}
          <path d="M 5 20 L 15 20" stroke="#334155" strokeWidth="1.5" />
          <path d="M 25 15 L 35 10" stroke="#334155" strokeWidth="1.5" />
          <path d="M 25 25 L 35 30" stroke="#334155" strokeWidth="1.5" />
        </svg>

        {/* Inlet */}
        <Handle 
          type="target" 
          position={Position.Left} 
          id="inlet-0" 
          style={{ top: '20px', background: '#3b82f6', width: '8px', height: '8px' }} 
        />
        
        {/* Outlets */}
        <Handle 
          type="source" 
          position={Position.Right} 
          id="outlet-0" 
          style={{ top: '10px', background: '#ef4444', width: '8px', height: '8px' }} 
        />
        <Handle 
          type="source" 
          position={Position.Right} 
          id="outlet-1" 
          style={{ top: '30px', background: '#ef4444', width: '8px', height: '8px' }} 
        />
      </div>

      <div style={{ textAlign: 'center', marginTop: '2px' }}>
        <div style={{ fontSize: '9px', color: '#334155', fontWeight: 'bold' }}>
          {data.label || 'SPLITTER'}
        </div>

        {/* Telemetry below Name Tag */}
        <div style={{ marginTop: '2px' }}>
          <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#0369a1' }}> 
            {qLmin} L/min
          </div>
        </div>
      </div>
    </div>
  );
}
