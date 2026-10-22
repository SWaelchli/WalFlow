import React from 'react';
import { getBezierPath } from 'reactflow';

export default function SignalEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  selected
}) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  // Old saved files carry a yellow stroke/dash in style; ignore it so every signal line renders the same way.
  // eslint-disable-next-line no-unused-vars
  const { stroke, strokeWidth, strokeDasharray, ...restStyle } = style;

  return (
    <>
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={selected ? 'var(--color-primary)' : 'var(--color-signal)'}
        strokeWidth={selected ? 2.8 : 2.0}
        strokeDasharray="5 5"
        style={{
          transition: 'stroke 0.2s ease',
          ...restStyle
        }}
      />
      <path
        d={edgePath}
        fill="none"
        stroke="#000"
        strokeOpacity={0}
        strokeWidth={16}
        className="react-flow__edge-interaction"
      />
    </>
  );
}
