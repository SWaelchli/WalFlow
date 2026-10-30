import React, { useEffect, useState } from 'react';

/** Shown over an empty canvas so the first step is obvious. Only the button takes pointer events. */
export default function EmptyCanvasHint({ onBrowseExamples }) {
  // While a drag is over the window the button lets pointer events through, so a drop on it still reaches the canvas
  const [isDragging, setIsDragging] = useState(false);
  useEffect(() => {
    const start = () => setIsDragging(true);
    const stop = () => setIsDragging(false);
    const leave = (e) => { if (!e.relatedTarget) setIsDragging(false); };
    document.addEventListener('dragenter', start);
    document.addEventListener('dragleave', leave);
    document.addEventListener('dragend', stop);
    document.addEventListener('drop', stop);
    return () => {
      document.removeEventListener('dragenter', start);
      document.removeEventListener('dragleave', leave);
      document.removeEventListener('dragend', stop);
      document.removeEventListener('drop', stop);
    };
  }, []);

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
          Drag components from the Components pane on the left onto the canvas, then connect their ports.
          Or start from one of the example drawings.
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={onBrowseExamples}
          aria-label="Browse examples"
          style={{ marginTop: '12px', pointerEvents: isDragging ? 'none' : 'auto' }}
        >
          Browse examples
        </button>
        <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', marginTop: '8px' }}>
          Right-click for actions · <kbd>R</kbd> rotates · <kbd>Ctrl</kbd>+<kbd>C</kbd>/<kbd>V</kbd> copies and pastes
        </div>
      </div>
    </div>
  );
}
