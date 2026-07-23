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
        stroke={selected ? '#f59e0b' : '#eab308'}
        strokeWidth={selected ? 2.5 : 1.8}
        strokeDasharray="4 4"
        style={{
          transition: 'stroke 0.2s ease',
          ...style
        }}
      />
      <path
        d={edgePath}
        fill="none"
        stroke="#fef08a"
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
