import React, { useRef, useState } from 'react';

/**
 * Numeric input that keeps the typed text while focused and commits on blur
 * (the global Enter handler blurs inputs). Escape reverts. `onCommit(rawText)`
 * is only called when the text changed; the caller parses and validates, and
 * an ignored commit simply shows `displayValue` again.
 */
export default function DraftNumberInput({ displayValue, onCommit, onFocus, onBlur, onKeyDown, ...inputProps }) {
  const [draft, setDraft] = useState(null);
  const cancelRef = useRef(false);
  const shown = String(displayValue ?? '');

  return (
    <input
      type="number"
      {...inputProps}
      value={draft !== null ? draft : shown}
      onFocus={(e) => {
        setDraft(shown);
        onFocus?.(e);
      }}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          cancelRef.current = true;
          e.currentTarget.blur();
        }
        onKeyDown?.(e);
      }}
      onBlur={(e) => {
        const text = draft;
        setDraft(null);
        if (!cancelRef.current && text !== null && text !== shown) onCommit(text);
        cancelRef.current = false;
        onBlur?.(e);
      }}
    />
  );
}
