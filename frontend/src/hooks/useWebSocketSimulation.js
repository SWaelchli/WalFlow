import { useRef, useState, useEffect, useCallback } from 'react';

/**
 * Custom hook managing WebSocket connection to FastAPI backend
 * and simulation message dispatches with Dual-Pass Telemetry support.
 */
export function useWebSocketSimulation({ nodes, edges, setNodes, setEdges, globalSettings, cases = [], activeCaseId = 'case_base', onUpdateCaseTelemetry }) {
  const ws = useRef(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [lastStats, setLastStats] = useState(null);

  // Dual-Pass Telemetry States
  const [telemetryMode, setTelemetryMode] = useState('mitigated'); // 'mitigated' | 'unmitigated_global'
  const [hasPsv, setHasPsv] = useState(false);
  const [telemetryMitigated, setTelemetryMitigated] = useState(null);
  const [telemetryUnmitigated, setTelemetryUnmitigated] = useState(null);

  const applyTelemetryToGraph = useCallback((telemetryData) => {
    if (!telemetryData) return;

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
  }, [setNodes, setEdges]);

  // Re-apply active telemetry dataset when telemetryMode changes
  useEffect(() => {
    const activeDataset = telemetryMode === 'unmitigated_global' ? telemetryUnmitigated : telemetryMitigated;
    if (activeDataset) {
      applyTelemetryToGraph(activeDataset);
    }
  }, [telemetryMode, telemetryMitigated, telemetryUnmitigated, applyTelemetryToGraph]);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/simulate`;

    const socket = new WebSocket(wsUrl);
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
        if (response.status === 'success') {
          setIsSimulating(false);
          const mitData = response.telemetry || response.data || {};
          const unmitData = response.telemetry_unmitigated || mitData;
          const psvPresent = Boolean(response.has_psv);
          const kpisData = response.kpis || null;

          setLastStats(response.stats);
          setHasPsv(psvPresent);
          setTelemetryMitigated(mitData);
          setTelemetryUnmitigated(unmitData);

          if (onUpdateCaseTelemetry && activeCaseId) {
            onUpdateCaseTelemetry(activeCaseId, mitData, kpisData, unmitData);
          }

          const activeDataset = telemetryMode === 'unmitigated_global' ? unmitData : mitData;
          applyTelemetryToGraph(activeDataset);

        } else if (response.status === 'error') {
          setIsSimulating(false);
          alert(`Simulation Engine Error: ${response.message}`);
        } else {
          setIsSimulating(false);
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
  }, [activeCaseId, applyTelemetryToGraph, onUpdateCaseTelemetry, telemetryMode]);

  const runSimulation = useCallback(() => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      setIsSimulating(true);
      ws.current.send(
        JSON.stringify({
          action: 'run_simulation',
          graph: {
            nodes,
            edges,
            global_settings: globalSettings,
            cases,
            active_case_id: activeCaseId
          },
        })
      );
    }
  }, [nodes, edges, globalSettings, cases, activeCaseId]);

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
    telemetryMode,
    setTelemetryMode,
    hasPsv,
    telemetryMitigated,
    telemetryUnmitigated
  };
}
