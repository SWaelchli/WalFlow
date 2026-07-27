import React, { useEffect, useMemo } from 'react';
import { useUpdateNodeInternals } from 'reactflow';
import { RotateButton } from '../components/canvas/NodeRotationHandle';

/**
 * BaseNode component wrapper
 * Shared wrapper handling selection box, rotation handle, node internals updates,
 * rotation container, and label/stat displays.
 */
export default function BaseNode({
  id,
  data,
  selected,
  width = 60,
  height = 60,
  warningMessage,
  warningTitle,
  children,
  footer
}) {
  const updateNodeInternals = useUpdateNodeInternals();
  const rotation = data.rotation || 0;
  const sensing = useMemo(() => data.sensing || {}, [data.sensing]);

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, rotation, sensing, updateNodeInternals]);

  return (
    <div style={{ position: 'relative', cursor: selected ? 'move' : 'pointer' }}>
      {selected && (
        <div style={{
          position: 'absolute',
          top: -5, left: -5, right: -5, bottom: -5,
          border: '2px solid #FA8507',
          borderRadius: '6px',
          boxShadow: '0 0 10px rgba(59, 130, 246, 0.3)',
          pointerEvents: 'none'
        }} />
      )}

      {warningMessage && (
        <div 
          className="animate-pulse"
          style={{
            position: 'absolute',
            top: -15,
            left: '50%',
            transform: 'translateX(-50%)',
            color: '#ef4444',
            fontSize: '20px',
            fontWeight: 'bold',
            textShadow: '0 0 5px rgba(239, 68, 68, 0.5)',
            zIndex: 10
          }}
          title={warningTitle || warningMessage}
        >
          {warningMessage}
        </div>
      )}

      {data.hasCaseOverrides && (
        <div
          style={{
            position: 'absolute',
            top: -6,
            right: -6,
            background: 'transparent',
            border: '1.5px solid #FA8507',
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 1px 3px rgba(250, 133, 7, 0.25)',
            zIndex: 12
          }}
          title="Contains active operating case overrides"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="#FA8507">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
        </div>
      )}

      <RotateButton visible={selected} onClick={() => data.onRotate && data.onRotate(id)} />

      {data.active === false && (
        <div
          style={{
            position: 'absolute',
            top: height - 12,
            left: width - 15,
            background: '#ef4444',
            color: 'white',
            fontSize: '9px',
            fontWeight: 'bold',
            padding: '1px 3px',
            borderRadius: '3px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            zIndex: 15
          }}
          title="Component is currently inactive (Off)"
        >
          OFF
        </div>
      )}

      <div style={{ 
        width, height, background: 'transparent', position: 'relative',
        transform: `rotate(${rotation}deg)`
      }}>
        {children}
      </div>

      {footer && (
        <div style={{ textAlign: 'center', marginTop: '5px' }}>
          {footer}
        </div>
      )}
    </div>
  );
}
