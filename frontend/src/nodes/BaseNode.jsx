import React, { useEffect, useMemo } from 'react';
import { useUpdateNodeInternals } from 'reactflow';
import { RotateButton } from '../components/canvas/NodeRotationHandle';
import StatusBadge from '../components/common/StatusBadge';
import { WarningIcon } from '../components/symbols/IconLibrary';

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
  footer,
  footerStyle,
  footerOffset = 0
}) {
  const updateNodeInternals = useUpdateNodeInternals();
  const rotation = data.rotation || 0;
  const sensing = useMemo(() => data.sensing || {}, [data.sensing]);

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, rotation, sensing, updateNodeInternals]);

  return (
    <div style={{ position: 'relative', cursor: selected ? 'move' : 'pointer' }}>

      {warningMessage && (
        <div
          className="animate-pulse node-warning-icon"
          title={warningTitle || 'Warning'}
          role="img"
          aria-label={warningTitle || 'Warning'}
        >
          <WarningIcon size={18} weight="fill" />
        </div>
      )}

      {data.hasCaseOverrides && (
        <div
          style={{
            position: 'absolute',
            top: -6,
            right: -6,
            background: 'transparent',
            border: '1.5px solid var(--color-primary)',
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'var(--shadow-sm)',
            zIndex: 12
          }}
          title="Contains active operating case overrides"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="var(--color-primary)">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
        </div>
      )}

      <RotateButton visible={selected} onClick={() => data.onRotate && data.onRotate(id)} />

      {data.active === false && (
        <div
          className="node-off-badge"
          style={{ position: 'absolute', top: height - 12, left: width - 15 }}
        >
          <StatusBadge kind="danger" title="Component is currently inactive (Off)">OFF</StatusBadge>
        </div>
      )}

      <div style={{ 
        width, height, background: 'transparent', position: 'relative',
        transform: `rotate(${rotation}deg)`
      }}>
        {children}
      </div>

      {/* Centred under the symbol and kept out of the node box, so a long readout neither shifts the text nor moves the pins */}
      {footer && (
        <div style={footerStyle || { position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', width: 'max-content', textAlign: 'center', marginTop: `${5 + footerOffset}px` }}>
          {footer}
        </div>
      )}
    </div>
  );
}
