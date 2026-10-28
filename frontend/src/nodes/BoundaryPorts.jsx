import { useEffect } from 'react';
import { Handle, Position, useUpdateNodeInternals } from 'reactflow';
import { getRotatedPosition } from '../components/canvas/NodeRotationHandle';
import { SensingPin } from '../components/canvas/SensingPin';
import { PIN_TIP, PIN_LENGTH } from '../utils/junctionLayout';
import { portNumberLabel } from '../utils/portLabels';

const SIDE_POSITION = { left: Position.Left, right: Position.Right, top: Position.Top, bottom: Position.Bottom };

/**
 * Neutral port handles and sensing pins of a boundary node (tank, pressure boundary, flow boundary).
 * `layout` comes from boundaryLayout; `numPorts` drives the re-measure when ports are added or removed.
 */
export default function BoundaryPorts({ id, layout, numPorts, rotation, sensing }) {
  const updateNodeInternals = useUpdateNodeInternals();
  const [cx, cy] = [layout.width / 2, layout.height / 2];

  // Handles are added or removed with num_ports, so React Flow measures them again
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, numPorts, updateNodeInternals]);

  return (
    <>
      {layout.ports.map((p) => (
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
      {layout.ports.map((p) => sensing[p.id] && (
        <SensingPin
          key={p.id}
          portId={p.id}
          angle={p.pinAngle}
          length={PIN_LENGTH}
          rotation={rotation}
          offset={{
            x: p.x - cx + Math.cos((p.pinAngle * Math.PI) / 180) * PIN_TIP,
            y: p.y - cy + Math.sin((p.pinAngle * Math.PI) / 180) * PIN_TIP
          }}
        />
      ))}
    </>
  );
}
