import { useRef, useState, useEffect, useCallback } from 'react';

/**
 * Custom hook managing WebSocket connection to FastAPI backend
 * and simulation message dispatches.
 */
export function useWebSocketSimulation({ nodes, edges, setNodes, setEdges, globalSettings }) {
  const ws = useRef(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [lastStats, setLastStats] = useState(null);

  useEffect(() => {
    const socket = new WebSocket('ws://localhost:8000/ws/simulate');
    ws.current = socket;

    socket.onopen = () => {
      setIsConnected(true);
    };

    socket.onclose = () => {
      setIsConnected(false);
      setIsSimulating(false);
    };

    socket.onerror = (error) => {
      console.error('WebSocket Error:', error);
      setIsConnected(false);
      setIsSimulating(false);
    };

    socket.onmessage = (event) => {
      try {
        const response = JSON.parse(event.data);
        if (response.type === 'simulation_results') {
          setIsSimulating(false);
          const telemetryData = response.data;
          setLastStats(response.stats);

          // Update nodes telemetry
          setNodes((nds) =>
            nds.map((node) => {
              if (telemetryData.nodes && telemetryData.nodes[node.id]) {
                return {
                  ...node,
                  data: {
                    ...node.data,
                    telemetry: telemetryData.nodes[node.id],
                  },
                };
              }
              return node;
            })
          );

          // Update edges telemetry
          setEdges((eds) =>
            eds.map((edge) => {
              if (telemetryData.edges && telemetryData.edges[edge.id]) {
                return {
                  ...edge,
                  data: {
                    ...edge.data,
                    telemetry: telemetryData.edges[edge.id],
                  },
                };
              }
              return edge;
            })
          );
        }
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
        setIsSimulating(false);
      }
    };

    return () => {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    };
  }, [setNodes, setEdges]);

  const runSimulation = useCallback(() => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      setIsSimulating(true);
      ws.current.send(
        JSON.stringify({
          action: 'run_simulation',
          graph: { nodes, edges, global_settings: globalSettings },
        })
      );
    }
  }, [nodes, edges, globalSettings]);

  const handleValveChange = useCallback(
    (newValue, nodeId) => {
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(
          JSON.stringify({
            action: 'update_valve',
            value: parseFloat(newValue),
            node_id: nodeId,
          })
        );
      }
      setNodes((nds) =>
        nds.map((node) =>
          node.id === nodeId ? { ...node, data: { ...node.data, opening: newValue } } : node
        )
      );
    },
    [setNodes]
  );

  return {
    ws,
    isSimulating,
    isConnected,
    lastStats,
    runSimulation,
    handleValveChange,
  };
}
