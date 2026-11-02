import { Handle, Position } from 'reactflow';
import { useMemo } from 'react';
import { getRotatedPosition } from '../components/canvas/NodeRotationHandle';
import { SensingPin } from '../components/canvas/SensingPin';
import BaseNode from './BaseNode';
import NodeReadout from './NodeReadout';
import { useUnits } from '../context/UnitContext';
import { heatExchangerReadout } from '../utils/nodeReadouts';

/**
 * Shell and Tube Heat Exchanger (ISA / PFD style)
 */
export default function HeatExchangerNode({ id, data, selected }) {
  const { formatHeatDuty, formatDimensionless, labels } = useUnits();
  const telemetry = data.telemetry;
  const rotation = data.rotation || 0;
  const sensing = useMemo(() => data.sensing || {}, [data.sensing]);
  const { dutyKw: dutyVal, deltaTK } = heatExchangerReadout(telemetry);

  const deltaT = formatDimensionless(deltaTK, 'temperatureDiff');
  const dutyFormatted = Math.abs(dutyVal) < 0.01 ? '0' : formatHeatDuty(dutyVal);

  return (
    <BaseNode
      id={id}
      data={data}
      selected={selected}
      width={60}
      height={60}
      footer={
        <NodeReadout
          name={data.label || 'HEAT EXCH'}
          rows={[
            { value: dutyFormatted, unit: labels.heatDuty },
            { label: 'ΔT', value: deltaT, unit: 'K' },
          ]}
        />
      }
    >
      <svg width="60" height="60" viewBox="0 0 60 60">
        <circle cx="30" cy="30" r="25" fill="var(--color-surface)" stroke="var(--color-brand-dark)" strokeWidth="2.5" />
        <path d="M 10 30 L 20 20 L 30 40 L 40 20 L 50 30" fill="none" stroke="var(--color-brand-dark)" strokeWidth="2" />
      </svg>

      <Handle 
        type="target" 
        position={getRotatedPosition(Position.Left, rotation)} 
        id="inlet-0" 
        className="handle-inlet"
        title="Inlet"
        style={{ 
          top: '30px', left: '5px', 
          marginTop: '-5px', marginLeft: '-5px',
          right: 'auto', bottom: 'auto', transform: 'none',
          background: 'var(--color-inlet)', width: '8px', height: '8px' 
        }} 
      />
      {sensing['inlet-0'] && <SensingPin portId="inlet-0" offset={{ x: -25, y: 0 }} />}

      <Handle 
        type="source" 
        position={getRotatedPosition(Position.Right, rotation)} 
        id="outlet-0" 
        className="handle-outlet"
        title="Outlet"
        style={{ 
          top: '30px', left: '55px', 
          marginTop: '-5px', marginLeft: '-5px',
          right: 'auto', bottom: 'auto', transform: 'none',
          background: 'var(--color-outlet)', width: '8px', height: '8px' 
        }} 
      />
      {sensing['outlet-0'] && <SensingPin portId="outlet-0" offset={{ x: 25, y: 0 }} />}
    </BaseNode>
  );
}
