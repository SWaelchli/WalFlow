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

  return (
    <>
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth={selected ? 2.8 : 2.0}
        strokeDasharray="5 5"
        style={{
          transition: 'stroke 0.2s ease',
          ...style
        }}
      />
      <path
        d={edgePath}
        fill="none"
        stroke="rgba(250, 133, 7, 0.5)"
        strokeWidth={1.5}
        strokeDasharray="3 9"
        style={{
          animation: 'signalPulse 1.2s linear infinite',
          pointerEvents: 'none'
        }}
      />
    </>
  );
}
