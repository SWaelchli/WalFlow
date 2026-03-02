import React from 'react';
import { Position } from 'reactflow';

/**
 * Maps a base React Flow position to its rotated equivalent.
 * rotation: 0, 90, 180, 270
 */
export const getRotatedPosition = (basePosition, rotation = 0) => {
  if (rotation === 0) return basePosition;

  const positions = [Position.Left, Position.Top, Position.Right, Position.Bottom];
  const idx = positions.indexOf(basePosition);
  if (idx === -1) return basePosition;

  // Each 90deg rotation shifts the position index by 1
  const shift = rotation / 90;
  const newIdx = (idx + shift) % 4;
  
  return positions[newIdx];
};

/**
 * Shared Rotate Button UI
 */
export const RotateButton = ({ onClick, visible }) => {
  if (!visible) return null;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title="Rotate 90°"
      style={{
        position: 'absolute',
        top: '-30px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '24px',
        height: '24px',
        borderRadius: '50%',
        background: '#fff',
        border: '1px solid #3b82f6',
        color: '#3b82f6',
        fontSize: '14px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        zIndex: 1000,
        padding: 0
      }}
    >
      ↻
    </button>
  );
};
