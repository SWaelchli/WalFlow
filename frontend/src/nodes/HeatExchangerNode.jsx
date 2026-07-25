import { Handle, Position } from 'reactflow';
import { useMemo } from 'react';
import { getRotatedPosition } from '../components/canvas/NodeRotationHandle';
import { SensingPin } from '../components/canvas/SensingPin';
import BaseNode from './BaseNode';

/**
 * Shell and Tube Heat Exchanger (ISA / PFD style)
 */
export default function HeatExchangerNode({ id, data, selected }) {
  const telemetry = data.telemetry;
  const rotation = data.rotation || 0;
  const sensing = useMemo(() => data.sensing || {}, [data.sensing]);
  const tIn = telemetry?.inlets?.[0]?.temperature || 293.15;
  const tOut = telemetry?.outlets?.[0]?.temperature || 293.15;
  const flowRate = telemetry?.inlets?.[0]?.flow_rate || 0;
  const density = telemetry?.inlets?.[0]?.density || 1000;

  // Calculate or read duty in kW
  let dutyVal = 0;
  if (telemetry?.actual_duty_kw !== undefined && telemetry?.actual_duty_kw !== null) {
    dutyVal = telemetry.actual_duty_kw;
  } else if (data.heat_duty_kw !== undefined && data.heat_duty_kw !== null) {
    dutyVal = data.heat_duty_kw;
  } else if (Math.abs(flowRate) > 1e-9) {
    // Dynamic thermodynamic fallback: Q = m_dot * Cp * deltaT
    const cp = (density < 900) ? 2000 : 4184; // Approx Cp for oil vs water
    const mDot = Math.abs(flowRate) * density;
    dutyVal = (mDot * cp * (tIn - tOut)) / 1000.0;
  }

  const deltaT = (tOut - tIn).toFixed(1);
  const dutyFormatted = Math.abs(dutyVal) < 0.01 ? '0' : dutyVal.toFixed(1);

  return (
    <BaseNode
      id={id}
      data={data}
      selected={selected}
      width={60}
      height={60}
      footer={
        <>
          <div style={{ fontSize: '9px', color: '#334155', fontWeight: 'bold' }}>{data.label || 'HEAT EXCH'}</div>
          <div style={{ fontSize: '10px', fontWeight: 'bold', color: dutyVal > 0.01 ? '#ef4444' : dutyVal < -0.01 ? '#3b82f6' : '#64748b' }}>
            {dutyFormatted} kW
          </div>
          <div style={{ fontSize: '9px', color: '#64748b' }}>ΔT: {deltaT} K</div>
        </>
      }
    >
      <svg width="60" height="60" viewBox="0 0 60 60">
        <circle cx="30" cy="30" r="25" fill="white" stroke="#334155" strokeWidth="2.5" />
        <path d="M 10 30 L 20 20 L 30 40 L 40 20 L 50 30" fill="none" stroke="#334155" strokeWidth="2" />
      </svg>

      <Handle 
        type="target" 
        position={getRotatedPosition(Position.Left, rotation)} 
        id="inlet-0" 
        className="handle-inlet"
        style={{ 
          top: '30px', left: '5px', 
          marginTop: '-4px', marginLeft: '-4px',
          right: 'auto', bottom: 'auto', transform: 'none',
          background: '#0284C7', width: '8px', height: '8px' 
        }} 
      />
      {sensing['inlet-0'] && <SensingPin portId="inlet-0" offset={{ x: -25, y: 0 }} />}

      <Handle 
        type="source" 
        position={getRotatedPosition(Position.Right, rotation)} 
        id="outlet-0" 
        className="handle-outlet"
        style={{ 
          top: '30px', left: '55px', 
          marginTop: '-4px', marginLeft: '-4px',
          right: 'auto', bottom: 'auto', transform: 'none',
          background: '#E11D48', width: '8px', height: '8px' 
        }} 
      />
      {sensing['outlet-0'] && <SensingPin portId="outlet-0" offset={{ x: 25, y: 0 }} />}
    </BaseNode>
  );
}
