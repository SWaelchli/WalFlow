import { Handle, Position } from 'reactflow';
import { paToBar, m3sToLmin } from '../utils/converters';

export default function PumpNode({ data }) {
  const telemetry = data.telemetry;
  const pIn = telemetry?.inlets?.[0]?.pressure || 0;
  const pOut = telemetry?.outlets?.[0]?.pressure || 0;
  const q = telemetry?.outlets?.[0]?.flow_rate || 0;
  const dP = pOut - pIn;

  return (
    <div style={{ position: 'relative' }}>
      {/* Telemetry Display Above the Node */}
      <div style={{
        position: 'absolute', top: -45, left: '50%', transform: 'translateX(-50%)',
        textAlign: 'center', width: '80px', pointerEvents: 'none'
      }}>
        <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#0369a1' }}>
          +{paToBar(dP)} bar
        </div>
        <div style={{ fontSize: '9px', color: '#64748b' }}>
          {m3sToLmin(q)} L/min
        </div>
      </div>

      {/* A classic circular representation for a centrifugal pump */}
      <div style={{
        width: 70, height: 70, borderRadius: '50%', background: '#fff',
        border: '3px solid #334155', display: 'flex', alignItems: 'center',
        justifyContent: 'center', boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
      }}>
        <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#334155' }}>
          PUMP
        </div>
        
        {/* Inlet (Suction) */}
        <Handle type="target" position={Position.Left} id="inlet-0" style={{ background: '#334155', width: '10px', height: '10px' }} />
        
        {/* Outlet (Discharge) */}
        <Handle type="source" position={Position.Right} id="outlet-0" style={{ background: '#334155', width: '10px', height: '10px' }} />
      </div>
    </div>
  );
}