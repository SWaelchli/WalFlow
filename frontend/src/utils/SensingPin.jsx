import React from 'react';
import { Handle, Position } from 'reactflow';

/**
 * SensingPin Component
 * Renders the pin visual and the yellow signal handle.
 * 
 * @param {string} portId - The ID of the hydraulic port (e.g., "inlet-0")
 * @param {object} offset - { x, y } offset relative to the handle position
 */
export const SensingPin = ({ portId, offset = { x: 0, y: 0 } }) => {
  // We use the same offset logic as the Pin Node visual
  const pinStyle = {
    position: 'absolute',
    left: `calc(50% + ${offset.x}px)`,
    top: `calc(50% + ${offset.y}px)`,
    transform: 'translate(-50%, -100%)', // Align needle tip to handle
    pointerEvents: 'none',
    zIndex: 10
  };

  return (
    <div style={pinStyle}>
      <svg width="30" height="45" viewBox="0 0 40 60" style={{ display: 'block' }}>
        {/* Needle */}
        <line x1="20" y1="30" x2="20" y2="55" stroke="#64748b" strokeWidth="3" strokeLinecap="round" />
        {/* Pin Head */}
        <circle cx="20" cy="20" r="12" fill="#eab308" stroke="#854d0e" strokeWidth="2" />
        <circle cx="20" cy="20" r="4" fill="#fef08a" />
      </svg>
      
      {/* The Signal Source Handle (Yellow) */}
      <Handle 
        type="source" 
        position={Position.Top} 
        id={`signal-${portId}`} 
        style={{ 
          top: '10px',
          left: '20px',
          background: '#eab308', 
          width: '10px', 
          height: '10px',
          border: '1.5px solid #854d0e',
          pointerEvents: 'all' // Enable connection
        }} 
      />
    </div>
  );
};
