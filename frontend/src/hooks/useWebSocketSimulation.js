import { useRef, useState, useEffect, useCallback } from 'react';
import { notify } from '../utils/dialogs';
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
  // time of the last finished run, so a re-run that changes nothing still shows it happened
  const [lastRunAt, setLastRunAt] = useState(null);
  const [reconnectTrigger, setReconnectTrigger] = useState(0);

  // Dual-Pass Telemetry States
  const [telemetryMode, setTelemetryMode] = useState('mitigated'); // 'mitigated' | 'peak' | 'unmitigated_global'
  const [graphError, setGraphError] = useState(null); // last rejected graph update (shown inline, not as a popup)
  // Last model error of a run, shown as a banner. `id` changes with every new error, so the same text is shown again.
  const [runErrorState, setRunErrorState] = useState({ message: null, id: 0 });
  const setRunError = useCallback((message) => setRunErrorState((prev) => ({ message, id: message ? prev.id + 1 : prev.id })), []);
  const runError = runErrorState.message;
  const [loginRequired, setLoginRequired] = useState(false); // server only lets logged-in users simulate

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
      setLoginRequired(false);
    };

    socket.onclose = (event) => {
      setIsConnected(false);
      setIsSimulating(false);

      if (event.code === 1008) {
        console.warn('WebSocket closed due to policy violation (unauthenticated).');
        setLoginRequired(true);
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

        // Graph pushes (every edit) are answered separately from simulation runs
        if (response.status === 'graph_accepted') {
          setGraphError(null);
          return;
        }
        if (response.status === 'error' && response.context === 'update_graph') {
          setGraphError(response.message);
          return;
        }
        if (response.status === 'error' && response.context === 'join_diagram') {
          // Collaboration needs a login and access to the diagram; simulation works without
          console.warn(`Collaboration updates not available: ${response.message}`);
          return;
        }

        if (response.status === 'success') {
          setIsSimulating(false);
          const mitData = response.telemetry || response.data || {};
          const unmitData = response.telemetry_unmitigated || mitData;
          const peakData = response.telemetry_peak || null;
          const kpisData = response.kpis || null;

          setLastStats(response.stats);
          setLastRunAt(new Date());
          setRunError(null);

          // Results belong to the case and the inputs the run was sent with
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
          pendingRunRef.current = null;
          console.warn(`Simulation not run: ${response.message}`);
          setRunError(response.message || 'The solver reported an error.');
        } else {
          setIsSimulating(false);
        }
      } catch (e) {
        // An unreadable reply must not leave the user waiting without any message
        console.error('Failed to parse WebSocket message:', e);
        setIsSimulating(false);
        pendingRunRef.current = null;
        setRunError('The solver reply could not be read. Please run the simulation again.');
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
  }, [isAuthenticated, reconnectTrigger, setRunError]);

  // options.silent: automatic run after loading a diagram; the "not connected" notice is skipped
  const runSimulation = useCallback((options = {}) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      setIsSimulating(true);
      setRunError(null);
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
      notify(loginRequired
        ? "This server only allows signed-in users to run simulations. Please sign in and try again."
        : "Simulation engine is not connected. Please ensure the backend is running.", 'warning');
    }
    return false;
  }, [nodes, edges, globalSettings, cases, activeCaseId, loginRequired, setRunError]);

  // Live preview of a valve opening on the backend only. The value itself is stored case-aware by the
  // caller (updateNodeData); writing it here would change the base case from inside another case.
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

  // Another drawing replaces the canvas, so the last run no longer describes it
  const resetRunState = useCallback(() => {
    setLastStats(null);
    setLastRunAt(null);
    setRunError(null);
  }, [setRunError]);

  return {
    ws,
    isSimulating,
    isConnected,
    lastStats,
    lastRunAt,
    resetRunState,
    runSimulation,
    handleValveChange,
    telemetryMode,
    setTelemetryMode,
    graphError,
    runError,
    runErrorId: runErrorState.id,
    loginRequired
  };
}
