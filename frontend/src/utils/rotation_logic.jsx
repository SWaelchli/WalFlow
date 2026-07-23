import React from 'react';
import { Position } from 'reactflow';

/**
 * Maps a base React Flow position to its rotated equivalent.
 * rotation: 0, 90, 180, 270
 */
/* eslint-disable-next-line react-refresh/only-export-components */
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
        border: '1.5px solid #FA8507',
        color: '#FA8507',
        fontSize: '14px',
        fontWeight: 'bold',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 2px 8px rgba(250, 133, 7, 0.25)',
        zIndex: 1000,
        padding: 0,
        transition: 'transform 0.2s, background 0.2s'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = '#FA8507';
        e.currentTarget.style.color = '#ffffff';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = '#ffffff';
        e.currentTarget.style.color = '#FA8507';
      }}
    >
      ↻
    </button>
  );
};
