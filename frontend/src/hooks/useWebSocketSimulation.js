import { useRef, useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import { toSolverGraph } from '../utils/diagramFile';
import { computeCaseInputHash } from '../utils/resultHash';

/**
 * Custom hook managing WebSocket connection to FastAPI backend
 * and simulation message dispatches with Dual-Pass Telemetry support.
 */
export function useWebSocketSimulation({ nodes, edges, globalSettings, cases = [], activeCaseId = 'case_base', onUpdateCaseTelemetry }) {
  const { isAuthenticated } = useAuth();
  const ws = useRef(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [lastStats, setLastStats] = useState(null);
  const [reconnectTrigger, setReconnectTrigger] = useState(0);

  // Dual-Pass Telemetry States
  const [telemetryMode, setTelemetryMode] = useState('mitigated'); // 'mitigated' | 'peak' | 'unmitigated_global'
  const [hasPsv, setHasPsv] = useState(false);
  const [graphError, setGraphError] = useState(null); // last rejected graph update (shown inline, not as a popup)

  // Refs to eliminate socket churn
  const activeCaseIdRef = useRef(activeCaseId);
  const onUpdateCaseTelemetryRef = useRef(onUpdateCaseTelemetry);
  // The run in flight: which case it solves, the hash of the inputs it was sent with, and whether errors stay quiet
  const pendingRunRef = useRef(null);

  useEffect(() => {
    activeCaseIdRef.current = activeCaseId;
    onUpdateCaseTelemetryRef.current = onUpdateCaseTelemetry;
  }, [activeCaseId, onUpdateCaseTelemetry]);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/simulate`;

    let reconnectTimeoutId = null;
    let isCleanClose = false;

    const socket = new WebSocket(wsUrl);
    ws.current = socket;

    socket.onopen = () => {
      setIsConnected(true);
    };

    socket.onclose = (event) => {
      setIsConnected(false);
      setIsSimulating(false);

      if (event.code === 1008) {
        console.warn('WebSocket closed due to policy violation (unauthenticated).');
        return;
      }

      if (!isCleanClose) {
        console.log('WebSocket disconnected unexpectedly. Retrying in 3 seconds...');
        reconnectTimeoutId = setTimeout(() => {
          setReconnectTrigger(prev => prev + 1);
        }, 3000);
      }
    };

    socket.onerror = (error) => {
      console.error('WebSocket Error:', error);
      setIsConnected(false);
      setIsSimulating(false);
    };

    socket.onmessage = (event) => {
      try {
        const response = JSON.parse(event.data);
        
        // Collaboration state sync handler
        if (response.action && ['lock_acquired', 'lock_released', 'diagram_updated'].includes(response.action)) {
          window.dispatchEvent(new CustomEvent('walflow_collab_event', { detail: response }));
          return;
        }

        // Graph pushes (every edit) are answered separately from simulation runs (F2-17)
        if (response.status === 'graph_accepted') {
          setGraphError(null);
          return;
        }
        if (response.status === 'error' && response.context === 'update_graph') {
          setGraphError(response.message);
          return;
        }

        if (response.status === 'success') {
          setIsSimulating(false);
          const mitData = response.telemetry || response.data || {};
          const unmitData = response.telemetry_unmitigated || mitData;
          const peakData = response.telemetry_peak || null;
          const psvPresent = Boolean(response.has_psv);
          const kpisData = response.kpis || null;

          setLastStats(response.stats);
          setHasPsv(psvPresent);

          // Results belong to the case and the inputs the run was sent with (F2-07)
          const run = pendingRunRef.current;
          pendingRunRef.current = null;
          const targetCaseId = run?.caseId || activeCaseIdRef.current;
          if (onUpdateCaseTelemetryRef.current && targetCaseId) {
            onUpdateCaseTelemetryRef.current(targetCaseId, mitData, kpisData, unmitData, peakData, run?.hash);
          }
          if (response.stats?.non_finite_count) {
            console.warn(`Solver returned ${response.stats.non_finite_count} non-finite value(s):`, response.stats.non_finite_fields);
          }

        } else if (response.status === 'error') {
          setIsSimulating(false);
          const run = pendingRunRef.current;
          pendingRunRef.current = null;
          if (run?.silent) {
            console.warn(`Simulation not run: ${response.message}`);
          } else {
            alert(`Simulation Engine Error: ${response.message}`);
          }
        } else {
          setIsSimulating(false);
        }
      } catch (e) {
        // F2-15: an unreadable reply must not leave the user waiting without any message
        console.error('Failed to parse WebSocket message:', e);
        setIsSimulating(false);
        const run = pendingRunRef.current;
        pendingRunRef.current = null;
        if (!run?.silent) alert('The solver reply could not be read. Please run the simulation again.');
      }
    };

    return () => {
      isCleanClose = true;
      if (reconnectTimeoutId) {
        clearTimeout(reconnectTimeoutId);
      }
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    };
  }, [isAuthenticated, reconnectTrigger]);

  // options.silent: automatic run after loading a diagram; model errors are logged instead of shown as alerts
  const runSimulation = useCallback((options = {}) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      setIsSimulating(true);
      pendingRunRef.current = {
        caseId: activeCaseId,
        hash: computeCaseInputHash({ nodes, edges, globalSettings, cases }, activeCaseId),
        silent: options?.silent === true,
      };
      ws.current.send(
        JSON.stringify({
          action: 'run_simulation',
          graph: toSolverGraph({ nodes, edges, globalSettings, cases, activeCaseId }),
        })
      );
      return true;
    }
    if (options?.silent !== true) {
      alert("Simulation engine is not connected. Please ensure the backend is running and you are logged in.");
    }
    return false;
  }, [nodes, edges, globalSettings, cases, activeCaseId]);

  // Live preview of a valve opening on the backend only. The value itself is stored case-aware by the
  // caller (updateNodeData); writing it here would change the base case from inside another case (F2-06).
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
    },
    []
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
    graphError
  };
}
