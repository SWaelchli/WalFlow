import React from 'react';

/** Shown over an empty canvas so the first step is obvious. */
export default function EmptyCanvasHint() {
  return (
    <div
      style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none', zIndex: 4,
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: '360px', padding: '20px 24px', background: 'rgba(255,255,255,0.9)', border: '1px dashed var(--color-border-hover)', borderRadius: 'var(--radius-md)' }}>
        <div style={{ fontSize: 'var(--fs-md)', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '6px' }}>Start your diagram</div>
        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
          Drag components from the library on the left onto the canvas, then connect their ports.
          Or open a ready-made example from the Examples list.
        </div>
        <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', marginTop: '8px' }}>
          Right-click for actions · <kbd>R</kbd> rotates · <kbd>Ctrl</kbd>+<kbd>C</kbd>/<kbd>V</kbd> copies and pastes
        </div>
      </div>
    </div>
  );
}
