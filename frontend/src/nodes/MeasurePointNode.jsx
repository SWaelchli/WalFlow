import { Handle, Position } from 'reactflow';
import { getRotatedPosition } from '../components/canvas/NodeRotationHandle';
import { SensingPin } from '../components/canvas/SensingPin';
import BaseNode from './BaseNode';
import NodeReadout from './NodeReadout';
import { useUnits } from '../context/UnitContext';
import { nodePressure } from '../utils/nodeReadouts';

/**
 * In-line measurement tap: a point in a line without pressure drop.
 * The sensing pin always shows; it senses the node pressure (handle "signal-port-0") but is drawn centred on the tap.
 */
export default function MeasurePointNode({ id, data, selected }) {
  const { formatPressurePa, labels } = useUnits();
  const rotation = data.rotation || 0;
  const pNode = nodePressure(data.telemetry);

  return (
    <BaseNode
      id={id}
      data={data}
      selected={selected}
      width={40}
      height={20}
      footer={
        <NodeReadout
          name={data.label || 'TAP'}
          rows={[{ label: 'P', value: formatPressurePa(pNode), unit: labels.pressureAbs }]}
        />
      }
    >
      <svg width="40" height="20" viewBox="0 0 40 20">
        <line x1="0" y1="10" x2="40" y2="10" stroke="var(--color-brand-dark)" strokeWidth="2.5" />
        <circle cx="20" cy="10" r="4" fill="var(--color-surface)" stroke="var(--color-brand-dark)" strokeWidth="2" />
      </svg>

      <Handle
        type="target"
        position={getRotatedPosition(Position.Left, rotation)}
        id="port-0"
        className="handle-neutral"
        title="Port 1"
        style={{
          top: '10px', left: '0px',
          marginTop: '-5px', marginLeft: '-5px', // centres the 10px handle on the line end
          right: 'auto', bottom: 'auto', transform: 'none',
          width: '8px', height: '8px'
        }}
      />
      <SensingPin portId="port-0" offset={{ x: 0, y: -4 }} />

      <Handle
        type="source"
        position={getRotatedPosition(Position.Right, rotation)}
        id="port-1"
        className="handle-neutral"
        title="Port 2"
        style={{
          top: '10px', left: '40px',
          marginTop: '-5px', marginLeft: '-5px',
          right: 'auto', bottom: 'auto', transform: 'none',
          width: '8px', height: '8px'
        }}
      />
    </BaseNode>
  );
}
