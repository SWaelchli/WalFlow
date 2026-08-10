import React from 'react';

export default function FlowDropMark({ size = 96, animating = true }) {
  return (
    <svg
      viewBox="0 0 128 128"
      width={size}
      height={size}
      role="img"
      aria-label="WälFlow"
    >
      <g className={animating ? "drop-group" : ""}>
        <path
          d="M64 14 C 88 44, 106 62, 106 82 A 42 42 0 1 1 22 82 C 22 62, 40 44, 64 14 Z"
          fill="#395253"
        />
        <path className={animating ? "flow-glow" : "flow-glow-static"} d="M28 80 C 44 58, 54 100, 68 80 C 80 62, 88 92, 100 72" />
        <path className={animating ? "flow-line" : "flow-line-static"} d="M28 80 C 44 58, 54 100, 68 80 C 80 62, 88 92, 100 72" />
      </g>
    </svg>
  );
}
