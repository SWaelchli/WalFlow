import { useRef, useCallback, useEffect } from 'react';

const MAX_HISTORY = 50;

// Strips runtime-only data (results, handlers) and deep-copies the canvas state
const toSnapshot = (nodesState, edgesState) => {
  const cleanNodes = (nodesState || []).map(({ data, ...rest }) => {
    const { telemetry: _telemetry, onRotate: _onRotate, onChange: _onChange, ...restData } = data || {};
    return { ...rest, data: restData };
  });
  const cleanEdges = (edgesState || []).map(({ data, ...rest }) => {
    const { telemetry: _telemetry, ...restData } = data || {};
    return { ...rest, data: restData };
  });
  return {
    nodes: JSON.parse(JSON.stringify(cleanNodes)),
    edges: JSON.parse(JSON.stringify(cleanEdges)),
  };
};

/**
 * Custom hook for canvas undo/redo stack management.
 *
 * - `resetHistory(nodes, edges)`: start a new history with the given state as its base
 *   (call after loading a diagram or clearing the canvas).
 * - `requestSnapshot()`: record the canvas once the pending node/edge update has been applied.
 * - `hasEdits()`: true when the canvas was edited since the last load or clear (the undo step is not the base)
 * - `undo` / `redo` do nothing while `isReadOnly` is true.
 */
export function useCanvasHistory({
  nodes,
  edges,
  setNodes,
  setEdges,
  setSelectedNode,
  setSelectedEdge,
  handleRotation,
  handleValveChange,
  isReadOnly = false,
}) {
  const historyStack = useRef([]);
  const historyIndex = useRef(-1);
  const isRestoringHistory = useRef(false);
  const snapshotPending = useRef(false);

  const pushHistorySnapshot = useCallback((nodesState, edgesState) => {
    if (isRestoringHistory.current) return;
    const newStack = historyStack.current.slice(0, historyIndex.current + 1);
    newStack.push(toSnapshot(nodesState, edgesState));
    if (newStack.length > MAX_HISTORY) newStack.shift();

    historyStack.current = newStack;
    historyIndex.current = newStack.length - 1;
  }, []);

  const resetHistory = useCallback((nodesState, edgesState) => {
    snapshotPending.current = false;
    historyStack.current = [toSnapshot(nodesState, edgesState)];
    historyIndex.current = 0;
  }, []);

  const requestSnapshot = useCallback(() => {
    snapshotPending.current = true;
  }, []);

  useEffect(() => {
    if (!snapshotPending.current) return;
    snapshotPending.current = false;
    pushHistorySnapshot(nodes, edges);
  }, [nodes, edges, pushHistorySnapshot]);

  const restoreSnapshot = useCallback((snapshot) => {
    isRestoringHistory.current = true;
    const restoredNodes = snapshot.nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        rotation: node.data.rotation || 0,
        onRotate: handleRotation,
        onChange: (node.type === 'linear_control_valve' || node.type === 'remote_control_valve') ? handleValveChange : undefined,
      },
    }));
    setNodes(restoredNodes);
    setEdges(snapshot.edges);
    setSelectedNode(null);
    setSelectedEdge(null);
    setTimeout(() => {
      isRestoringHistory.current = false;
    }, 50);
  }, [handleRotation, handleValveChange, setNodes, setEdges, setSelectedNode, setSelectedEdge]);

  const undo = useCallback(() => {
    if (isReadOnly || historyIndex.current <= 0) return;
    historyIndex.current -= 1;
    const snapshot = historyStack.current[historyIndex.current];
    if (snapshot) restoreSnapshot(snapshot);
  }, [isReadOnly, restoreSnapshot]);

  const redo = useCallback(() => {
    if (isReadOnly || historyIndex.current >= historyStack.current.length - 1) return;
    historyIndex.current += 1;
    const snapshot = historyStack.current[historyIndex.current];
    if (snapshot) restoreSnapshot(snapshot);
  }, [isReadOnly, restoreSnapshot]);

  const hasEdits = useCallback(() => historyIndex.current > 0, []);

  return {
    pushHistorySnapshot,
    requestSnapshot,
    resetHistory,
    hasEdits,
    undo,
    redo,
  };
}
