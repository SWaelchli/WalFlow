import { useEffect } from 'react';

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
      const activeEl = document.activeElement;
      const isInputActive =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.tagName === 'SELECT' ||
          activeEl.isContentEditable);

      if (isInputActive) {
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
