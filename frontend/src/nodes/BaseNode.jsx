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
    <div style={{ position: 'relative' }}>
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

      <RotateButton visible={selected} onClick={() => data.onRotate && data.onRotate(id)} />

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
