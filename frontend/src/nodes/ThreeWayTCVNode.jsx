import { Handle, Position } from 'reactflow';
import { useMemo } from 'react';
import { getRotatedPosition } from '../components/canvas/NodeRotationHandle';
import { SensingPin } from '../components/canvas/SensingPin';
import BaseNode from './BaseNode';
import NodeReadout from './NodeReadout';
import { useUnits } from '../context/UnitContext';
import { PIN_TIP, PIN_LENGTH } from '../utils/junctionLayout';
import { boundaryFooterOffset } from '../utils/boundaryLayout';

const INLET_1_PIN_ANGLE = 45;
const INLET_1_PIN_RAD = (INLET_1_PIN_ANGLE * Math.PI) / 180;
// The angled inlet 2 needle, in the shape boundaryFooterOffset reads, so the readout drops below its head
const PIN_LAYOUT = { width: 60, height: 60, ports: [{ id: 'inlet-1', x: 30, y: 60, pinAngle: INLET_1_PIN_ANGLE }] };

/**
 * 3-Way Temperature Control Valve (ISA PFD Style)
 * Standardized to match the look and feel of other equipment nodes.
 */
export default function ThreeWayTCVNode({ id, data, selected }) {
  const { formatFlowM3s, formatTemperature, formatTemperatureK, labels } = useUnits();
  const telemetry = data.telemetry;
  const rotation = data.rotation || 0;
  const sensing = useMemo(() => data.sensing || {}, [data.sensing]);
  const hotIdx = data.hot_port_idx || 0;
  
  const qOut = telemetry?.outlets?.[0]?.flow_rate || 0;
  const flowFormatted = formatFlowM3s(qOut);
  const tOutFormatted = telemetry?.outlets?.[0]?.temperature 
    ? formatTemperatureK(telemetry.outlets[0].temperature) 
    : formatTemperature(20.0);

  return (
    <BaseNode
      id={id}
      data={data}
      selected={selected}
      width={60}
      height={60}
      footerOffset={boundaryFooterOffset(PIN_LAYOUT, rotation, sensing)}
      footer={
        <NodeReadout
          name={data.label || '3-WAY TCV'}
          rows={[
            { value: flowFormatted, unit: labels.flow },
            { value: tOutFormatted, unit: labels.temperature },
          ]}
        />
      }
    >
      <svg width="60" height="60" viewBox="0 0 60 60">
        <path d="M 10 20 L 30 35 L 10 50 Z" fill="var(--color-surface)" stroke="var(--color-brand-dark)" strokeWidth="2.5" />
        <path d="M 17 60 L 30 35 L 43 60 Z" fill="var(--color-surface)" stroke="var(--color-brand-dark)" strokeWidth="2.5" />
        <path d="M 50 20 L 30 35 L 50 50 Z" fill="var(--color-surface)" stroke="var(--color-brand-dark)" strokeWidth="2.5" />
        
        <circle cx="30" cy="35" r="2.5" fill="var(--color-brand-dark)" />
        
        <rect x="24" y="5" width="12" height="12" fill="var(--color-surface-hover)" stroke="var(--color-brand-dark)" strokeWidth="1.5" />
        <line x1="30" y1="17" x2="30" y2="35" stroke="var(--color-brand-dark)" strokeWidth="1.5" />
        <text x="30" y="14" textAnchor="middle" className="symbol-text-meta">T</text>

        <text
          x="19"
          y="35"
          textAnchor="middle"
          dominantBaseline="central"
          className={`symbol-text-meta ${hotIdx === 0 ? 'port-letter-hot' : 'port-letter-cold'}`}
        >
          {hotIdx === 0 ? 'H' : 'C'}
        </text>

        <text
          x="30"
          y="50.5"
          textAnchor="middle"
          dominantBaseline="central"
          className={`symbol-text-meta ${hotIdx === 1 ? 'port-letter-hot' : 'port-letter-cold'}`}
        >
          {hotIdx === 1 ? 'H' : 'C'}
        </text>
      </svg>

      <Handle 
        type="target" 
        position={getRotatedPosition(Position.Left, rotation)} 
        id="inlet-0" 
        className="handle-inlet"
        title="Inlet 1"
        style={{ 
          top: '35px', left: '10px', 
          marginTop: '-5px', marginLeft: '-5px',
          right: 'auto', bottom: 'auto', transform: 'none',
          background: 'var(--color-inlet)', width: '8px', height: '8px' 
        }} 
      />
      {sensing['inlet-0'] && <SensingPin portId="inlet-0" offset={{ x: -20, y: 0 }} />}
      
      <Handle 
        type="target" 
        position={getRotatedPosition(Position.Bottom, rotation)} 
        id="inlet-1" 
        className="handle-inlet"
        title="Inlet 2"
        style={{ 
          top: '60px', left: '30px', 
          marginTop: '-5px', marginLeft: '-5px',
          right: 'auto', bottom: 'auto', transform: 'none',
          background: 'var(--color-inlet)', width: '8px', height: '8px' 
        }} 
      />
      {/* The bottom port sits on the symbol's base, so its needle leans down-right, clear of the symbol (as on a junction) */}
      {sensing['inlet-1'] && (
        <SensingPin
          portId="inlet-1"
          angle={INLET_1_PIN_ANGLE}
          length={PIN_LENGTH}
          rotation={rotation}
          offset={{ x: Math.cos(INLET_1_PIN_RAD) * PIN_TIP, y: 30 + Math.sin(INLET_1_PIN_RAD) * PIN_TIP }}
        />
      )}
      
      <Handle 
        type="source" 
        position={getRotatedPosition(Position.Right, rotation)} 
        id="outlet-0" 
        className="handle-outlet"
        title="Outlet"
        style={{ 
          top: '35px', left: '50px', 
          marginTop: '-5px', marginLeft: '-5px',
          right: 'auto', bottom: 'auto', transform: 'none',
          background: 'var(--color-outlet)', width: '8px', height: '8px' 
        }} 
      />
      {sensing['outlet-0'] && <SensingPin portId="outlet-0" offset={{ x: 20, y: 0 }} />}
    </BaseNode>
  );
}
