import { Handle, Position } from 'reactflow';
import { paToBar, kToC } from '../utils/converters';

export default function HeatExchangerNode({ data }) {
  const telemetry = data.telemetry;
  const pIn = telemetry?.inlets?.[0]?.pressure || 0;
  const pOut = telemetry?.outlets?.[0]?.pressure || 0;
  const tIn = telemetry?.inlets?.[0]?.temperature || 293.15;
  const tOut = telemetry?.outlets?.[0]?.temperature || 293.15;
  const dP = pIn - pOut;

  return (
    <div style={{ position: 'relative' }}>
      {/* Telemetry Display Above the Node */}
      <div style={{
        position: 'absolute', top: -45, left: '50%', transform: 'translateX(-50%)',
        textAlign: 'center', width: '100px', pointerEvents: 'none'
      }}>
        <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#64748b' }}>
          dP: {paToBar(dP)} bar
        </div>
        <div style={{ fontSize: '9px', color: '#0369a1' }}>
          {kToC(tIn)}°C → {kToC(tOut)}°C
        </div>
      </div>

      <div style={{
        width: 100, height: 60, background: '#eff6ff',
        border: '2px solid #2563eb', borderRadius: '4px',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', position: 'relative',
        boxShadow: '0 2px 4px rgba(29, 78, 216, 0.1)'
      }}>
        {/* Visual zigzag for tube bundle */}
        <svg width="80%" height="60%" viewBox="0 0 80 40" style={{ position: 'absolute', opacity: 0.3 }}>
          <polyline points="0,20 10,10 20,30 30,10 40,30 50,10 60,30 70,10 80,20" 
                    fill="none" stroke="#2563eb" strokeWidth="2" />
        </svg>
        
        <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#1d4ed8', zIndex: 1 }}>
          COOLER
        </div>
        <div style={{ fontSize: '9px', color: '#3b82f6', zIndex: 1 }}>
          Duty: {data.heat_duty_kw || 0}kW
        </div>
        
        {/* Inlet */}
        <Handle type="target" position={Position.Left} id="inlet-0" style={{ background: '#2563eb' }} />
        
        {/* Outlet */}
        <Handle type="source" position={Position.Right} id="outlet-0" style={{ background: '#2563eb' }} />
      </div>
    </div>
  );
}
