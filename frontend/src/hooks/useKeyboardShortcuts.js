import { useEffect } from 'react';

/** F2-18: an open modal owns the keyboard; the canvas shortcuts must not act behind it. */
export const isModalOpen = () => typeof document !== 'undefined' && document.querySelector('.modal-overlay, [role="dialog"], [aria-modal="true"]') !== null;

/** F2-18: text selected on the page (results, tables) is copied natively, not as canvas components. */
export const hasTextSelection = () => {
  const sel = typeof window !== 'undefined' && window.getSelection ? window.getSelection() : null;
  return !!sel && !sel.isCollapsed && sel.toString().trim() !== '';
};

/**
 * Custom hook for keyboard shortcut event listeners
 */
export function useKeyboardShortcuts({
  copySelected,
  pasteCopied,
  duplicateSelected,
  deleteSelected,
  selectAllNodes,
  rotateSelectedNode,
  deselectAll,
  undo,
  redo,
  onSaveShortcut,
}) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        const activeEl = document.activeElement;
        if (
          activeEl &&
          activeEl.tagName === 'INPUT' &&
          !['checkbox', 'radio', 'button', 'submit', 'image', 'reset', 'file', 'range', 'color'].includes(activeEl.type)
        ) {
          activeEl.blur();
          return;
        }
      }

      const activeEl = document.activeElement;
      const isInputActive =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.tagName === 'SELECT' ||
          activeEl.isContentEditable);

      if (isInputActive || isModalOpen()) {
        return;
      }

      const isMod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      // Save: Ctrl + S
      if (isMod && key === 's') {
        e.preventDefault();
        if (onSaveShortcut) onSaveShortcut();
        return;
      }

      // Copy: Ctrl + C
      if (isMod && key === 'c') {
        if (hasTextSelection()) return; // let the browser copy the selected text
        e.preventDefault();
        copySelected();
        return;
      }

      // Paste: Ctrl + V
      if (isMod && key === 'v') {
        e.preventDefault();
        pasteCopied();
        return;
      }

      // Duplicate: Ctrl + D
      if (isMod && key === 'd') {
        e.preventDefault();
        duplicateSelected();
        return;
      }

      // Select All: Ctrl + A
      if (isMod && key === 'a') {
        e.preventDefault();
        selectAllNodes();
        return;
      }

      // Undo: Ctrl + Z
      if (isMod && !e.shiftKey && key === 'z') {
        e.preventDefault();
        undo();
        return;
      }

      // Redo: Ctrl + Y or Ctrl + Shift + Z
      if ((isMod && key === 'y') || (isMod && e.shiftKey && key === 'z')) {
        e.preventDefault();
        redo();
        return;
      }

      // Rotate: R
      if (!isMod && key === 'r') {
        e.preventDefault();
        rotateSelectedNode();
        return;
      }

      // Delete: Delete or Backspace
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelected();
        return;
      }

      // Deselect / Cancel: Escape
      if (e.key === 'Escape') {
        e.preventDefault();
        deselectAll();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    copySelected,
    pasteCopied,
    duplicateSelected,
    deleteSelected,
    selectAllNodes,
    rotateSelectedNode,
    deselectAll,
    undo,
    redo,
    onSaveShortcut,
  ]);
}
