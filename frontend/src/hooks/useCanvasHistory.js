import { useRef, useCallback } from 'react';

/**
 * Custom hook for canvas undo/redo stack management
 */
export function useCanvasHistory({ setNodes, setEdges, setSelectedNode, setSelectedEdge, handleRotation, handleValveChange }) {
  const historyStack = useRef([]);
  const historyIndex = useRef(-1);
  const isRestoringHistory = useRef(false);

  const pushHistorySnapshot = useCallback((nodesState, edgesState) => {
    if (isRestoringHistory.current) return;
    const cleanNodes = (nodesState || []).map(({ data, ...rest }) => {
      const { telemetry: _telemetry, onRotate: _onRotate, onChange: _onChange, ...restData } = data || {};
      return { ...rest, data: restData };
    });
    const cleanEdges = (edgesState || []).map(({ data, ...rest }) => {
      const { telemetry: _telemetry, ...restData } = data || {};
      return { ...rest, data: restData };
    });

    const snapshot = {
      nodes: JSON.parse(JSON.stringify(cleanNodes)),
      edges: JSON.parse(JSON.stringify(cleanEdges)),
    };

    const newStack = historyStack.current.slice(0, historyIndex.current + 1);
    newStack.push(snapshot);
    if (newStack.length > 50) newStack.shift();

    historyStack.current = newStack;
    historyIndex.current = newStack.length - 1;
  }, []);

  const undo = useCallback(() => {
    if (historyIndex.current > 0) {
      historyIndex.current -= 1;
      const snapshot = historyStack.current[historyIndex.current];
      if (snapshot) {
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
      }
    }
  }, [handleRotation, handleValveChange, setNodes, setEdges, setSelectedNode, setSelectedEdge]);

  const redo = useCallback(() => {
    if (historyIndex.current < historyStack.current.length - 1) {
      historyIndex.current += 1;
      const snapshot = historyStack.current[historyIndex.current];
      if (snapshot) {
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
      }
    }
  }, [handleRotation, handleValveChange, setNodes, setEdges, setSelectedNode, setSelectedEdge]);

  return {
    pushHistorySnapshot,
    undo,
    redo,
  };
}
