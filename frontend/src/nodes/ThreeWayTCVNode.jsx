import { Handle, Position, useUpdateNodeInternals } from 'reactflow';
import { useEffect } from 'react';
import { RotateButton, getRotatedPosition } from '../utils/rotation_logic.jsx';
import { SensingPin } from '../utils/SensingPin.jsx';

/**
 * 3-Way Temperature Control Valve (ISA PFD Style)
 * Standardized to match the look and feel of other equipment nodes.
 */
export default function ThreeWayTCVNode({ id, data, selected }) {
  const updateNodeInternals = useUpdateNodeInternals();
  const telemetry = data.telemetry;
  const rotation = data.rotation || 0;
  const sensing = data.sensing || {};
  const hotIdx = data.hot_port_idx || 0;
  
  const qOut = telemetry?.outlets?.[0]?.flow_rate || 0;
  const qLmin = (qOut * 60000).toFixed(1);
  const tOut = telemetry?.outlets?.[0]?.temperature ? (telemetry.outlets[0].temperature - 273.15).toFixed(1) : '20.0';

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, rotation, sensing, updateNodeInternals]);

  return (
    <div style={{ position: 'relative' }}>
      {/* Standard Selection Frame */}
      {selected && (
        <div style={{
          position: 'absolute',
          top: -5, left: -5, right: -5, bottom: -5,
          border: '2px solid #3b82f6',
          borderRadius: '6px',
          boxShadow: '0 0 10px rgba(59, 130, 246, 0.3)',
          pointerEvents: 'none'
        }} />
      )}

      <RotateButton visible={selected} onClick={() => data.onRotate(id)} />

      {/* Standard 60x60 Symbol Container */}
      <div style={{ 
        width: 60, height: 60, background: 'transparent', position: 'relative',
        transform: `rotate(${rotation}deg)`
      }}>
        <svg width="60" height="60" viewBox="0 0 60 60">
          {/* ISA 3-Way Valve Body - Standard slate stroke and 2.5 weight */}
          <path d="M 10 20 L 30 35 L 10 50 Z" fill="white" stroke="#334155" strokeWidth="2.5" />
          <path d="M 20 60 L 30 35 L 40 60 Z" fill="white" stroke="#334155" strokeWidth="2.5" />
          <path d="M 50 20 L 30 35 L 50 50 Z" fill="white" stroke="#334155" strokeWidth="2.5" />
          
          <circle cx="30" cy="35" r="2.5" fill="#334155" />
          
          {/* Control Actuator Box (T for Thermal) */}
          <rect x="24" y="5" width="12" height="12" fill="#f8fafc" stroke="#334155" strokeWidth="1.5" />
          <line x1="30" y1="17" x2="30" y2="35" stroke="#334155" strokeWidth="1.5" />
          <text x="30" y="14" textAnchor="middle" style={{ fontSize: '8px', fontWeight: '800', fill: '#334155' }}>T</text>

          {/* Port Role Markers (H/C) - Moved deeper into triangles to avoid handle overlap */}
          <text x="20" y="37" textAnchor="middle" style={{ fontSize: '7px', fontWeight: 'bold', fill: hotIdx === 0 ? '#ef4444' : '#3b82f6' }}>
            {hotIdx === 0 ? 'H' : 'C'}
          </text>
          <text x="30" y="50" textAnchor="middle" style={{ fontSize: '7px', fontWeight: 'bold', fill: hotIdx === 1 ? '#ef4444' : '#3b82f6' }}>
            {hotIdx === 1 ? 'H' : 'C'}
          </text>
        </svg>

        {/* Standard Handle Styling (8x8, no border, offset centered) */}
        {/* Inlet 1 - Left */}
        <Handle 
          type="target" 
          position={getRotatedPosition(Position.Left, rotation)} 
          id="inlet-0" 
          style={{ 
            top: '35px', left: '10px', 
            marginTop: '-4px', marginLeft: '-4px',
            right: 'auto', bottom: 'auto', transform: 'none',
            background: '#3b82f6', width: '8px', height: '8px' 
          }} 
        />
        {sensing['inlet-0'] && <SensingPin portId="inlet-0" offset={{ x: -20, y: 0 }} />}
        
        {/* Inlet 2 - Bottom */}
        <Handle 
          type="target" 
          position={getRotatedPosition(Position.Bottom, rotation)} 
          id="inlet-1" 
          style={{ 
            top: '60px', left: '30px', 
            marginTop: '-4px', marginLeft: '-4px',
            right: 'auto', bottom: 'auto', transform: 'none',
            background: '#3b82f6', width: '8px', height: '8px' 
          }} 
        />
        {sensing['inlet-1'] && <SensingPin portId="inlet-1" offset={{ x: 0, y: 25 }} />}
        
        {/* Mixed Outlet - Right */}
        <Handle 
          type="source" 
          position={getRotatedPosition(Position.Right, rotation)} 
          id="outlet-0" 
          style={{ 
            top: '35px', left: '50px', 
            marginTop: '-4px', marginLeft: '-4px',
            right: 'auto', bottom: 'auto', transform: 'none',
            background: '#ef4444', width: '8px', height: '8px' 
          }} 
        />
        {sensing['outlet-0'] && <SensingPin portId="outlet-0" offset={{ x: 20, y: 0 }} />}
      </div>

      {/* Standardized Label & Telemetry (9px font sizes) */}
      <div style={{ textAlign: 'center', marginTop: '5px' }}>
        <div style={{ fontSize: '9px', color: '#334155', fontWeight: 'bold' }}>{data.label || '3-WAY TCV'}</div>
        <div style={{ fontSize: '9px', color: '#64748b' }}>{qLmin} L/min</div>
        <div style={{ fontSize: '9px', color: '#ef4444', fontWeight: 'bold' }}>{tOut} °C</div>
      </div>
    </div>
  );
}
