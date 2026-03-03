import React from 'react';
import { Handle, Position } from 'reactflow';

/**
 * SensingPin Component
 * Renders a needle visual where the "head" is the actual React Flow Handle.
 * 
 * @param {string} portId - The ID of the hydraulic port (e.g., "inlet-0")
 * @param {object} offset - { x, y } offset relative to the handle position
 */
export const SensingPin = ({ portId, offset = { x: 0, y: 0 } }) => {
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
        <line x1="15" y1="12" x2="15" y2="38" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      
      {/* The Signal Source Handle (Yellow) - Acts as the visual "head" */}
      <Handle 
        type="source" 
        position={Position.Top} 
        id={`signal-${portId}`} 
        style={{ 
          top: '12px',
          left: '15px',
          transform: 'translate(-50%, -50%)', 
          background: '#fde047', 
          width: '8px', 
          height: '8px',
          border: '1.5px solid #854d0e',
          pointerEvents: 'all',
          boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
        }} 
      />
    </div>
  );
};
