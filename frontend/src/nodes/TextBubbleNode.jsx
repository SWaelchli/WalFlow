import React, { useState, useRef, useEffect } from 'react';
import { useReactFlow, NodeResizer } from 'reactflow';

const FONT_SIZES = {
  sm: '12px',
  md: '14px',
  lg: '16px',
};

/**
 * TextBubbleNode Component
 * Canvas annotation / text callout bubble locked to Clean White theme with
 * native drag-to-move and drag-to-resize (NodeResizer) support.
 */
export default function TextBubbleNode({ id, data, selected }) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState(null);
  const textareaRef = useRef(null);
  const { setNodes } = useReactFlow();

  const text = draftText !== null ? draftText : (data.text || data.label || 'Double-click to edit note...');
  const fontSize = FONT_SIZES[data.fontSize] || FONT_SIZES.md;

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [isEditing]);

  const handleSaveText = () => {
    setIsEditing(false);
    const textToSave = text;
    setDraftText(null);
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            data: {
              ...node.data,
              text: textToSave,
              label: textToSave.slice(0, 20) || 'Text Note',
            },
          };
        }
        return node;
      })
    );
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSaveText();
    } else if (e.key === 'Escape') {
      setDraftText(null);
      setIsEditing(false);
    }
  };

  return (
    <>
      <NodeResizer
        minWidth={140}
        minHeight={70}
        isVisible={selected}
        lineStyle={{ borderColor: 'transparent', borderWidth: 0 }}
        handleStyle={{
          width: 9,
          height: 9,
          borderRadius: '50%',
          backgroundColor: 'var(--color-primary)',
          border: '2px solid var(--color-surface)',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
        }}
      />
      <div
        onDoubleClick={() => setIsEditing(true)}
        style={{
          width: '100%',
          height: '100%',
          minWidth: '140px',
          minHeight: '70px',
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: '8px',
          padding: '10px 12px',
          boxShadow: selected
            ? 'var(--shadow-lg)'
            : 'var(--shadow-sm)',
          position: 'relative',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          cursor: isEditing ? 'text' : (selected ? 'move' : 'pointer'),
        }}
      >
        {/* Note Header Tag */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '6px',
            paddingBottom: '4px',
            borderBottom: '1px dashed var(--color-border)',
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--color-brand-dark)',
            userSelect: 'none',
            flexShrink: 0,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <span>{data.title || 'NOTE'}</span>
          </span>
          {isEditing && (
            <span style={{ fontSize: '9px', color: 'var(--color-text-secondary)', opacity: 0.85 }}>Ctrl+Enter to save</span>
          )}
        </div>

        {/* Note Body */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {isEditing ? (
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setDraftText(e.target.value)}
              onBlur={handleSaveText}
              onKeyDown={handleKeyDown}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              className="nowheel nodrag nopan"
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                outline: 'none',
                background: 'transparent',
                resize: 'none',
                fontFamily: 'inherit',
                fontSize,
                color: 'var(--color-text-primary)',
                lineHeight: 1.4,
              }}
            />
          ) : (
            <div
              style={{
                fontSize,
                color: 'var(--color-text-primary)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                lineHeight: 1.4,
                overflow: 'auto',
                flex: 1,
              }}
            >
              {text}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
