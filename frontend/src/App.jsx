import ReactFlow, { 
  Background, 
  Controls, 
  ControlButton, 
  useNodesState, 
  useEdgesState, 
  addEdge, 
  applyEdgeChanges,
  ReactFlowProvider
} from 'reactflow';
import { notify, confirmDialog } from './utils/dialogs';
import { validateNetwork, checkNewConnection, PORT_TAKEN_MESSAGE } from './utils/networkValidation';
import { summarizeStats, deriveRunState } from './utils/runStatus';
import RunBanners from './components/overlays/RunBanners';
import 'reactflow/dist/style.css'; 
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import axios from 'axios';

import TankNode from './nodes/TankNode';
import CentrifugalPumpNode from './nodes/CentrifugalPumpNode';
import VolumetricPumpNode from './nodes/VolumetricPumpNode';
import OrificeNode from './nodes/OrificeNode';
import LinearControlValveNode from './nodes/LinearControlValveNode';
import LinearRegulatorNode from './nodes/LinearRegulatorNode';
import FilterNode from './nodes/FilterNode';
import HeatExchangerNode from './nodes/HeatExchangerNode';
import SplitterNode from './nodes/SplitterNode';
import MixerNode from './nodes/MixerNode';
import MeasurePointNode from './nodes/MeasurePointNode';
import InstrumentNode from './nodes/InstrumentNode';
import RemoteControlValveNode from './nodes/RemoteControlValveNode';
import ThreeWayTCVNode from './nodes/ThreeWayTCVNode';
import CheckValveNode from './nodes/CheckValveNode';
import CheckValveOrificeNode from './nodes/CheckValveOrificeNode';
import PressureSafetyValveNode from './nodes/PressureSafetyValveNode';
import RuptureDiscNode from './nodes/RuptureDiscNode';
import TextBubbleNode from './nodes/TextBubbleNode';
import CalibratedRestrictionNode from './nodes/CalibratedRestrictionNode';
import ReducerNode from './nodes/ReducerNode';
import PressureSourceNode from './nodes/PressureSourceNode';
import FlowSourceNode from './nodes/FlowSourceNode';


import Navbar from './components/layout/Navbar';
import CollabNotice from './components/CollabNotice';
import Sidebar from './components/panels/Sidebar';
import InspectorPanel from './components/panels/InspectorPanel';
import DataList from './components/panels/DataList';

import PipeEdge from './edges/PipeEdge';
import SignalEdge from './edges/SignalEdge';
import { PipeClassesPage, HelpInfoModal, LoginModal, ProjectManagerModal, AdminSetupModal, AdminHubModal, SaveAsModal, NewDrawingModal, LazyModal, LazyPage } from './components/common/LazyModal';
import HeatmapLegend from './components/overlays/HeatmapLegend';

import CanvasLoadingOverlay from './components/overlays/CanvasLoadingOverlay';
import { FlameIcon, CaseIcon, HelpIcon, InboxIcon, CrossIcon } from './components/symbols/IconLibrary';
import CaseManager from './components/overlays/CaseManager';
import { AuthProvider } from './context/AuthProvider';
import { useAuth } from './hooks/useAuth';
import { UnitProvider, useUnits } from './context/UnitContext';

import { useWebSocketSimulation } from './hooks/useWebSocketSimulation';
import { useCanvasHistory } from './hooks/useCanvasHistory';
import { getDefaultPipeData, DEFAULT_PIPE_LENGTH_M } from './utils/pipeDefaults';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useAutoSaveSession } from './hooks/useAutoSaveSession';
import { HEAT_EXCHANGER_DEFAULTS } from './utils/equipmentDefaults';
import { serializeDiagram, toSolverGraph, checkDiagramFile, stripResults } from './utils/diagramFile';
import { computeCaseInputHashes, isCaseResultStale } from './utils/resultHash';
import { solverMessageKey } from './utils/graphSignature';
import { mapCached } from './utils/itemMemo';
import { useHeatmapSettings } from './hooks/useHeatmapSettings';
import { usePipeClasses } from './hooks/usePipeClasses';
import { useFittingStandards } from './hooks/useFittingStandards';
import { useCanvasLoading } from './hooks/useCanvasLoading';
import { useModalManager } from './hooks/useModalManager';
import { useOperatingCases } from './hooks/useOperatingCases';
import { defaultNodeData } from './utils/nodeDefaults';
import { DEFAULT_DRAWING_SETTINGS, migrateDrawingSettings, withEffectiveSolver } from './utils/settingsLevels';
import useSettingsLevels from './hooks/useSettingsLevels';
import { nextAutoTag } from './utils/autoTag';
import { splitEdgeWithTap, canInsertTap } from './utils/insertTap';
import { readInstruments, defaultInstrumentData } from './utils/instrumentReadings';
import CanvasContextMenu from './components/canvas/CanvasContextMenu';
import EmptyCanvasHint from './components/canvas/EmptyCanvasHint';

import { APP_VERSION, FILE_FORMAT_VERSION, FILE_EXTENSION } from './constants';
import { DEFAULT_BASE_CASE, isCaseVariableProperty } from './constants/case_constants';
import {
  getEffectiveNodeData,
  getEffectiveEdgeData,
  getCaseTelemetrySet,
  getActiveCase,
  hasActiveOverrides,
  updateCaseOverride
} from './utils/case_resolver';

// Import Examples
import exampleAPI614 from './data/examples/Example_API_614_LOS.wlf';
import exampleAPI682 from './data/examples/Example_API_682_Seal_Flush.wlf';
import exampleChilledWater from './data/examples/Example_Chilled_Water_Loop.wlf';
import examplePressureReg from './data/examples/Example_Pressure_Regulation.wlf';
import exampleThermal from './data/examples/Example_Thermal_Management.wlf';
import examplePumpComp from './data/examples/Example_Pump_Comparison.wlf';
import exampleRemoteControl from './data/examples/Example_Remote_Control.wlf';
import exampleParallelPumps from './data/examples/Example_Parallel_Pumps.wlf';
import exampleLargeNetwork from './data/examples/Example_Large_Reference_Network.wlf';
import exampleMultiPsv from './data/examples/Example_Multi_PSV_Protection.wlf';
import greetingCanvas from './data/GreetingCanvas.wlf';

const nodeTypes = {
  tank: TankNode,
  pump: CentrifugalPumpNode, // Legacy support
  centrifugal_pump: CentrifugalPumpNode,
  volumetric_pump: VolumetricPumpNode,
  orifice: OrificeNode,
  linear_control_valve: LinearControlValveNode,
  check_valve: CheckValveNode,
  check_valve_orifice: CheckValveOrificeNode,
  pressure_safety_valve: PressureSafetyValveNode,
  psv: PressureSafetyValveNode,
  rupture_disc: RuptureDiscNode,
  linear_regulator: LinearRegulatorNode,
  filter: FilterNode,
  heat_exchanger: HeatExchangerNode,
  splitter: SplitterNode,
  mixer: MixerNode,
  measure_point: MeasurePointNode,
  instrument: InstrumentNode,
  remote_control_valve: RemoteControlValveNode,
  three_way_tcv: ThreeWayTCVNode,
  text_bubble: TextBubbleNode,
  calibrated_restriction: CalibratedRestrictionNode,
  reducer: ReducerNode,
  expander: ReducerNode,
  pressure_source: PressureSourceNode,
  flow_source: FlowSourceNode,

};

const edgeTypes = {
  pipe: PipeEdge,
  default: PipeEdge,
  signal: SignalEdge,
};

const KNOWN_NODE_TYPES = new Set(Object.keys(nodeTypes));

const getId = () => `node_${crypto.randomUUID().split('-')[0]}`;
const getEdgeId = () => `edge_${crypto.randomUUID().split('-')[0]}`;

const getNextLabelNumber = (edges) => {
  let maxNum = 99; // Default starting from 100
  edges.forEach(edge => {
    const label = edge.data?.label || edge.label || '';
    const match = label.match(/(?:Pipe|Signal)\s+(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) {
        maxNum = num;
      }
    }
  });
  return maxNum + 1;
};

function WalFlowContent() {
  const { currentUser, isAuthenticated, adminStatus } = useAuth();
  const reactFlowWrapper = useRef(null);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const fitViewPendingRef = useRef(false);
  
  const [selectedNode, setSelectedNode] = useState(null);
  const [inspectorTab, setInspectorTab] = useState('setup');
  const [selectedEdge, setSelectedEdge] = useState(null);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges] = useEdgesState([]);
  const {
    isHelpModalOpen, helpModalInitialTab, isAuthModalOpen, isProjectManagerModalOpen, isAdminHubOpen,
    isSaveAsModalOpen, isNewDrawingModalOpen, activeModal, projectManagerProjectId,
    handleOpenHelpModal, handleCloseModal, handleOpenAdminHub, handleOpenAuthModal,
    handleOpenSaveAsModal, handleOpenNewDrawingModal, handleOpenProjectManagerModal,
  } = useModalManager();

  // Active Cloud Project & Auto-Save Session Hook
  const [activeProject, setActiveProject] = useState(null);
  const [activeDiagram, setActiveDiagram] = useState(null);
  const [showRestoredToast, setShowRestoredToast] = useState(false);

  // Routing State (/ vs /pipes)
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    const handlePopState = () => setCurrentPath(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = useCallback((path) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
  }, []);

  const { fetchPipeClasses, availablePipeClasses, allowCustomPipes } = usePipeClasses(activeProject);
  // Load the fitting catalogs (database) early: new pipes and reducers take their sizes from them
  useFittingStandards('pipe_schedule');
  useFittingStandards('reducer');


  const { isCanvasLoading, canvasLoadingLabel, showCanvasLoading, hideCanvasLoading, scheduleLoad } = useCanvasLoading({ nodes, edges });

  // F3-08: frame the diagram after a load, an example or a new drawing
  useEffect(() => {
    if (!fitViewPendingRef.current || !reactFlowInstance) return;
    fitViewPendingRef.current = false;
    requestAnimationFrame(() => reactFlowInstance.fitView({ padding: 0.2, duration: 250, maxZoom: 1.2 }));
  }, [nodes, reactFlowInstance]);

  // Reset active cloud project when user switches accounts or logs out
  const prevUserIdRef = useRef(currentUser?.id);
  useEffect(() => {
    // Only reset if we transition from a valid user to a different user, or to logged out.
    // This prevents resetting activeProject and activeDiagram on initial boot when the user session hydrates.
    if (prevUserIdRef.current && prevUserIdRef.current !== currentUser?.id) {
      setActiveProject(null);
      setActiveDiagram(null);
    }
    prevUserIdRef.current = currentUser?.id;
  }, [currentUser?.id]);

  const {
    cases, setCases, activeCaseId, setActiveCaseId, showCaseManager, setShowCaseManager,
    handleAddCase, handleRenameCase, handleDeleteCase, handleReorderCases, handleResetCaseOverride, handleSetCaseOverride,
    handleUpdateCaseTelemetry, batchStats, handleBatchResultsTelemetry,
  } = useOperatingCases({ nodes });

  const { unitSystem, setUnitSystem } = useUnits();
  const dragCounter = useRef(0);
  const [isFileDragging, setIsFileDragging] = useState(false);

  const clipboardRef = useRef({ nodes: [], edges: [] });
  const [globalSettings, setGlobalSettings] = useState(DEFAULT_DRAWING_SETTINGS);
  const {
    userSettings,
    updateUserSolver,
    projectSettings,
    updateProjectSettings
  } = useSettingsLevels({
    isAuthenticated,
    activeProjectId: activeProject?.id || null,
    unitSystem,
    setUnitSystem
  });
  // Solver settings in force (Drawing > Project > Global): what the solver and the result hash see
  const effectiveGlobalSettings = useMemo(
    () => withEffectiveSolver(globalSettings, { project: projectSettings, user: userSettings }),
    [globalSettings, projectSettings, userSettings]
  );
  const [autoRunPending, setAutoRunPending] = useState(false);


  const {
    saveStatus,
    lastSavedTimestamp,
    restoredDraftTime,
    clearLocalDraft,
    loadLocalDraftOnBoot,
    offerOrphanDraft,
    triggerManualCloudSave,
    lockInfo,
    isLockedByOther,
    hasLock,
    checkoutDiagram,
    checkinDiagram,
    collabNotice,
    dismissCollabNotice
  } = useAutoSaveSession({
    nodes,
    edges,
    globalSettings,
    cases,
    activeCaseId,
    reactFlowInstance,
    isAuthenticated,
    activeProject,
    setActiveProject,
    activeDiagram,
    setActiveDiagram
  });

  // Global UI Body Fix
  useEffect(() => {
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.overflow = 'hidden';
    document.body.style.width = '100vw';
    document.body.style.height = '100vh';
  }, []);

  const handleRotation = useCallback((nodeId) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          const currentRotation = node.data.rotation || 0;
          const nextRotation = (currentRotation + 90) % 360;
          return { ...node, data: { ...node.data, rotation: nextRotation } };
        }
        return node;
      })
    );
  }, [setNodes]);

  const {
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
    runErrorId,
    loginRequired
  } = useWebSocketSimulation({
    nodes,
    edges,
    globalSettings: effectiveGlobalSettings,
    cases,
    activeCaseId,
    onUpdateCaseTelemetry: handleUpdateCaseTelemetry
  });

  // F3-04 / F2-19: model checks before a run. Errors block it, warnings are only listed in the status panel.
  const validation = useMemo(() => validateNetwork({ nodes, edges }, KNOWN_NODE_TYPES), [nodes, edges]);
  const [statusPanelOpen, setStatusPanelOpen] = useState(false);
  const closeStatusPanel = useCallback(() => setStatusPanelOpen(false), []);
  const toggleStatusPanel = useCallback(() => setStatusPanelOpen(open => !open), []);

  const runChecked = useCallback((options) => {
    if (validation.errors.length > 0) {
      // An automatic run after loading stays quiet; the chip shows the count
      if (options?.silent !== true) {
        setStatusPanelOpen(true);
        notify(`Simulation not started: ${validation.errors.length} error${validation.errors.length > 1 ? 's' : ''} in the model. See the status panel.`, 'error');
      }
      return false;
    }
    return runSimulation(options);
  }, [validation, runSimulation]);

  // After a diagram is loaded, solve it once the solver is connected (results are never stored in files)
  useEffect(() => {
    if (!autoRunPending || !isConnected) return;
    setAutoRunPending(false);
    runChecked({ silent: true });
  }, [autoRunPending, isConnected, runChecked]);

  // F2-07: hash of the inputs each case is solved from, and whether its stored results still match
  const caseInputHashes = useMemo(
    () => computeCaseInputHashes({ nodes, edges, globalSettings: effectiveGlobalSettings, cases }),
    [nodes, edges, effectiveGlobalSettings, cases]
  );
  const activeCaseObj = useMemo(() => getActiveCase(cases, activeCaseId), [cases, activeCaseId]);
  const resultsStale = isCaseResultStale(activeCaseObj, caseInputHashes);
  const unmitigatedTelemetry = getCaseTelemetrySet(activeCaseObj, 'unmitigated_global');
  const runSummary = useMemo(() => summarizeStats(lastStats), [lastStats]);
  const runStatus = useMemo(
    () => deriveRunState({ isConnected, loginRequired, isSimulating, stats: lastStats, runError, resultsStale }),
    [isConnected, loginRequired, isSimulating, lastStats, runError, resultsStale]
  );

  // History stack hook
  // A cloud drawing that is open but not checked out by this user
  const isReadOnly = !!activeDiagram && !hasLock;
  const blockIfReadOnly = useCallback(() => {
    if (!isReadOnly) return false;
    notify("This drawing is read-only. Please check out the drawing to edit.", 'warning');
    return true;
  }, [isReadOnly]);

  const { requestSnapshot, resetHistory, undo, redo } = useCanvasHistory({
    nodes,
    edges,
    isReadOnly,
    setNodes,
    setEdges,
    setSelectedNode,
    setSelectedEdge,
    handleRotation,
    handleValveChange,
  });

  // Copy / Paste / Actions
  const copySelected = useCallback(() => {
    const selectedNodesList = nodes.filter((n) => n.selected || (selectedNode && n.id === selectedNode.id));
    const selectedNodeIds = new Set(selectedNodesList.map((n) => n.id));
    const selectedEdgesList = edges.filter(
      (e) => e.selected || (selectedEdge && e.id === selectedEdge.id) || (selectedNodeIds.has(e.source) && selectedNodeIds.has(e.target))
    );

    if (selectedNodesList.length > 0 || selectedEdgesList.length > 0) {
      const cleanNodes = selectedNodesList.map(({ data, ...rest }) => {
        const { telemetry: _telemetry, onRotate: _onRotate, onChange: _onChange, ...restData } = data || {};
        return { ...rest, data: restData };
      });
      const cleanEdges = selectedEdgesList.map(({ data, ...rest }) => {
        const { telemetry: _telemetry, ...restData } = data || {};
        return { ...rest, data: restData };
      });
      clipboardRef.current = {
        nodes: JSON.parse(JSON.stringify(cleanNodes)),
        edges: JSON.parse(JSON.stringify(cleanEdges)),
      };
    }
  }, [nodes, edges, selectedNode, selectedEdge]);

  const pasteCopied = useCallback(() => {
    const copiedNodes = clipboardRef.current.nodes;
    const copiedEdges = clipboardRef.current.edges;
    if (!copiedNodes || copiedNodes.length === 0) return;
    if (blockIfReadOnly()) return;

    const idMap = {};
    const offset = 40;

    const newNodes = copiedNodes.map((n) => {
      const newId = getId();
      idMap[n.id] = newId;

      return {
        ...n,
        id: newId,
        position: {
          x: n.position.x + offset,
          y: n.position.y + offset,
        },
        selected: true,
        data: {
          ...n.data,
          label: n.data?.label ? `${n.data.label}_copy` : `${n.type}_copy`,
          onRotate: handleRotation,
          onChange: (n.type === 'linear_control_valve' || n.type === 'remote_control_valve') ? handleValveChange : undefined,
        },
      };
    });

    const nextNum = getNextLabelNumber(edges);
    const newEdges = (copiedEdges || [])
      .filter((e) => idMap[e.source] && idMap[e.target])
      .map((e, idx) => {
        const isSignal = e.data?.type === 'SIGNAL';
        const labelNum = nextNum + idx;
        const label = isSignal ? `Signal ${labelNum}` : `Pipe ${labelNum}`;
        const newEdgeId = getEdgeId();
        return {
          ...e,
          id: newEdgeId,
          label: label,
          source: idMap[e.source],
          target: idMap[e.target],
          selected: true,
          data: {
            ...e.data,
            label: label,
          },
        };
      });

    setNodes((nds) => nds.map((n) => ({ ...n, selected: false })).concat(newNodes));
    setEdges((eds) => eds.map((e) => ({ ...e, selected: false })).concat(newEdges));
    requestSnapshot();

    if (newNodes.length === 1) {
      setSelectedNode(newNodes[0]);
      setSelectedEdge(null);
    }
  }, [handleRotation, handleValveChange, setNodes, setEdges, edges, requestSnapshot, blockIfReadOnly]);

  const duplicateSelected = useCallback(() => {
    copySelected();
    setTimeout(() => {
      pasteCopied();
    }, 0);
  }, [copySelected, pasteCopied]);

  const deleteSelected = useCallback(() => {
    const selectedNodesList = nodes.filter((n) => n.selected || (selectedNode && n.id === selectedNode.id));
    const selectedEdgesList = edges.filter((e) => e.selected || (selectedEdge && e.id === selectedEdge.id));

    if (selectedNodesList.length === 0 && selectedEdgesList.length === 0) return;
    if (blockIfReadOnly()) return;

    const nodeIdsToDelete = new Set(selectedNodesList.map((n) => n.id));
    const edgeIdsToDelete = new Set(selectedEdgesList.map((e) => e.id));

    const nextNodes = nodes.filter((n) => !nodeIdsToDelete.has(n.id));
    const nextEdges = edges.filter(
      (e) => !edgeIdsToDelete.has(e.id) && !nodeIdsToDelete.has(e.source) && !nodeIdsToDelete.has(e.target)
    );

    setNodes(nextNodes);
    setEdges(nextEdges);
    setSelectedNode(null);
    setSelectedEdge(null);
    requestSnapshot();
  }, [nodes, edges, selectedNode, selectedEdge, setNodes, setEdges, requestSnapshot, blockIfReadOnly]);

  const selectAllNodes = useCallback(() => {
    setNodes((nds) => nds.map((n) => ({ ...n, selected: true })));
    setEdges((eds) => eds.map((e) => ({ ...e, selected: false })));
  }, [setNodes, setEdges]);

  const rotateSelectedNode = useCallback(() => {
    const selectedNodesList = nodes.filter((n) => n.selected || (selectedNode && n.id === selectedNode.id));
    if (selectedNodesList.length > 0) {
      if (blockIfReadOnly()) return;
      selectedNodesList.forEach((n) => handleRotation(n.id));
      requestSnapshot(); // recorded after the rotation is applied
    }
  }, [nodes, selectedNode, handleRotation, requestSnapshot, blockIfReadOnly]);

  // Rotate button on the node itself: same lock check and undo step as the R shortcut
  const rotateNode = useCallback((nodeId) => {
    if (blockIfReadOnly()) return;
    handleRotation(nodeId);
    requestSnapshot();
  }, [handleRotation, requestSnapshot, blockIfReadOnly]);

  const deselectAll = useCallback(() => {
    setNodes((nds) => nds.map((n) => ({ ...n, selected: false })));
    setEdges((eds) => eds.map((e) => ({ ...e, selected: false })));
    setSelectedNode(null);
    setSelectedEdge(null);
  }, [setNodes, setEdges]);

  // Register Keyboard Shortcuts
  useKeyboardShortcuts({
    copySelected,
    pasteCopied,
    duplicateSelected,
    deleteSelected,
    selectAllNodes,
    rotateSelectedNode,
    deselectAll,
    undo,
    redo,
    onSaveShortcut: triggerManualCloudSave,
    onOpenHelp: () => handleOpenHelpModal('shortcuts'),
  });

  // F3-18: right-click menus (components, pipes, empty canvas)
  const [contextMenu, setContextMenu] = useState(null);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const onNodeContextMenu = useCallback((event, node) => {
    event.preventDefault();
    setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === node.id })));
    setEdges((eds) => eds.map((e) => ({ ...e, selected: false })));
    setSelectedNode(node);
    setSelectedEdge(null);
    // Pins an instrument can be wired to: a tap's own pin, or the sensing pins switched on at a component
    const pins = node.type === 'measure_point'
      ? ['inlet-0']
      : Object.entries(node.data?.sensing || {}).filter(([, on]) => on).map(([port]) => port);
    setContextMenu({ x: event.clientX, y: event.clientY, kind: 'node', nodeId: node.id, isTap: node.type === 'measure_point', pins: node.type === 'instrument' ? [] : pins });
  }, [setNodes, setEdges]);

  // Adds a pressure instrument above a component, wired to one of its pins (one undo step)
  const addInstrumentAtPin = useCallback((nodeId, portId) => {
    if (blockIfReadOnly()) return;
    const host = nodes.find(n => n.id === nodeId);
    if (!host) return;
    // Up and to the right of the pin, so the signal line rises and turns into the bubble's left-hand input
    const pinX = host.type === 'measure_point' ? 20 : (portId.startsWith('outlet') ? (host.width || 60) : 0);
    const instrument = {
      id: getId(),
      type: 'instrument',
      position: { x: host.position.x + pinX + 40, y: host.position.y - 110 },
      selected: true,
      data: defaultInstrumentData('P', nodes.map(n => n.data?.label)),
    };
    const label = `Signal ${getNextLabelNumber(edges)}`;
    const signal = {
      id: getEdgeId(),
      source: nodeId,
      sourceHandle: `signal-${portId}`,
      target: instrument.id,
      targetHandle: 'signal-in',
      label,
      animated: true,
      type: 'step',
      style: { stroke: '#fde047', strokeWidth: 3, strokeDasharray: '5,5' },
      data: { label, type: 'SIGNAL' },
    };
    setNodes(nds => nds.map(n => ({ ...n, selected: false })).concat(instrument));
    setEdges(eds => eds.concat(signal));
    setSelectedNode(instrument);
    setSelectedEdge(null);
    requestSnapshot();
  }, [nodes, edges, setNodes, setEdges, requestSnapshot, blockIfReadOnly]);

  const onEdgeContextMenu = useCallback((event, edge) => {
    event.preventDefault();
    setNodes((nds) => nds.map((n) => ({ ...n, selected: false })));
    setEdges((eds) => eds.map((e) => ({ ...e, selected: e.id === edge.id })));
    setSelectedEdge(edge);
    setSelectedNode(null);
    setContextMenu({ x: event.clientX, y: event.clientY, kind: 'edge', edgeId: edge.id, canTap: canInsertTap(edge) });
  }, [setNodes, setEdges]);

  // Splits a pipe at the clicked point with a measurement tap (one undo step)
  const insertTapOnEdge = useCallback((edgeId, screenPoint) => {
    if (blockIfReadOnly() || !reactFlowInstance) return;
    const result = splitEdgeWithTap({
      nodes,
      edges,
      edgeId,
      position: reactFlowInstance.screenToFlowPosition(screenPoint),
      tapId: getId(),
      tapData: defaultNodeData('measure_point', {
        label: nextAutoTag('measure_point', nodes.map(n => n.data?.label)),
        ambientTemperature: globalSettings.ambient_temperature,
        onRotate: handleRotation,
        onChange: handleValveChange,
      }),
      downstreamEdgeId: getEdgeId(),
      downstreamLabel: `Pipe ${getNextLabelNumber(edges)}`,
    });
    if (!result) return;
    setNodes(result.nodes);
    setEdges(result.edges);
    setSelectedNode(result.tap);
    setSelectedEdge(null);
    requestSnapshot();
  }, [nodes, edges, reactFlowInstance, globalSettings.ambient_temperature, handleRotation, handleValveChange, setNodes, setEdges, requestSnapshot, blockIfReadOnly]);

  const onPaneContextMenu = useCallback((event) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, kind: 'pane', canPaste: clipboardRef.current.nodes.length > 0 });
  }, []);

  const contextMenuItems = useMemo(() => {
    if (!contextMenu) return [];
    const locked = isReadOnly;
    if (contextMenu.kind === 'node') {
      const pins = contextMenu.pins || [];
      const instrumentItems = pins.map(port => ({
        id: `add-instrument-${port}`,
        label: contextMenu.isTap ? 'Add instrument' : `Add instrument at ${port.replace('-', ' ')}`,
        disabled: locked,
        onSelect: () => addInstrumentAtPin(contextMenu.nodeId, port),
      }));
      return [
        ...instrumentItems,
        ...(instrumentItems.length ? [{ separator: true }] : []),
        { id: 'rotate', label: 'Rotate', shortcut: 'R', disabled: locked, onSelect: rotateSelectedNode },
        { id: 'copy', label: 'Copy', shortcut: 'Ctrl+C', onSelect: copySelected },
        { id: 'duplicate', label: 'Duplicate', shortcut: 'Ctrl+D', disabled: locked, onSelect: duplicateSelected },
        { separator: true },
        { id: 'delete', label: 'Delete', shortcut: 'Del', disabled: locked, danger: true, onSelect: deleteSelected },
      ];
    }
    if (contextMenu.kind === 'edge') {
      const items = [];
      if (contextMenu.canTap) {
        items.push(
          { id: 'insert-tap', label: 'Insert measurement tap', disabled: locked, onSelect: () => insertTapOnEdge(contextMenu.edgeId, { x: contextMenu.x, y: contextMenu.y }) },
          { separator: true },
        );
      }
      return [...items, { id: 'delete', label: 'Delete pipe', shortcut: 'Del', disabled: locked, danger: true, onSelect: deleteSelected }];
    }
    return [
      { id: 'paste', label: 'Paste', shortcut: 'Ctrl+V', disabled: locked || !contextMenu.canPaste, onSelect: pasteCopied },
      { id: 'select-all', label: 'Select all', shortcut: 'Ctrl+A', onSelect: selectAllNodes },
      { separator: true },
      { id: 'fit', label: 'Fit view', onSelect: () => reactFlowInstance?.fitView({ padding: 0.2, duration: 250, maxZoom: 1.2 }) },
    ];
  }, [contextMenu, isReadOnly, rotateSelectedNode, copySelected, duplicateSelected, deleteSelected, pasteCopied, selectAllNodes, reactFlowInstance, insertTapOnEdge, addInstrumentAtPin]);

  const selectNodeById = useCallback((nodeId) => {
    const targetNode = nodes.find(n => n.id === nodeId);
    if (targetNode) {
      setSelectedNode(targetNode);
      setSelectedEdge(null);
      setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === nodeId })));
      setEdges((eds) => eds.map((e) => ({ ...e, selected: false })));
    }
  }, [nodes, setNodes, setEdges]);

  const selectEdgeById = useCallback((edgeId) => {
    const targetEdge = edges.find(e => e.id === edgeId);
    if (targetEdge) {
      setSelectedEdge(targetEdge);
      setSelectedNode(null);
      setEdges((eds) => eds.map((e) => ({ ...e, selected: e.id === edgeId })));
      setNodes((nds) => nds.map((n) => ({ ...n, selected: false })));
    }
  }, [edges, setNodes, setEdges]);

  const handleSelectComponent = useCallback((id, type) => {
    let selectType = type;
    if (!selectType) {
      selectType = nodes.some(n => n.id === id) ? 'Node' : 'Connection';
    }

    if (selectType === 'Node') {
      selectNodeById(id);
      if (reactFlowInstance) {
        const targetNode = nodes.find(n => n.id === id);
        if (targetNode) {
          const x = targetNode.position.x + (targetNode.width || 80) / 2;
          const y = targetNode.position.y + (targetNode.height || 80) / 2;
          reactFlowInstance.setCenter(x, y, { zoom: 1.2, duration: 800 });
        }
      }
    } else {
      selectEdgeById(id);
      if (reactFlowInstance) {
        const targetEdge = edges.find(e => e.id === id);
        if (targetEdge) {
          const sourceNode = nodes.find(n => n.id === targetEdge.source);
          const targetNode = nodes.find(n => n.id === targetEdge.target);
          if (sourceNode && targetNode) {
            const x = (sourceNode.position.x + targetNode.position.x) / 2;
            const y = (sourceNode.position.y + targetNode.position.y) / 2;
            reactFlowInstance.setCenter(x, y, { zoom: 1.2, duration: 800 });
          }
        }
      }
    }
  }, [nodes, edges, selectNodeById, selectEdgeById, reactFlowInstance]);

  const onEdgesChangeCustom = useCallback(
    (changes) => setEdges((eds) => {
      const nextEdges = applyEdgeChanges(changes, eds);
      return nextEdges.map(e => {
        const isSignal = e.data?.type === 'SIGNAL';
        let style = {};

        if (e.selected) {
          style = { stroke: '#3b82f6', strokeWidth: 3 };
        } else if (isSignal) {
          style = { stroke: '#fde047', strokeWidth: 3, strokeDasharray: '5,5' };
        }

        return { ...e, style };
      });
    }),
    [setEdges]
  );

  // F0-02 / F2-10: one gate for every load path. Returns true when the diagram is accepted.
  const loadData = useCallback((data) => {
    const check = checkDiagramFile(data, KNOWN_NODE_TYPES);
    if (!check.ok) {
      hideCanvasLoading();
      notify(check.message, 'warning');
      return false;
    }
    resetRunState();
    showCanvasLoading();
    scheduleLoad(() => {
      // Results are never loaded from a file (F2-22); old or hand-edited files may still carry them
      const clean = stripResults({ nodes: data.nodes, edges: data.edges, cases: data.cases || [] });
      const seenNodeIds = new Set();
      const restoredNodes = clean.nodes.map((node, idx) => {
        let uniqueId = node.id || `node_${idx}`;
        while (seenNodeIds.has(uniqueId)) {
          uniqueId = `node_${Math.random().toString(36).substring(2, 9)}`;
        }
        seenNodeIds.add(uniqueId);
        return {
          ...node,
          id: uniqueId,
          data: {
            ...node.data,
            rotation: node.data?.rotation || 0,
            onRotate: handleRotation,
            onChange: (node.type === 'linear_control_valve' || node.type === 'remote_control_valve') ? handleValveChange : undefined
          }
        };
      });

      const seenEdgeIds = new Set();
      const restoredEdges = clean.edges.map((edge, idx) => {
        let uniqueId = edge.id || `edge_${idx}`;
        while (seenEdgeIds.has(uniqueId)) {
          uniqueId = `edge_${Math.random().toString(36).substring(2, 9)}`;
        }
        seenEdgeIds.add(uniqueId);
        return {
          ...edge,
          id: uniqueId,
          label: edge.data?.label || uniqueId
        };
      });
      setNodes(restoredNodes);
      setEdges(restoredEdges);
      resetHistory(restoredNodes, restoredEdges);
      fitViewPendingRef.current = true;
      // Settings of the loaded drawing replace the previous ones; old files keep their solver values as a
      // ticked drawing override, and their stored unit system is ignored (display preference of the user, F3-12)
      setGlobalSettings({ ...DEFAULT_DRAWING_SETTINGS, ...migrateDrawingSettings(data.globalSettings || { use_drawing_solver: false }) });
      if (clean.cases.length > 0) {
        setCases(clean.cases);
        setActiveCaseId(data.active_case_id || clean.cases[0].id);
      } else {
        setCases([DEFAULT_BASE_CASE]);
        setActiveCaseId('case_base');
      }
      // Solve the loaded diagram so it opens with results, as soon as the solver is connected
      setAutoRunPending(restoredNodes.length > 0);
    }, 50);
    return true;
  }, [handleValveChange, handleRotation, setNodes, setEdges, setCases, setActiveCaseId, showCanvasLoading, hideCanvasLoading, scheduleLoad, resetHistory, resetRunState]);

  const handleLoadDiagramWithCheck = useCallback(async (data, diagramTitle = '', options = {}) => {
    // Reject a bad file before anything about the open drawing changes (F0-02, F2-10)
    const check = checkDiagramFile(data, KNOWN_NODE_TYPES);
    if (!check.ok) {
      notify(check.message, 'warning');
      return false;
    }
    const hasCloudDiagram = !!activeDiagram?.id;
    if ((activeProject || hasCloudDiagram) && !options.skipProjectCheck) {
      const displayTitle = diagramTitle ? `"${diagramTitle}"` : 'this diagram';
      const cloudTarget = hasCloudDiagram ? `drawing "${activeDiagram.title}"` : `project "${activeProject.title}"`;
      const confirmText = `Are you sure you want to load ${displayTitle}?\n\nNote: This closes the cloud ${cloudTarget} and detaches cloud sync, so the cloud copy is not overwritten.`;

      const proceed = await confirmDialog({
        title: 'Load diagram?',
        message: confirmText,
        confirmLabel: 'Load',
      });
      if (!proceed) return false;

      // Detach cloud sync FIRST (F2-29): save pending edits of the open drawing
      // (serialized now, before the new content loads), then release its lock.
      if (hasCloudDiagram && hasLock) {
        triggerManualCloudSave().finally(() => checkinDiagram());
      }
      setActiveDiagram(null);
      setActiveProject(null);
    } else if (diagramTitle && (options.isTemplate || options.promptConfirmation)) {
      const proceed = await confirmDialog({ title: 'Load example?', message: `Load "${diagramTitle}"?`, confirmLabel: 'Load' });
      if (!proceed) return false;
    }

    return loadData(data);
  }, [activeProject, activeDiagram, hasLock, triggerManualCloudSave, checkinDiagram, setActiveDiagram, loadData]);

  useEffect(() => {
    const applyDraft = (draft) => {
      loadData(draft);
      if (draft.active_project_id && draft.active_project_title) {
        setActiveProject({
          id: draft.active_project_id,
          title: draft.active_project_title,
          description: '',
          updated_at: draft.timestamp || new Date().toISOString()
        });
      }
      if (draft.active_diagram_id && draft.active_diagram_title) {
        setActiveDiagram({
          id: draft.active_diagram_id,
          title: draft.active_diagram_title,
          description: draft.active_diagram_description || ''
        });
      }
      setShowRestoredToast(true);
      setTimeout(() => setShowRestoredToast(false), 5000);
    };

    // This tab's own draft (reload) is restored directly; otherwise a draft left by a closed tab is offered (F2-22)
    const draft = loadLocalDraftOnBoot();
    if (draft) {
      applyDraft(draft);
    } else {
      loadData(greetingCanvas);
      offerOrphanDraft().then((orphan) => { if (orphan) applyDraft(orphan); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onConnect = useCallback((params) => {
    if (activeDiagram && !hasLock) {
      notify("This drawing is read-only. Please check out the drawing to edit.", 'warning');
      return;
    }
    const isSourceSignal = !!params.sourceHandle?.startsWith('signal-');
    const isTargetSignal = !!params.targetHandle?.startsWith('signal-');
    if (isSourceSignal !== isTargetSignal) {
      notify("Cannot connect a signal handle to a hydraulic port.", 'error');
      return;
    }
    const isSignal = isSourceSignal && isTargetSignal;
    // An instrument input reads one pin
    const targetIsInstrument = nodes.some(n => n.id === params.target && n.type === 'instrument');
    if (isSignal && targetIsInstrument && edges.some(e => e.target === params.target && e.targetHandle === params.targetHandle)) {
      notify('This instrument input is already wired. Delete its signal line first.', 'warning');
      return;
    }
    if (!isSignal && !checkNewConnection(edges, params).ok) {
      notify(PORT_TAKEN_MESSAGE, 'warning');
      return;
    }
    const pipeData = isSignal ? {} : getDefaultPipeData(availablePipeClasses, allowCustomPipes);

    setEdges((eds) => {
      const nextNum = getNextLabelNumber(eds);
      const label = isSignal ? `Signal ${nextNum}` : `Pipe ${nextNum}`;
      const newId = getEdgeId();
      
      const newEdge = { 
        ...params, 
        id: newId,
        label: label,
        animated: true, 
        type: isSignal ? 'step' : 'default',
        style: isSignal 
          ? { stroke: '#fde047', strokeWidth: 3, strokeDasharray: '5,5' }
          : {},
        data: {
          label: label,
          type: isSignal ? 'SIGNAL' : 'PIPE',
          length: DEFAULT_PIPE_LENGTH_M,
          ...pipeData
        }
      };
      return addEdge(newEdge, eds);
    });
    requestSnapshot();
  }, [setEdges, edges, nodes, activeDiagram, hasLock, availablePipeClasses, allowCustomPipes, requestSnapshot]);

  // F2-19: a port takes one pipe. The red handle while dragging comes from isValidConnection; the reason is
  // shown when the drag ends on a handle that was refused.
  const refusedConnectionRef = useRef(false);
  const isValidConnection = useCallback((connection) => {
    const ok = checkNewConnection(edges, connection).ok;
    refusedConnectionRef.current = !ok;
    return ok;
  }, [edges]);
  const onConnectStart = useCallback(() => { refusedConnectionRef.current = false; }, []);
  const onConnectEnd = useCallback((event) => {
    const overHandle = event?.target?.closest?.('.react-flow__handle');
    if (refusedConnectionRef.current && overHandle) notify(PORT_TAKEN_MESSAGE, 'warning');
    refusedConnectionRef.current = false;
  }, []);

  const onNodeClick = useCallback((event, node) => {
    setSelectedNode(node);
    setSelectedEdge(null);
  }, []);

  const onEdgeClick = useCallback((event, edge) => {
    setSelectedEdge(edge);
    setSelectedNode(null);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setSelectedEdge(null);
  }, []);

  const updateNodeData = useCallback((nodeId, newData, targetCaseId = null) => {
    if (activeDiagram && !hasLock) {
      notify("This drawing is read-only. Please check out the drawing to edit.", 'warning');
      return;
    }
    const effectiveCaseId = targetCaseId || activeCaseId;
    const targetCaseObj = cases.find(c => c.id === effectiveCaseId) || DEFAULT_BASE_CASE;
    const isBase = targetCaseObj.is_base;

    // The selected node follows `nodes` in an effect, so the updaters below stay free of side effects
    if (isBase) {
      setNodes((nds) =>
        nds.map((node) => (node.id === nodeId ? { ...node, data: { ...node.data, ...newData } } : node))
      );
    } else {
      const caseVarUpdates = {};
      const globalUpdates = {};

      Object.entries(newData).forEach(([key, val]) => {
        if (isCaseVariableProperty(key)) {
          caseVarUpdates[key] = val;
        } else {
          globalUpdates[key] = val;
        }
      });

      if (Object.keys(caseVarUpdates).length > 0) {
        const targetNode = nodesRef.current.find(n => n.id === nodeId);
        setCases(prev => {
          let updatedCases = prev;
          Object.entries(caseVarUpdates).forEach(([key, val]) => {
            const baseValue = targetNode?.data?.[key];
            updatedCases = updateCaseOverride(updatedCases, activeCaseId, nodeId, key, val, baseValue);
          });
          return updatedCases;
        });
      }

      if (Object.keys(globalUpdates).length > 0) {
        setNodes((nds) =>
          nds.map((node) => (node.id === nodeId ? { ...node, data: { ...node.data, ...globalUpdates } } : node))
        );
      }
    }
  }, [activeCaseId, cases, setNodes, setCases, activeDiagram, hasLock]);

  // Canvas valve slider: live-preview the opening on the backend, then store it case-aware
  // (an override in a non-base case) so the case badge shows and the base case stays untouched.
  const handleCanvasValveChange = useCallback((newValue, nodeId) => {
    if (isReadOnly) return; // Controlled slider snaps back; avoids an alert per drag tick
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ action: 'update_valve', value: parseFloat(newValue), node_id: nodeId }));
    }
    updateNodeData(nodeId, { opening: newValue });
  }, [isReadOnly, ws, updateNodeData]);

  const updateEdgeData = useCallback((edgeId, newData) => {
    if (activeDiagram && !hasLock) {
      notify("This drawing is read-only. Please check out the drawing to edit.", 'warning');
      return;
    }
    // The selected pipe follows `edges` in an effect, so this updater stays free of side effects
    setEdges((eds) =>
      eds.map((edge) => (edge.id === edgeId ? {
        ...edge,
        label: newData.label !== undefined ? newData.label : edge.label,
        data: { ...edge.data, ...newData }
      } : edge))
    );
  }, [setEdges, activeDiagram, hasLock]);

  const onDragEnter = useCallback((event) => {
    event.preventDefault();
    dragCounter.current += 1;
    const types = event.dataTransfer.types ? Array.from(event.dataTransfer.types) : [];
    if (types.includes('Files') && !types.includes('application/reactflow')) {
      setIsFileDragging(true);
    }
  }, []);

  const onDragLeave = useCallback((event) => {
    event.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsFileDragging(false);
    }
  }, []);

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      dragCounter.current = 0;
      setIsFileDragging(false);
      
      const type = event.dataTransfer.getData('application/reactflow');
      if (type && activeDiagram && !hasLock) {
        notify("This drawing is read-only. Please check out the drawing to edit.", 'warning');
        return;
      }

      // Check if user dropped a .wlf or .json file onto the canvas
      if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
        const file = event.dataTransfer.files[0];
        if (file.name.endsWith('.wlf') || file.name.endsWith('.json')) {
          const reader = new FileReader();
          reader.onload = (e) => {
            try {
              const parsed = JSON.parse(e.target.result);
              handleLoadDiagramWithCheck(parsed, file.name);
            } catch {
              notify('Failed to parse dropped project file. Please check file format.', 'error');
            }
          };
          reader.readAsText(file);
          return;
        }
      }

      if (!type || !reactFlowInstance) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      
      const newNode = {
        id: getId(),
        type,
        position,
        data: defaultNodeData(type, {
          label: nextAutoTag(type, nodes.map(n => n.data?.label)),
          ambientTemperature: globalSettings.ambient_temperature,
          onRotate: handleRotation,
          onChange: handleValveChange,
        }),
      };

      setNodes((nds) => nds.concat(newNode));
      requestSnapshot();
    },
    [reactFlowInstance, handleValveChange, handleRotation, setNodes, handleLoadDiagramWithCheck, activeDiagram, hasLock, requestSnapshot, nodes, globalSettings.ambient_temperature]
  );

  const onSave = useCallback(() => {
    const flowData = serializeDiagram({ nodes, edges, globalSettings, cases, activeCaseId });
    const blob = new Blob([JSON.stringify(flowData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `walflow-diagram${FILE_EXTENSION}`;
    link.click();
    URL.revokeObjectURL(url);
  }, [nodes, edges, globalSettings, cases, activeCaseId]);

  const onDeleteNode = useCallback((nodeId) => {
    if (activeDiagram && !hasLock) {
      notify("This drawing is read-only. Please check out the drawing to edit.", 'warning');
      return;
    }
    setNodes((nds) => nds.filter((node) => node.id !== nodeId));
    setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    setSelectedNode(null);
    requestSnapshot();
  }, [setNodes, setEdges, activeDiagram, hasLock, requestSnapshot]);

  const onDeleteEdge = useCallback((edgeId) => {
    if (activeDiagram && !hasLock) {
      notify("This drawing is read-only. Please check out the drawing to edit.", 'warning');
      return;
    }
    setEdges((eds) => eds.filter((edge) => edge.id !== edgeId));
    setSelectedEdge(null);
    requestSnapshot();
  }, [setEdges, activeDiagram, hasLock, requestSnapshot]);

  const resetCanvas = useCallback(() => {
    fitViewPendingRef.current = true;
    setNodes([]);
    setEdges([]);
    resetHistory([], []);
    setSelectedNode(null);
    setSelectedEdge(null);
    setCases([DEFAULT_BASE_CASE]);
    setActiveCaseId('case_base');
    setGlobalSettings(DEFAULT_DRAWING_SETTINGS);
    resetRunState();
  }, [setNodes, setEdges, setCases, setActiveCaseId, resetHistory, resetRunState]);

  const handleSaveAs = useCallback(async ({ title, description, project_id }) => {
    try {
      const flowData = serializeDiagram({ nodes, edges, globalSettings, cases, activeCaseId });

      const response = await axios.post('/api/diagrams', {
        title,
        description,
        diagram_data: JSON.stringify(flowData),
        project_id
      });

      setActiveDiagram({
        id: response.data.id,
        title: response.data.title,
        description: response.data.description,
        updated_at: response.data.updated_at
      });

      if (project_id) {
        const projRes = await axios.get(`/api/projects/${project_id}`);
        setActiveProject({
          id: projRes.data.id,
          title: projRes.data.title,
          description: projRes.data.description,
          allowed_pipe_classes: projRes.data.allowed_pipe_classes,
          allow_custom_pipes: projRes.data.allow_custom_pipes !== false
        });
      } else {
        setActiveProject(null);
      }

      notify("Drawing copy saved successfully.", 'success');
    } catch {
      notify("Failed to perform Save As.", 'error');
    }
  }, [nodes, edges, globalSettings, cases, activeCaseId, setActiveDiagram, setActiveProject]);

  const handleCreateNewDrawing = useCallback(async ({ title, description, project_id, isDraft }) => {
    if (isDraft) {
      showCanvasLoading('Creating new drawing…');
      resetCanvas();
      setActiveProject(null);
      setActiveDiagram(null);
      clearLocalDraft();
      notify("New local draft initialized.", 'success');
      return;
    }

    try {
      const blankPayload = {
        version: FILE_FORMAT_VERSION,
        app_version: APP_VERSION,
        format: 'walflow',
        created_at: new Date().toISOString(),
        nodes: [],
        edges: [],
        globalSettings: { ...DEFAULT_DRAWING_SETTINGS },
        cases: [DEFAULT_BASE_CASE],
        active_case_id: 'case_base'
      };

      const response = await axios.post('/api/diagrams', {
        title,
        description,
        diagram_data: JSON.stringify(blankPayload),
        project_id
      });

      setActiveDiagram({
        id: response.data.id,
        title: response.data.title,
        description: response.data.description,
        updated_at: response.data.updated_at
      });

      if (project_id) {
        const projRes = await axios.get(`/api/projects/${project_id}`);
        setActiveProject({
          id: projRes.data.id,
          title: projRes.data.title,
          description: projRes.data.description,
          allowed_pipe_classes: projRes.data.allowed_pipe_classes,
          allow_custom_pipes: projRes.data.allow_custom_pipes !== false
        });
      } else {
        setActiveProject(null);
      }



      loadData(blankPayload);
      notify("New cloud drawing created successfully.", 'success');
    } catch {
      notify("Failed to create new cloud drawing.", 'error');
    }
  }, [resetCanvas, clearLocalDraft, setActiveDiagram, setActiveProject, loadData, showCanvasLoading]);

  // The solver gets the graph again only when something it uses changes (F2-28): not on drag, selection or
  // when results arrive. The key is cheap; the graph itself is read from a ref when the timer fires.
  const solverKey = useMemo(
    () => solverMessageKey({ nodes, edges, globalSettings: effectiveGlobalSettings, cases, activeCaseId }),
    [nodes, edges, effectiveGlobalSettings, cases, activeCaseId]
  );
  const latestGraphRef = useRef(null);
  useEffect(() => {
    latestGraphRef.current = { nodes, edges, globalSettings: effectiveGlobalSettings, cases, activeCaseId };
  });
  useEffect(() => {
    const handler = setTimeout(() => {
      if (isConnected && ws.current && ws.current.readyState === WebSocket.OPEN && latestGraphRef.current) {
        ws.current.send(JSON.stringify({
          action: 'update_graph',
          graph: toSolverGraph(latestGraphRef.current)
        }));
      }
    }, 250);

    return () => clearTimeout(handler);
  }, [solverKey, isConnected, ws]);

  useEffect(() => {
    if (isConnected && ws.current && ws.current.readyState === WebSocket.OPEN && activeDiagram?.id) {
      ws.current.send(JSON.stringify({ 
        action: 'join_diagram', 
        diagram_id: activeDiagram.id 
      }));
    }
  }, [isConnected, activeDiagram?.id, ws]);

  // The inspector shows the selected component and pipe; they follow edits made to the lists
  const nodesRef = useRef(nodes);
  useEffect(() => { nodesRef.current = nodes; });
  useEffect(() => {
    if (selectedNode) {
      const liveNode = nodes.find(n => n.id === selectedNode.id);
      if (liveNode && liveNode !== selectedNode) setSelectedNode(liveNode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes]);
  useEffect(() => {
    if (selectedEdge) {
      const liveEdge = edges.find(e => e.id === selectedEdge.id);
      if (liveEdge && liveEdge !== selectedEdge) setSelectedEdge(liveEdge);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edges]);

  const { heatmapSettings, setHeatmapSettings, computeGlobalHeatmapRange, computedHeatmapRange } = useHeatmapSettings({
    edges, cases, activeCaseId, telemetryMode,
  });

  // Pipes and components that did not change keep their object between renders, so a drag frame re-renders only
  // the moved node (F2-28)
  const [edgeCache] = useState(() => new Map());
  const [nodeCache] = useState(() => new Map());
  // handleCanvasValveChange depends on the node list, so it changes on every drag frame; the nodes get a stable
  // wrapper that always calls the latest version
  const valveChangeRef = useRef(handleCanvasValveChange);
  useEffect(() => { valveChangeRef.current = handleCanvasValveChange; });
  const stableValveChange = useCallback((value, nodeId) => valveChangeRef.current(value, nodeId), []);

  const styledEdges = useMemo(() => {
    const deps = [cases, activeCaseId, telemetryMode, isSimulating, heatmapSettings.mode, computedHeatmapRange.min, computedHeatmapRange.max];
    return mapCached(edges, edgeCache, deps, (edge) => {
      const effectiveData = getEffectiveEdgeData(edge, cases, activeCaseId, telemetryMode);
      const isSignal = edge.data?.type === 'SIGNAL';
      const tele = effectiveData.telemetry || edge.data?.telemetry || {};
      const hasFlow = isSimulating || (tele.inlets?.[0]?.flow_rate && Math.abs(tele.inlets[0].flow_rate) > 1e-5);
      return {
        ...edge,
        type: isSignal ? 'signal' : 'pipe',
        animated: isSignal && hasFlow,
        className: (isSignal && hasFlow) ? 'simulating' : '',
        data: {
          ...edge.data,
          ...effectiveData,
          heatmapMode: heatmapSettings.mode,
          activeRange: computedHeatmapRange,
          isSimulating,
        },
        style: isSignal ? edge.style : {
          ...edge.style,
          stroke: heatmapSettings.mode !== 'default' ? undefined : (hasFlow ? 'var(--color-primary)' : 'var(--color-brand-dark)'),
          strokeWidth: hasFlow ? 3.5 : 2.5,
        }
      };
    });
  }, [edges, edgeCache, cases, activeCaseId, telemetryMode, isSimulating, heatmapSettings.mode, computedHeatmapRange]);

  const interactiveNodes = useMemo(() => {
    return mapCached(nodes, nodeCache, [cases, activeCaseId, telemetryMode, rotateNode, stableValveChange], (node) => {
      const effectiveData = getEffectiveNodeData(node, cases, activeCaseId, telemetryMode);
      const hasOverrides = hasActiveOverrides(node.id, cases, activeCaseId);
      return {
        ...node,
        draggable: true, // Keep constantly true to eliminate click/drag re-render lags
        data: {
          ...node.data,
          ...effectiveData,
          hasCaseOverrides: hasOverrides,
          onRotate: rotateNode,
          onChange: (node.type === 'linear_control_valve' || node.type === 'remote_control_valve') ? stableValveChange : undefined,
        }
      };
    });
  }, [nodes, nodeCache, cases, activeCaseId, telemetryMode, rotateNode, stableValveChange]);

  // Instrument readings of the active case; edited alarm limits apply at once, without a re-run
  const instrumentReadings = useMemo(() => {
    const activeCase = getActiveCase(cases, activeCaseId);
    const atmPa = activeCase?.overrides?.global_settings?.atmospheric_pressure ?? effectiveGlobalSettings.atmospheric_pressure;
    return readInstruments(nodes, edges, getCaseTelemetrySet(activeCase, telemetryMode), atmPa);
  }, [nodes, edges, cases, activeCaseId, telemetryMode, effectiveGlobalSettings.atmospheric_pressure]);

  // An instrument keeps its object while its reading is unchanged, so a drag frame does not re-render it
  const [instrumentCache] = useState(() => new Map());
  const canvasNodes = useMemo(() => interactiveNodes.map((node) => {
    if (node.type !== 'instrument') return node;
    const reading = instrumentReadings.get(node.id) || { value: null, state: null };
    const hit = instrumentCache.get(node.id);
    if (hit && hit.base === node && hit.value === reading.value && hit.state === reading.state) return hit.out;
    const out = { ...node, data: { ...node.data, reading } };
    instrumentCache.set(node.id, { base: node, value: reading.value, state: reading.state, out });
    return out;
  }), [interactiveNodes, instrumentReadings, instrumentCache]);

  const effectiveSelectedNode = useMemo(() => {
    if (!selectedNode) return null;
    const liveNode = nodes.find(n => n.id === selectedNode.id) || selectedNode;
    const effectiveData = getEffectiveNodeData(liveNode, cases, activeCaseId, telemetryMode);
    return {
      ...liveNode,
      data: {
        ...liveNode.data,
        ...effectiveData
      }
    };
  }, [selectedNode, nodes, cases, activeCaseId, telemetryMode]);

  const effectiveSelectedEdge = useMemo(() => {
    if (!selectedEdge) return null;
    const liveEdge = edges.find(e => e.id === selectedEdge.id) || selectedEdge;
    const effectiveData = getEffectiveEdgeData(liveEdge, cases, activeCaseId, telemetryMode);
    return {
      ...liveEdge,
      data: {
        ...liveEdge.data,
        ...effectiveData
      }
    };
  }, [selectedEdge, edges, cases, activeCaseId, telemetryMode]);

  const heatmapActive = heatmapSettings.mode !== 'default';
  const autoScale = heatmapSettings.autoScale;

  // Calculate dynamic top positions to prevent panel overlap on the right side
  let caseManagerTop = '16px';

  if (heatmapActive) {
    if (autoScale) {
      caseManagerTop = '164px';
    } else {
      caseManagerTop = '188px';
    }
  } else {
    caseManagerTop = '16px';
  }

  if (currentPath === '/pipes') {

    return (
      <>
        <LazyPage>
          <PipeClassesPage
            onNavigateToCanvas={() => { fetchPipeClasses(); navigateTo('/'); }}
            onOpenAuthModal={handleOpenAuthModal}
            onOpenAdminHub={handleOpenAdminHub}
            onOpenHelpModal={(tab) => handleOpenHelpModal(tab || 'about')}
          />
        </LazyPage>
        <LazyModal
          as={LoginModal}
          isOpen={isAuthModalOpen}
          onClose={handleCloseModal}
          adminExists={adminStatus.adminExists}
        />
        <LazyModal
          as={AdminHubModal}
          isOpen={isAdminHubOpen}
          onClose={handleCloseModal}
          onLoadDiagram={loadData}
        />
        <LazyModal
          as={HelpInfoModal}
          isOpen={isHelpModalOpen}
          onClose={handleCloseModal}
          initialTab={helpModalInitialTab}
        />


      </>
    );
  }


  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#F0F4F4', overflow: 'hidden' }}>
      <Navbar 
        onCalculate={runChecked}
        isSimulating={isSimulating}
        onOpenAuthModal={handleOpenAuthModal}
        onOpenAdminHub={handleOpenAdminHub}
        onOpenHelpModal={(tab) => handleOpenHelpModal(tab || 'about')}
        onLogoutClear={resetCanvas}
        onNavigateToPipes={() => navigateTo('/pipes')}
        currentRoute={currentPath === '/pipes' ? 'pipes' : 'canvas'}
        cases={cases}
        activeCaseId={activeCaseId}
        onSelectCase={setActiveCaseId}
        activeProject={activeProject}
        activeDiagram={activeDiagram}
        saveStatus={saveStatus}
        lastSavedTimestamp={lastSavedTimestamp}
        isLockedByOther={isLockedByOther}
        onNewDrawing={handleOpenNewDrawingModal}
        onOpenDrawing={() => handleOpenProjectManagerModal(null)}
        onSave={triggerManualCloudSave}
        onSaveAs={handleOpenSaveAsModal}
        onImportFile={() => document.getElementById('sidebar-file-upload').click()}
        onExportFile={onSave}
        runStatus={runStatus}
        lastRunAt={lastRunAt}
        findings={validation}
        statusNotes={runSummary?.notes || []}
        runError={runError}
        statusPanelOpen={statusPanelOpen}
        onToggleStatusPanel={toggleStatusPanel}
        onCloseStatusPanel={closeStatusPanel}
        onSelectFinding={(id, type) => { setStatusPanelOpen(false); handleSelectComponent(id, type); }}
      />


      <div style={{ flexGrow: 1, display: 'flex', height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
        <Sidebar 
          onLoad={handleLoadDiagramWithCheck} 
          globalSettings={globalSettings}
          onUpdateGlobalSettings={setGlobalSettings}
          userSettings={userSettings}
          onUpdateUserSolver={updateUserSolver}
          projectSettings={projectSettings}
          onUpdateProjectSettings={updateProjectSettings}
          lastStats={lastStats}
          batchStats={batchStats}
          onSelectComponent={handleSelectComponent}
          templates={{
            "Getting Started": {
              "Welcome canvas": greetingCanvas
            },
            "Industrial Process Systems": {
              "API 614 Lube Oil System (LOS)": exampleAPI614,
              "API 682 Mechanical Seal Flush": exampleAPI682,
              "Industrial Chilled Water Circuit": exampleChilledWater,
              "Large Reference Network": exampleLargeNetwork
            },
            "Capability Spotlights": {
              "Pressure Regulation: PRV vs BPR": examplePressureReg,
              "Thermal Management & 3-Way TCV": exampleThermal,
              "Centrifugal vs Volumetric Pumping": examplePumpComp,
              "Remote Control & Interlocks": exampleRemoteControl,
              "Parallel Pumping & Min-Flow": exampleParallelPumps,
              "Multi-PSV & Rupture Disc Protection": exampleMultiPsv
            }
          }}
          isAuthenticated={isAuthenticated}
          currentUser={currentUser}
          activeProject={activeProject}
          setActiveProject={setActiveProject}
          activeDiagram={activeDiagram}
          setActiveDiagram={setActiveDiagram}
          saveStatus={saveStatus}
          lastSavedTimestamp={lastSavedTimestamp}
          hasLock={hasLock}
          isLockedByOther={isLockedByOther}
          lockInfo={lockInfo}
          onCheckout={checkoutDiagram}
          onCheckin={checkinDiagram}
           onSaveAsClick={handleOpenSaveAsModal}
           onNewDrawingClick={handleOpenNewDrawingModal}
          onImportClick={() => document.getElementById('sidebar-file-upload').click()}
          onExportClick={onSave}
          onOpenProjectsModal={(projId) => {
            handleOpenProjectManagerModal(projId || null);
          }}

        />

        <input
          id="sidebar-file-upload"
          type="file"
          style={{ display: 'none' }}
          accept=".wlf,.json"
          onChange={(e) => {
            const file = e.target.files[0];
            if (file) {
              const reader = new FileReader();
              reader.onload = (event) => {
                try {
                  const parsed = JSON.parse(event.target.result);
                  handleLoadDiagramWithCheck(parsed, file.name);
                } catch {
                  notify('Failed to load project file. Please ensure it is a valid .wlf or .json file.', 'error');
                }
              };
              reader.readAsText(file);
            }
            e.target.value = '';
          }}
        />

        <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'row', overflow: 'hidden', position: 'relative' }}>
            <div 
              style={{ flexGrow: 1, position: 'relative' }} 
              ref={reactFlowWrapper}
            onDragEnter={onDragEnter}
            onDragLeave={onDragLeave}
          >
          {isFileDragging && (
            <div style={{
              position: 'absolute',
              top: 16,
              left: 16,
              right: 16,
              bottom: 16,
              backgroundColor: 'rgba(15, 23, 42, 0.88)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              zIndex: 9999,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              border: '3px dashed var(--color-primary)',
              borderRadius: '16px',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)',
              pointerEvents: 'none',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
            }}>
              <div style={{ marginBottom: '16px' }}>
                <InboxIcon size={56} color="var(--color-primary)" />
              </div>
              <h2 style={{ color: '#FFFFFF', margin: '0 0 8px 0', fontSize: 'var(--fs-2xl)', fontWeight: '700', letterSpacing: '-0.01em' }}>
                Drop a .wlf file to open it
              </h2>
              <p style={{ color: 'var(--color-text-muted)', margin: 0, fontSize: 'var(--fs-md)', fontWeight: '500' }}>
                Release anywhere on the canvas to load the drawing
              </p>
            </div>
          )}

          <RunBanners
            runError={runError}
            runErrorId={runErrorId}
            summary={runSummary}
            resultKey={lastStats}
            onSelect={handleSelectComponent}
            onOpenStatus={() => setStatusPanelOpen(true)}
          >
            {graphError && (
              <div
                role="status"
                style={{
                  pointerEvents: 'auto', width: '100%', boxSizing: 'border-box',
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '8px 12px', borderRadius: '8px', fontSize: 'var(--fs-sm)', fontWeight: 600,
                  background: '#FEF2F2', border: '1px solid #FEE2E2', color: '#B91C1C',
                  boxShadow: '0 2px 8px rgba(28, 43, 44, 0.12)'
                }}
              >
                <span style={{ flex: 1 }}>{`The solver rejected the last change: ${graphError}`}</span>
              </div>
            )}
          </RunBanners>

          {nodes.length === 0 && !isCanvasLoading && <EmptyCanvasHint />}

          <ReactFlow
            nodes={canvasNodes}
            edges={styledEdges} 
            nodeTypes={nodeTypes} 
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChangeCustom}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            onConnectStart={onConnectStart}
            onConnectEnd={onConnectEnd}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onNodeContextMenu={onNodeContextMenu}
            onEdgeContextMenu={onEdgeContextMenu}
            onPaneContextMenu={onPaneContextMenu}
            onNodesDelete={(deleted) => {
              if (selectedNode && deleted.some(n => n.id === selectedNode.id)) setSelectedNode(null);
              requestSnapshot();
            }}
            onEdgesDelete={(deleted) => {
              if (selectedEdge && deleted.some(e => e.id === selectedEdge.id)) setSelectedEdge(null);
              requestSnapshot();
            }}
            onPaneClick={onPaneClick}
            onInit={setReactFlowInstance}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeDragStop={requestSnapshot}
            nodesDraggable={!activeDiagram || hasLock}
            nodesConnectable={!activeDiagram || hasLock}
            deleteKeyCode={isReadOnly || activeModal ? null : 'Backspace'}
            elementsSelectable={true}
            fitView
          >
            <Background color="#B8C9C8" gap={16} size={1} />
            <Controls>
              <ControlButton 
                onClick={() => setHeatmapSettings(prev => ({ ...prev, mode: prev.mode === 'default' ? 'pressure' : 'default' }))}
                title={heatmapSettings.mode === 'default' ? "Show pressure heatmap" : "Hide pressure heatmap"}
                aria-label="Pressure heatmap"
                aria-pressed={heatmapSettings.mode !== 'default'}
                className={heatmapSettings.mode !== 'default' ? 'active' : ''}
              >
                <FlameIcon size={14} />
              </ControlButton>
              <ControlButton 
                onClick={() => setShowCaseManager(prev => !prev)}
                title={showCaseManager ? "Hide case manager" : "Show case manager"}
                aria-label="Case manager"
                aria-pressed={showCaseManager}
                className={showCaseManager ? 'active' : ''}
              >
                <CaseIcon size={14} />
              </ControlButton>
              <ControlButton 
                onClick={() => handleOpenHelpModal('shortcuts')}
                title="Keyboard shortcuts and help (?)"
                aria-label="Keyboard shortcuts and help"
              >
                <HelpIcon size={14} />
              </ControlButton>
            </Controls>
          </ReactFlow>

  {contextMenu && contextMenuItems.length > 0 && (
    <CanvasContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenuItems} onClose={closeContextMenu} />
  )}

  <LazyModal
    as={HelpInfoModal}
    isOpen={isHelpModalOpen}
    onClose={handleCloseModal}
    initialTab={helpModalInitialTab}
  />

  <LazyModal
    as={LoginModal}
    isOpen={isAuthModalOpen}
    onClose={handleCloseModal}
  />

  <LazyModal
    as={ProjectManagerModal}
    isOpen={isProjectManagerModalOpen}
    onClose={handleCloseModal}
    currentFlowData={{ nodes, edges, globalSettings, cases, activeCaseId }}
    onLoadDiagram={loadData}
    activeProject={activeProject}
    setActiveProject={setActiveProject}
    activeDiagram={activeDiagram}
    setActiveDiagram={setActiveDiagram}
    initialProjectId={projectManagerProjectId}
    showCanvasLoading={showCanvasLoading}
    hideCanvasLoading={hideCanvasLoading}
  />

  <LazyModal
    as={SaveAsModal}
    isOpen={isSaveAsModalOpen}
    onClose={handleCloseModal}
    onSaveAs={handleSaveAs}
    currentTitle={activeDiagram?.title || "Untitled Drawing"}
  />

  <LazyModal
    as={NewDrawingModal}
    isOpen={isNewDrawingModalOpen}
    onClose={handleCloseModal}
    onCreateNew={handleCreateNewDrawing}
  />

          <CollabNotice notice={collabNotice} onDismiss={dismissCollabNotice} />

          {showRestoredToast && (
            <div style={{
                position: 'fixed',
                bottom: '24px',
                right: '24px',
                backgroundColor: 'var(--color-brand-darkest)',
                color: 'var(--color-text-inverse)',
                border: '1px solid var(--color-brand-dark)',
                borderRadius: '12px',
                padding: '12px 18px',
                fontSize: 'var(--fs-base)',
                fontWeight: '600',
                boxShadow: '0 10px 25px rgba(0, 0, 0, 0.4), 0 0 0 1px var(--color-primary-tint)',
                zIndex: 99999,
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                animation: 'walflowToastFadeIn 0.3s ease-out'
              }}>
              <style>
                {`
                  @keyframes walflowToastFadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                  }
                `}
              </style>
              <div style={{ width: '8px', height: '8px', minWidth: '8px', borderRadius: '50%', backgroundColor: 'var(--color-success)', display: 'inline-block' }} />
              <div>
                <div style={{ fontWeight: '700', color: 'var(--color-primary-text)' }}>Restored unsaved drawing</div>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-muted)', fontWeight: '400', marginTop: '1px' }}>
                  {restoredDraftTime ? `Restored workspace saved at ${restoredDraftTime}` : 'Restored previous unsaved workspace'}
                </div>
              </div>
              <button
                onClick={() => setShowRestoredToast(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#B8C9C8',
                  cursor: 'pointer',
                  fontSize: 'var(--fs-md)',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  display: 'inline-flex',
                  alignItems: 'center'
                }}
                aria-label="Dismiss"
              >
                <CrossIcon size={14} />
              </button>
            </div>
          )}

          <LazyModal
            as={AdminSetupModal}
            isOpen={!adminStatus.adminExists}
            onClose={() => {}}
          />

  <LazyModal
    as={AdminHubModal}
    isOpen={isAdminHubOpen}
    onClose={handleCloseModal}
    onLoadDiagram={loadData}
  />

          {showCaseManager && (
            <CaseManager
              cases={cases}
              activeCaseId={activeCaseId}
              onSelectCase={setActiveCaseId}
              telemetryMode={telemetryMode}
              onToggleTelemetryMode={setTelemetryMode}
              onClose={() => setShowCaseManager(false)}
              style={{ top: caseManagerTop }}
            />
          )}

          <HeatmapLegend 
            heatmapMode={heatmapSettings.mode} 
            onModeChange={(mode) => setHeatmapSettings(prev => ({ ...prev, mode }))}
            autoScale={heatmapSettings.autoScale}
            onToggleAutoScale={() => setHeatmapSettings(prev => {
              const nextAutoScale = !prev.autoScale;
              if (!nextAutoScale) {
                const globalRange = computeGlobalHeatmapRange(prev.mode);
                return {
                  ...prev,
                  autoScale: false,
                  customRanges: {
                    ...prev.customRanges,
                    [prev.mode]: globalRange
                  }
                };
              }
              return { ...prev, autoScale: true };
            })}
            globalAutoScale={heatmapSettings.globalAutoScale}
            onToggleGlobalAutoScale={() => setHeatmapSettings(prev => ({ ...prev, globalAutoScale: !prev.globalAutoScale }))}
            activeRange={computedHeatmapRange}
            customRange={heatmapSettings.customRanges[heatmapSettings.mode]}
            onUpdateCustomRange={(min, max) => setHeatmapSettings(prev => ({
              ...prev,
              customRanges: {
                ...prev.customRanges,
                [prev.mode]: { min, max }
              }
            }))}
            onResetCustomRange={() => setHeatmapSettings(prev => {
              const globalRange = computeGlobalHeatmapRange(prev.mode);
              return {
                ...prev,
                customRanges: {
                  ...prev.customRanges,
                  [prev.mode]: globalRange
                }
              };
            })}
          />

          <CanvasLoadingOverlay visible={isCanvasLoading} label={canvasLoadingLabel} />
        </div>

        <InspectorPanel
          key={selectedNode?.id || selectedEdge?.id || 'none'}
          node={selectedNode}
          edge={selectedEdge}
          effectiveNode={effectiveSelectedNode}
          effectiveEdge={effectiveSelectedEdge}
          onUpdate={updateNodeData}
          onUpdateEdge={updateEdgeData}
          onDelete={onDeleteNode}
          onDeleteEdge={onDeleteEdge}
          heatmapActive={heatmapActive}
          cases={cases}
          activeCaseId={activeCaseId}
          onResetCaseOverride={handleResetCaseOverride}
          allNodes={nodes}
          allEdges={styledEdges}
          unmitigatedTelemetry={unmitigatedTelemetry}
          availablePipeClasses={availablePipeClasses}
          allowCustomPipes={allowCustomPipes}
          activeTab={inspectorTab}
          setActiveTab={setInspectorTab}
        />

      </div>

        <DataList 
          nodes={interactiveNodes} 
          edges={styledEdges} 
          rawNodes={nodes}
          rawEdges={edges}
          onUpdateEdge={updateEdgeData} 
          onUpdateNode={updateNodeData}
          onSelectNode={selectNodeById}
          onSelectEdge={selectEdgeById}
          cases={cases}
          activeCaseId={activeCaseId}
          globalSettings={effectiveGlobalSettings}
          onSelectCase={setActiveCaseId}
          onAddCase={handleAddCase}
          onRenameCase={handleRenameCase}
          onDeleteCase={handleDeleteCase}
          onReorderCases={handleReorderCases}
          onBatchResults={handleBatchResultsTelemetry}
          telemetryMode={telemetryMode}
          telemetryUnmitigated={unmitigatedTelemetry}
          caseInputHashes={caseInputHashes}
          onSetCaseOverride={handleSetCaseOverride}
          runSimulation={runChecked}
          showCaseManager={showCaseManager}
          onToggleCaseManager={() => setShowCaseManager(prev => !prev)}
          availablePipeClasses={availablePipeClasses}
          allowCustomPipes={allowCustomPipes}
        />


      </div>
    </div>
  </div>
);
}

export default function App() {
  return (
    <AuthProvider>
      <UnitProvider>
        <ReactFlowProvider>
          <WalFlowContent />
        </ReactFlowProvider>
      </UnitProvider>
    </AuthProvider>
  );
}
