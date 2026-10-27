import React from 'react';
import { Handle, Position } from 'reactflow';
import { getRotatedPosition } from './NodeRotationHandle';

const SIDES = [[0, Position.Right], [90, Position.Bottom], [180, Position.Left], [270, Position.Top]];

const AngledPin = ({ portId, offset, angle, length, rotation }) => {
  const a = (angle * Math.PI) / 180;
  const hx = Math.cos(a) * length;
  const hy = Math.sin(a) * length;
  const norm = ((angle % 360) + 360) % 360;
  const side = SIDES.reduce((best, cur) => {
    const d = (s) => Math.min(Math.abs(norm - s[0]), 360 - Math.abs(norm - s[0]));
    return d(cur) < d(best) ? cur : best;
  })[1];
  return (
    <div style={{ position: 'absolute', left: `calc(50% + ${offset.x}px)`, top: `calc(50% + ${offset.y}px)`, width: 0, height: 0, pointerEvents: 'none', zIndex: 10 }}>
      <svg width="1" height="1" style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
        <line x1="0" y1="0" x2={hx} y2={hy} stroke="var(--color-text-secondary)" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <Handle
        type="source"
        position={getRotatedPosition(side, rotation)}
        id={`signal-${portId}`}
        title="Signal"
        style={{
          top: `${hy}px`,
          left: `${hx}px`,
          right: 'auto',
          bottom: 'auto',
          transform: 'translate(-50%, -50%)',
          background: 'var(--color-warning)',
          width: '8px',
          height: '8px',
          border: '1.5px solid var(--color-brand-dark)',
          pointerEvents: 'all',
          boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
        }}
      />
    </div>
  );
};

/**
 * SensingPin Component
 * Renders a needle visual where the "head" is the actual React Flow Handle.
 * 
 * @param {string} portId - The ID of the hydraulic port (e.g., "inlet-0")
 * @param {object} offset - { x, y } offset relative to the handle position
 * @param {number} [angle] - needle direction in degrees (screen angle, 0 = right, 90 = down). Without it the needle
 *   points straight up. With it, `offset` is the needle tip, the head lies `length` px along the angle and
 *   `rotation` (node rotation) only turns the side the signal pipe leaves the head on.
 * @param {number} [length] - needle length when `angle` is given
 */
export const SensingPin = ({ portId, offset = { x: 0, y: 0 }, angle, length = 18, rotation = 0 }) => {
  if (angle !== undefined) return <AngledPin portId={portId} offset={offset} angle={angle} length={length} rotation={rotation} />;
  const pinStyle = {
    position: 'absolute',
    left: `calc(50% + ${offset.x}px)`,
    top: `calc(50% + ${offset.y}px)`,
    transform: 'translate(-50%, -100%)', // Anchor at bottom-center (the needle tip)
    width: '30px',
    height: '40px',
    pointerEvents: 'none',
    zIndex: 10
  };

  return (
    <div style={pinStyle}>
      <svg width="30" height="40" viewBox="0 0 30 40" style={{ display: 'block' }}>
        {/* Needle Body - Ends at the handle center (15, 12) */}
        <line x1="15" y1="12" x2="15" y2="38" stroke="var(--color-text-secondary)" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      
      {/* The Signal Source Handle (Yellow/Warning) - Acts as the visual "head" */}
      <Handle 
        type="source" 
        position={Position.Top} 
        id={`signal-${portId}`} 
        title="Signal"
        style={{ 
          top: '12px',
          left: '15px',
          transform: 'translate(-50%, -50%)', 
          background: 'var(--color-warning)', 
          width: '8px', 
          height: '8px',
          border: '1.5px solid var(--color-brand-dark)',
          pointerEvents: 'all',
          boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
        }} 
      />
    </div>
  );
};
