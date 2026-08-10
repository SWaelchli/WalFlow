import React from 'react';
import FlowDropMark from '../symbols/FlowDropMark';

export default function CanvasLoadingOverlay({ visible, label = 'Opening drawing…' }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 50,
        pointerEvents: visible ? 'auto' : 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(240, 244, 244, 0.72)',
        backdropFilter: 'blur(2px)',
        WebkitBackdropFilter: 'blur(2px)',
        opacity: visible ? 1 : 0,
        transition: 'opacity 200ms cubic-bezier(0.4, 0, 0.2, 1)'
      }}
    >
      <FlowDropMark size={96} animating={visible} />
      <p
        style={{
          color: 'var(--color-text-secondary)',
          margin: '12px 0 0 0',
          fontSize: '14px',
          fontWeight: '500',
          letterSpacing: '0.01em'
        }}
      >
        {label}
      </p>
    </div>
  );
}
