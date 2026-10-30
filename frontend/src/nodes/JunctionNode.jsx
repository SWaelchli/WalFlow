import { useEffect, useMemo } from 'react';
import { Handle, Position, useUpdateNodeInternals } from 'reactflow';
import { getRotatedPosition } from '../components/canvas/NodeRotationHandle';
import { SensingPin } from '../components/canvas/SensingPin';
import BaseNode from './BaseNode';
import NodeReadout from './NodeReadout';
import { useUnits } from '../context/UnitContext';
import { junctionLayout, junctionLabelPlacement, junctionPortCount, PIN_TIP, PIN_LENGTH } from '../utils/junctionLayout';
import { portNumberLabel } from '../utils/portLabels';

const SIDE_POSITION = { left: Position.Left, right: Position.Right, top: Position.Top, bottom: Position.Bottom };

/**
 * Junction: 3 to 8 neutral ports, each takes one pipe that may run in either direction.
 * T for 3 ports, cross for 4, ports around a hub for 5 to 8.
 */
export default function JunctionNode({ id, data, selected }) {
  const { formatFlowM3s, labels } = useUnits();
  const updateNodeInternals = useUpdateNodeInternals();
  const rotation = data.rotation || 0;
  const numPorts = junctionPortCount(data);
  const { size, ports } = useMemo(() => junctionLayout(numPorts), [numPorts]);
  const sensing = data.sensing || {};
  const c = size / 2;
  // The label stays upright and sits where no pipe leaves and no sensing needle points
  const pinKey = ports.filter((p) => sensing[p.id]).map((p) => p.id).join(',');
  const label = useMemo(() => junctionLabelPlacement(numPorts, rotation, pinKey ? pinKey.split(',') : []), [numPorts, rotation, pinKey]);
  const footerStyle = {
    position: 'absolute', left: `${c + label.x}px`, top: `${c + label.y}px`,
    transform: `translate(${label.tx * 100}%, ${label.ty * 100}%)`,
    width: 'max-content', textAlign: label.align, pointerEvents: 'none',
    // Halo in the canvas colour: a pipe routed across the label is visibly interrupted, the text stays legible
    background: 'var(--color-bg-canvas)', padding: '1px 4px', borderRadius: '4px', zIndex: 20
  };

  // The handles are added or removed with num_ports, so React Flow measures them again
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, numPorts, updateNodeInternals]);

  const throughput = (data.telemetry?.ports || []).reduce((sum, p) => sum + Math.max(0, p?.flow_rate || 0), 0);

  return (
    <BaseNode
      id={id}
      data={data}
      selected={selected}
      width={size}
      height={size}
      footerStyle={footerStyle}
      footer={
        <NodeReadout
          name={data.label || 'JUNCTION'}
          rows={[{ value: formatFlowM3s(throughput), unit: labels.flow }]}
        />
      }
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {ports.map((p) => (
          <line key={p.id} x1={c} y1={c} x2={p.x} y2={p.y} stroke="var(--color-brand-dark)" strokeWidth="2.5" strokeLinecap="round" />
        ))}
        <circle cx={c} cy={c} r="5" fill="var(--color-surface)" stroke="var(--color-brand-dark)" strokeWidth="2.5" />
      </svg>

      {ports.map((p) => (
        <Handle
          key={p.id}
          type="source"
          position={getRotatedPosition(SIDE_POSITION[p.side], rotation)}
          id={p.id}
          className="handle-port handle-junction"
          title={portNumberLabel(Number(p.id.split('-')[1]))}
          style={{
            top: `${p.y}px`, left: `${p.x}px`,
            marginTop: '-5px', marginLeft: '-5px',
            right: 'auto', bottom: 'auto',
            width: '8px', height: '8px'
          }}
        />
      ))}

      {ports.map((p) => sensing[p.id] && (
        <SensingPin
          key={p.id}
          portId={p.id}
          angle={p.pinAngle}
          length={PIN_LENGTH}
          rotation={rotation}
          offset={{
            x: p.x - c + Math.cos((p.pinAngle * Math.PI) / 180) * PIN_TIP,
            y: p.y - c + Math.sin((p.pinAngle * Math.PI) / 180) * PIN_TIP
          }}
        />
      ))}
    </BaseNode>
  );
}
