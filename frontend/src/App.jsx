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
import RemoteControlValveNode from './nodes/RemoteControlValveNode';
import ThreeWayTCVNode from './nodes/ThreeWayTCVNode';
import CheckValveNode from './nodes/CheckValveNode';
import CheckValveOrificeNode from './nodes/CheckValveOrificeNode';
import PressureSafetyValveNode from './nodes/PressureSafetyValveNode';
import RuptureDiscNode from './nodes/RuptureDiscNode';
import TextBubbleNode from './nodes/TextBubbleNode';
import CalibratedRestrictionNode from './nodes/CalibratedRestrictionNode';

import Navbar from './components/layout/Navbar';
import Sidebar from './components/panels/Sidebar';
import InspectorPanel from './components/panels/InspectorPanel';
import DataList from './components/panels/DataList';

import PipeEdge from './edges/PipeEdge';
import SignalEdge from './edges/SignalEdge';
import HeatmapLegend from './components/overlays/HeatmapLegend';
import CanvasLoadingOverlay from './components/overlays/CanvasLoadingOverlay';
import { FlameIcon, CaseIcon, HelpIcon } from './components/symbols/IconLibrary';
import CaseManager from './components/overlays/CaseManager';
import HelpInfoModal from './components/modals/HelpInfoModal';
import LoginModal from './components/modals/LoginModal';
import ProjectManagerModal from './components/modals/ProjectManagerModal';
import AdminSetupModal from './components/modals/AdminSetupModal';
import AdminHubModal from './components/modals/AdminHubModal';
import SaveAsModal from './components/modals/SaveAsModal';
import NewDrawingModal from './components/modals/NewDrawingModal';
import { AuthProvider } from './context/AuthProvider';
import { useAuth } from './hooks/useAuth';

import { useWebSocketSimulation } from './hooks/useWebSocketSimulation';
import { useCanvasHistory } from './hooks/useCanvasHistory';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useAutoSaveSession } from './hooks/useAutoSaveSession';

import { APP_VERSION, FILE_FORMAT_VERSION, FILE_EXTENSION } from './constants';
import { DEFAULT_BASE_CASE, isCaseVariableProperty } from './constants/case_constants';
import {
  getEffectiveNodeData,
  getEffectiveEdgeData,
  updateCaseTelemetry,
  hasActiveOverrides,
  updateCaseOverride,
  removeCaseOverride,
  duplicateCase,
  getActiveCaseScalingInfo,
  getActiveCase
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
  remote_control_valve: RemoteControlValveNode,
  three_way_tcv: ThreeWayTCVNode,
  text_bubble: TextBubbleNode,
  calibrated_restriction: CalibratedRestrictionNode,
};

const edgeTypes = {
  pipe: PipeEdge,
  default: PipeEdge,
  signal: SignalEdge,
};

const getId = () => `node_${crypto.randomUUID().split('-')[0]}`;
const getEdgeId = () => `edge_${crypto.randomUUID().split('-')[0]}`;

const MIN_VISIBLE_MS = 400;
const SAFETY_TIMEOUT_MS = 5000;

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
  
  const [selectedNode, setSelectedNode] = useState(null);
  const [inspectorTab, setInspectorTab] = useState('setup');
  const [selectedEdge, setSelectedEdge] = useState(null);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges] = useEdgesState([]);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [helpModalInitialTab, setHelpModalInitialTab] = useState('shortcuts');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isProjectManagerModalOpen, setIsProjectManagerModalOpen] = useState(false);
  const [isAdminHubOpen, setIsAdminHubOpen] = useState(false);
  const [isSaveAsModalOpen, setIsSaveAsModalOpen] = useState(false);
  const [isNewDrawingModalOpen, setIsNewDrawingModalOpen] = useState(false);
  const [projectManagerProjectId, setProjectManagerProjectId] = useState(null);

  // Active Cloud Project & Auto-Save Session Hook
  const [activeProject, setActiveProject] = useState(null);
  const [activeDiagram, setActiveDiagram] = useState(null);
  const [showRestoredToast, setShowRestoredToast] = useState(false);

  // Canvas loading overlay state
  const [isCanvasLoading, setIsCanvasLoading] = useState(false);
  const [canvasLoadingLabel, setCanvasLoadingLabel] = useState('Opening drawing…');
  const pendingLoadRef = useRef(false);
  const loadStartedAtRef = useRef(0);
  const hideTimerRef = useRef(null);
  const paintFrameRef = useRef(null);
  const loadTimeoutRef = useRef(null);

  const showCanvasLoading = useCallback((label = 'Opening drawing…') => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    if (paintFrameRef.current) {
      cancelAnimationFrame(paintFrameRef.current);
    }
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
    }
    pendingLoadRef.current = true;
    loadStartedAtRef.current = Date.now();
    setCanvasLoadingLabel(label);
    setIsCanvasLoading(true);
    hideTimerRef.current = setTimeout(() => {
      pendingLoadRef.current = false;
      setIsCanvasLoading(false);
    }, SAFETY_TIMEOUT_MS);
  }, []);

  const hideCanvasLoading = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    if (paintFrameRef.current) {
      cancelAnimationFrame(paintFrameRef.current);
    }
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
    }
    pendingLoadRef.current = false;
    setIsCanvasLoading(false);
  }, []);

  useEffect(() => () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    if (paintFrameRef.current) {
      cancelAnimationFrame(paintFrameRef.current);
    }
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
    }
  }, []);

  // Hide the loader once the loaded canvas commits (completion-driven, not a fixed timer).
  // The requestAnimationFrame gate guarantees the loader is included in at least one painted
  // frame before the hide timer starts, so heavy synchronous loads still flash it.
  useEffect(() => {
    if (!pendingLoadRef.current) return;
    pendingLoadRef.current = false;
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    paintFrameRef.current = requestAnimationFrame(() => {
      const elapsed = Date.now() - loadStartedAtRef.current;
      const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);
      hideTimerRef.current = setTimeout(() => setIsCanvasLoading(false), remaining === 0 ? 50 : remaining);
    });
  }, [nodes, edges]);

  // Reset active cloud project when user switches accounts or logs out
  const prevUserIdRef = useRef(currentUser?.id);
  useEffect(() => {
    if (prevUserIdRef.current !== currentUser?.id) {
      prevUserIdRef.current = currentUser?.id;
      setActiveProject(null);
      setActiveDiagram(null);
    }
  }, [currentUser?.id]);

  // Operating Case Manager State
  const [cases, setCases] = useState([DEFAULT_BASE_CASE]);
  const [activeCaseId, setActiveCaseId] = useState('case_base');
  const [showCaseManager, setShowCaseManager] = useState(false);

  const handleAddCase = useCallback(() => {
    const currentActiveCase = cases.find(c => c.id === activeCaseId) || cases[0] || DEFAULT_BASE_CASE;
    const defaultName = `Case ${cases.length + 1}`;
    const newCase = duplicateCase(currentActiveCase, defaultName);
    setCases(prev => [...prev, newCase]);
    setActiveCaseId(newCase.id);
  }, [cases, activeCaseId]);

  const handleRenameCase = useCallback((caseId, newName) => {
    setCases(prev => prev.map(c => c.id === caseId ? { ...c, name: newName } : c));
  }, []);

  const handleDeleteCase = useCallback((caseId) => {
    setCases(prev => {
      const filtered = prev.filter(c => c.id !== caseId);
      if (activeCaseId === caseId) {
        setActiveCaseId(filtered[0]?.id || 'case_base');
      }
      return filtered;
    });
  }, [activeCaseId]);

  const handleReorderCases = useCallback((fromIdx, toIdx) => {
    setCases(prev => {
      if (fromIdx <= 0 || toIdx <= 0 || fromIdx >= prev.length || toIdx >= prev.length) return prev;
      const newCases = [...prev];
      const [moved] = newCases.splice(fromIdx, 1);
      newCases.splice(toIdx, 0, moved);
      return newCases;
    });
  }, []);

  const handleResetCaseOverride = useCallback((nodeId, propKey) => {
    setCases(prev => removeCaseOverride(prev, activeCaseId, nodeId, propKey));
  }, [activeCaseId]);

  const handleSetCaseOverride = useCallback((caseId, nodeId, propKey, value) => {
    const nodeObj = nodes.find(n => n.id === nodeId);
    const baseValue = nodeObj?.data?.[propKey];
    setCases(prev => updateCaseOverride(prev, caseId, nodeId, propKey, value, baseValue));
  }, [nodes]);

  const handleOpenHelpModal = (tab = 'shortcuts') => {
    setHelpModalInitialTab(tab);
    setIsHelpModalOpen(true);
  };
  const dragCounter = useRef(0);
  const [isFileDragging, setIsFileDragging] = useState(false);

  const clipboardRef = useRef({ nodes: [], edges: [] });
  const [globalSettings, setGlobalSettings] = useState({
    fluid_type: 'water',
    ambient_temperature: 293.15,
    atmospheric_pressure: 101325.0,
    global_roughness: 0.000045,
    property_iterations: 5,
    tolerance: 1e-6,
    inner_iterations: 1000,
    control_iterations: 100,
    solver_method: 'sparse_newton',
    warm_start: true,
    damping_factor: 0.25
  });
  const [batchStats, setBatchStats] = useState(null);


  const {
    saveStatus,
    lastSavedTimestamp,
    restoredDraftTime,
    clearLocalDraft,
    loadLocalDraftOnBoot,
    triggerManualCloudSave,
    lockInfo,
    isLockedByOther,
    hasLock,
    checkoutDiagram,
    checkinDiagram
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

  // WebSocket custom hook
  const handleUpdateCaseTelemetry = useCallback((targetCaseId, telemetry, kpis, telemetryUnmitigated) => {
    setCases(prev => updateCaseTelemetry(prev, targetCaseId, telemetry, kpis, telemetryUnmitigated));
  }, []);

  const handleBatchResultsTelemetry = useCallback((batchResults) => {
    setCases(prev => prev.map(c => {
      const match = batchResults.find(b => b.case_id === c.id);
      return (match && (match.telemetry || match.kpis)) 
        ? { 
            ...c, 
            telemetry: match.telemetry || c.telemetry, 
            telemetry_unmitigated: match.telemetry_unmitigated || c.telemetry_unmitigated,
            kpis: match.kpis || c.kpis 
          } 
        : c;
    }));

    if (batchResults) {
      setBatchStats(batchResults.map(r => ({
        case_id: r.case_id,
        case_name: r.case_name,
        status: r.status,
        error_message: r.error_message,
        ...(r.stats || {})
      })));
    }
  }, []);

  const {
    ws,
    isSimulating,
    isConnected,
    lastStats,
    runSimulation,
    handleValveChange,
    telemetryMode,
    setTelemetryMode,
    telemetryUnmitigated
  } = useWebSocketSimulation({
    nodes,
    edges,
    setNodes,
    setEdges,
    globalSettings,
    cases,
    activeCaseId,
    onUpdateCaseTelemetry: handleUpdateCaseTelemetry
  });

  // History stack hook
  const { pushHistorySnapshot, undo, redo } = useCanvasHistory({
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

    setNodes((nds) => {
      const updated = nds.map((n) => ({ ...n, selected: false })).concat(newNodes);
      pushHistorySnapshot(updated, edges);
      return updated;
    });

    setEdges((eds) => {
      const updated = eds.map((e) => ({ ...e, selected: false })).concat(newEdges);
      return updated;
    });

    if (newNodes.length === 1) {
      setSelectedNode(newNodes[0]);
      setSelectedEdge(null);
    }
  }, [handleRotation, handleValveChange, setNodes, setEdges, edges, pushHistorySnapshot]);

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

    pushHistorySnapshot(nextNodes, nextEdges);
  }, [nodes, edges, selectedNode, selectedEdge, setNodes, setEdges, pushHistorySnapshot]);

  const selectAllNodes = useCallback(() => {
    setNodes((nds) => nds.map((n) => ({ ...n, selected: true })));
    setEdges((eds) => eds.map((e) => ({ ...e, selected: false })));
  }, [setNodes, setEdges]);

  const rotateSelectedNode = useCallback(() => {
    const selectedNodesList = nodes.filter((n) => n.selected || (selectedNode && n.id === selectedNode.id));
    if (selectedNodesList.length > 0) {
      selectedNodesList.forEach((n) => handleRotation(n.id));
      pushHistorySnapshot(nodes, edges);
    }
  }, [nodes, edges, selectedNode, handleRotation, pushHistorySnapshot]);

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
  });

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

  const loadData = useCallback((data) => {
    showCanvasLoading();
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
    }
    loadTimeoutRef.current = setTimeout(() => {
      if (data.nodes && data.edges) {
        const seenNodeIds = new Set();
        const restoredNodes = data.nodes.map((node, idx) => {
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
        const restoredEdges = data.edges.map((edge, idx) => {
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
        if (data.globalSettings) {
          setGlobalSettings(prev => ({ ...prev, ...data.globalSettings }));
        }
        if (data.cases && Array.isArray(data.cases) && data.cases.length > 0) {
          setCases(data.cases);
          setActiveCaseId(data.active_case_id || data.cases[0].id);
        } else {
          setCases([DEFAULT_BASE_CASE]);
          setActiveCaseId('case_base');
        }
      }
    }, 50);
  }, [handleValveChange, handleRotation, setNodes, setEdges, showCanvasLoading]);

  const handleLoadDiagramWithCheck = useCallback((data, diagramTitle = '', options = {}) => {
    if (activeProject && !options.skipProjectCheck) {
      const displayTitle = diagramTitle ? `"${diagramTitle}"` : 'this diagram';
      const confirmText = `Are you sure you want to load ${displayTitle}?\n\nNote: Loading this example or diagram will detach cloud sync for project "${activeProject.title}" to prevent overwriting your cloud project.`;

      if (!window.confirm(confirmText)) {
        return false;
      }

      // Detach cloud sync FIRST
      setActiveProject(null);
    } else if (diagramTitle && (options.isTemplate || options.promptConfirmation)) {
      if (!window.confirm(`Load "${diagramTitle}"?`)) {
        return false;
      }
    }

    loadData(data);
    return true;
  }, [activeProject, loadData]);

  const hasAttemptedHydration = useRef(false);

  useEffect(() => {
    if (hasAttemptedHydration.current) return;
    hasAttemptedHydration.current = true;

    const draft = loadLocalDraftOnBoot();
    if (draft) {
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
    } else {
      loadData(greetingCanvas);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onConnect = useCallback((params) => {
    if (activeDiagram && !hasLock) {
      alert("This drawing is read-only. Please check out the drawing to edit.");
      return;
    }
    setEdges((eds) => {
      const isSourceSignal = params.sourceHandle?.startsWith('signal-');
      const isTargetSignal = params.targetHandle?.startsWith('signal-');
      
      if (isSourceSignal !== isTargetSignal) {
        alert("Cannot connect a signal handle to a hydraulic port.");
        return eds;
      }

      const isSignal = isSourceSignal && isTargetSignal;
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
          length: 25.0, 
          diameter: 0.05248 
        } 
      };
      return addEdge(newEdge, eds);
    });
  }, [setEdges, activeDiagram, hasLock]);

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
      alert("This drawing is read-only. Please check out the drawing to edit.");
      return;
    }
    const effectiveCaseId = targetCaseId || activeCaseId;
    const targetCaseObj = cases.find(c => c.id === effectiveCaseId) || DEFAULT_BASE_CASE;
    const isBase = targetCaseObj.is_base;

    if (isBase) {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === nodeId) {
            const updatedNode = { ...node, data: { ...node.data, ...newData } };
            if (selectedNode && selectedNode.id === nodeId) {
              setSelectedNode(updatedNode);
            }
            return updatedNode;
          }
          return node;
        })
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
        const targetNode = nodes.find(n => n.id === nodeId);
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
          nds.map((node) => {
            if (node.id === nodeId) {
              const updatedNode = { ...node, data: { ...node.data, ...globalUpdates } };
              if (selectedNode && selectedNode.id === nodeId) {
                setSelectedNode(updatedNode);
              }
              return updatedNode;
            }
            return node;
          })
        );
      }
    }
  }, [activeCaseId, cases, selectedNode, setNodes, nodes, activeDiagram, hasLock]);

  const updateEdgeData = useCallback((edgeId, newData) => {
    if (activeDiagram && !hasLock) {
      alert("This drawing is read-only. Please check out the drawing to edit.");
      return;
    }
    setEdges((eds) =>
      eds.map((edge) => {
        if (edge.id === edgeId) {
          const updatedEdge = { 
            ...edge, 
            label: newData.label !== undefined ? newData.label : edge.label,
            data: { ...edge.data, ...newData } 
          };
          if (selectedEdge && selectedEdge.id === edgeId) {
            setSelectedEdge(updatedEdge);
          }
          return updatedEdge;
        }
        return edge;
      })
    );
  }, [selectedEdge, setEdges, activeDiagram, hasLock]);

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
        alert("This drawing is read-only. Please check out the drawing to edit.");
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
              alert('Failed to parse dropped project file. Please check file format.');
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
        data: { 
          label: `${type.toUpperCase()}_${Math.floor(Math.random() * 1000)}`, 
          rotation: 0,
          onRotate: handleRotation,
          onChange: type === 'linear_control_valve' ? handleValveChange : undefined,
          ...(type === 'centrifugal_pump' && { flow_rated_lmin: 100.0, pressure_rated_bar: 5.0, rise_to_shutoff_pct: 20.0, active: true }),
          ...(type === 'pump' && { flow_rated_lmin: 100.0, pressure_rated_bar: 5.0, rise_to_shutoff_pct: 20.0, active: true }),
          ...(type === 'volumetric_pump' && { flow_rated: 100.0, motor_power: 5.0, efficiency: 85.0, active: true }),
          ...(type === 'tank' && { level: 2.0, elevation: 0.0, temperature: 313.15 }),
          ...(type === 'linear_control_valve' && { max_cv: 0.05, opening: 50.0 }),
          ...(type === 'linear_regulator' && { max_cv: 0.05, set_pressure: 500000.0, backpressure: false }),
          ...(type === 'orifice' && { pipe_diameter: 0.05248, orifice_diameter: 0.02, standard: 'iso_5167', standardDn: 50, standardSch: '40' }),
          ...(type === 'calibrated_restriction' && { flow_base_lmin: 10.0, inlet_pressure_base_bar: 3.5, outlet_pressure_base_bar: 1.0, temp_base_c: 45.0, restriction_model: 'orifice', fluid_type: 'system' }),
          ...(type === 'filter' && { dp_clean: 0.2, dp_terminal: 1.0, flow_ref: 100.0, clogging: 0.0 }),
          ...(type === 'heat_exchanger' && { heat_duty_kw: -10.0, active: true }),
          ...(type === 'remote_control_valve' && { max_cv: 0.05, set_pressure: 500000.0 }),
          ...(type === 'three_way_tcv' && { max_cv: 0.1, set_temperature_c: 40.0, hot_port_idx: 0 }),
          ...(type === 'check_valve' && { cv: 10.0, cracking_pressure_bar: 0.05 }),
          ...(type === 'check_valve_orifice' && { cv: 10.0, cracking_pressure_bar: 0.05, pipe_diameter: 0.05248, orifice_diameter: 0.01, standardDn: 50, standardSch: '40' }),
          ...(type === 'text_bubble' && { label: 'Note', title: 'NOTE', text: 'Double-click to edit note...', fontSize: 'md' }),
        },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, handleValveChange, handleRotation, setNodes, handleLoadDiagramWithCheck, activeDiagram, hasLock]
  );

  const onSave = useCallback(() => {
    const flowData = {
      version: FILE_FORMAT_VERSION,
      app_version: APP_VERSION,
      format: 'walflow',
      created_at: new Date().toISOString(),
      active_case_id: activeCaseId,
      cases,
      nodes,
      edges,
      globalSettings,
    };
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
      alert("This drawing is read-only. Please check out the drawing to edit.");
      return;
    }
    setNodes((nds) => nds.filter((node) => node.id !== nodeId));
    setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    setSelectedNode(null);
  }, [setNodes, setEdges, activeDiagram, hasLock]);

  const onDeleteEdge = useCallback((edgeId) => {
    if (activeDiagram && !hasLock) {
      alert("This drawing is read-only. Please check out the drawing to edit.");
      return;
    }
    setEdges((eds) => eds.filter((edge) => edge.id !== edgeId));
    setSelectedEdge(null);
  }, [setEdges, activeDiagram, hasLock]);

  const resetCanvas = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setSelectedNode(null);
    setSelectedEdge(null);
    setCases([DEFAULT_BASE_CASE]);
    setActiveCaseId('case_base');
  }, [setNodes, setEdges]);

  const handleSaveAs = useCallback(async ({ title, description, project_id }) => {
    try {
      const flowData = {
        version: FILE_FORMAT_VERSION,
        app_version: APP_VERSION,
        format: 'walflow',
        created_at: new Date().toISOString(),
        nodes,
        edges,
        globalSettings,
        cases,
        active_case_id: activeCaseId
      };

      const response = await axios.post('/api/diagrams', {
        title,
        description,
        diagram_data: JSON.stringify(flowData),
        project_id
      });

      setActiveDiagram({
        id: response.data.id,
        title: response.data.title,
        description: response.data.description
      });

      if (project_id) {
        const projRes = await axios.get(`/api/projects/${project_id}`);
        setActiveProject({
          id: projRes.data.id,
          title: projRes.data.title,
          description: projRes.data.description
        });
      } else {
        setActiveProject(null);
      }

      alert("Drawing copy saved successfully.");
    } catch {
      alert("Failed to perform Save As.");
    }
  }, [nodes, edges, globalSettings, cases, activeCaseId, setActiveDiagram, setActiveProject]);

  const handleCreateNewDrawing = useCallback(async ({ title, description, project_id, isDraft }) => {
    if (isDraft) {
      showCanvasLoading('Creating new drawing…');
      resetCanvas();
      setActiveProject(null);
      setActiveDiagram(null);
      clearLocalDraft();
      alert("New local draft initialized.");
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
        globalSettings: {
          fluid_type: 'water',
          ambient_temperature: 293.15,
          atmospheric_pressure: 101325.0,
          global_roughness: 0.000045,
          tolerance: 0.000001,
          inner_iterations: 1000,
          control_iterations: 100,
          solver_method: 'sparse_newton',
          warm_start: true,
          damping_factor: 0.25
        },
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
        description: response.data.description
      });

      if (project_id) {
        const projRes = await axios.get(`/api/projects/${project_id}`);
        setActiveProject({
          id: projRes.data.id,
          title: projRes.data.title,
          description: projRes.data.description
        });
      } else {
        setActiveProject(null);
      }

      loadData(blankPayload);
      alert("New cloud drawing created successfully.");
    } catch {
      alert("Failed to create new cloud drawing.");
    }
  }, [resetCanvas, clearLocalDraft, setActiveDiagram, setActiveProject, loadData, showCanvasLoading]);

  useEffect(() => {
    const handler = setTimeout(() => {
      if (isConnected && ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ 
          action: 'update_graph', 
          graph: { 
            nodes, 
            edges, 
            global_settings: globalSettings,
            cases,
            active_case_id: activeCaseId
          } 
        }));
      }
    }, 250);

    return () => clearTimeout(handler);
  }, [nodes, edges, isConnected, globalSettings, cases, activeCaseId, ws]);

  useEffect(() => {
    if (isConnected && ws.current && ws.current.readyState === WebSocket.OPEN && activeDiagram?.id) {
      ws.current.send(JSON.stringify({ 
        action: 'join_diagram', 
        diagram_id: activeDiagram.id 
      }));
    }
  }, [isConnected, activeDiagram?.id, ws]);

  useEffect(() => {
    if (selectedNode) {
      const liveNode = nodes.find(n => n.id === selectedNode.id);
      if (liveNode) setSelectedNode(liveNode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes]);

  const [heatmapSettings, setHeatmapSettings] = useState({
    mode: 'default',
    autoScale: true,
    globalAutoScale: true,
    customRanges: {
      pressure: { min: 0.0, max: 6.0 },
      temperature: { min: 20.0, max: 60.0 },
      volumeflow: { min: 0.0, max: 200.0 },
      velocity: { min: 0.0, max: 10.0 }
    }
  });

  const computeGlobalHeatmapRange = useCallback((mode) => {
    if (!mode || mode === 'default') return { min: 0, max: 1 };

    let minVal = Infinity;
    let maxVal = -Infinity;

    const targetCases = (cases && cases.length > 0) ? cases : [{ id: activeCaseId }];

    targetCases.forEach((c) => {
       edges.forEach((e) => {
        const effectiveData = getEffectiveEdgeData(e, cases, c.id, telemetryMode);
        const tele = effectiveData.telemetry || e.data?.telemetry || {};
        if (mode === 'pressure') {
          const p1 = tele.inlets?.[0]?.pressure != null ? tele.inlets[0].pressure / 100000.0 : null;
          const p2 = tele.outlets?.[0]?.pressure != null ? tele.outlets[0].pressure / 100000.0 : null;
          if (p1 !== null) { minVal = Math.min(minVal, p1); maxVal = Math.max(maxVal, p1); }
          if (p2 !== null) { minVal = Math.min(minVal, p2); maxVal = Math.max(maxVal, p2); }
        } else if (mode === 'temperature') {
          const t1 = tele.inlets?.[0]?.temperature != null ? tele.inlets[0].temperature - 273.15 : null;
          const t2 = tele.outlets?.[0]?.temperature != null ? tele.outlets[0].temperature - 273.15 : null;
          if (t1 !== null) { minVal = Math.min(minVal, t1); maxVal = Math.max(maxVal, t1); }
          if (t2 !== null) { minVal = Math.min(minVal, t2); maxVal = Math.max(maxVal, t2); }
        } else if (mode === 'volumeflow') {
          const q1 = tele.inlets?.[0]?.flow_rate != null ? Math.abs(tele.inlets[0].flow_rate * 60000.0) : null;
          const q2 = tele.outlets?.[0]?.flow_rate != null ? Math.abs(tele.outlets[0].flow_rate * 60000.0) : null;
          if (q1 !== null) { minVal = Math.min(minVal, q1); maxVal = Math.max(maxVal, q1); }
          if (q2 !== null) { minVal = Math.min(minVal, q2); maxVal = Math.max(maxVal, q2); }
        } else if (mode === 'velocity') {
          const dia = e.data?.diameter || 0.1;
          const area = (Math.PI * Math.pow(dia, 2)) / 4.0;
          const q1 = tele.inlets?.[0]?.flow_rate != null ? Math.abs(tele.inlets[0].flow_rate) : null;
          const q2 = tele.outlets?.[0]?.flow_rate != null ? Math.abs(tele.outlets[0].flow_rate) : null;
          const v1 = (q1 !== null && area > 0) ? q1 / area : null;
          const v2 = (q2 !== null && area > 0) ? q2 / area : null;
          if (v1 !== null) { minVal = Math.min(minVal, v1); maxVal = Math.max(maxVal, v1); }
          if (v2 !== null) { minVal = Math.min(minVal, v2); maxVal = Math.max(maxVal, v2); }
        }
      });
    });

    if (minVal === Infinity || maxVal === -Infinity || Math.abs(maxVal - minVal) < 1e-4) {
      if (mode === 'pressure') return { min: 0.0, max: 6.0 };
      if (mode === 'temperature') return { min: 20.0, max: 60.0 };
      if (mode === 'volumeflow') return { min: 0.0, max: 200.0 };
      if (mode === 'velocity') return { min: 0.0, max: 10.0 };
    }

    return { min: Math.max(0, parseFloat(minVal.toFixed(1))), max: parseFloat(maxVal.toFixed(1)) };
  }, [edges, cases, activeCaseId, telemetryMode]);

  const computedHeatmapRange = useMemo(() => {
    const mode = heatmapSettings.mode;
    if (mode === 'default') return { min: 0, max: 1 };

    if (!heatmapSettings.autoScale) {
      const custom = heatmapSettings.customRanges[mode];
      return custom || { min: 0, max: 10 };
    }

    let minVal = Infinity;
    let maxVal = -Infinity;

    const targetCases = (heatmapSettings.globalAutoScale && cases && cases.length > 0)
      ? cases
      : [{ id: activeCaseId }];

    targetCases.forEach((c) => {
      edges.forEach((e) => {
        const effectiveData = getEffectiveEdgeData(e, cases, c.id, telemetryMode);
        const tele = effectiveData.telemetry || e.data?.telemetry || {};
        if (mode === 'pressure') {
          const p1 = tele.inlets?.[0]?.pressure != null ? tele.inlets[0].pressure / 100000.0 : null;
          const p2 = tele.outlets?.[0]?.pressure != null ? tele.outlets[0].pressure / 100000.0 : null;
          if (p1 !== null) { minVal = Math.min(minVal, p1); maxVal = Math.max(maxVal, p1); }
          if (p2 !== null) { minVal = Math.min(minVal, p2); maxVal = Math.max(maxVal, p2); }
        } else if (mode === 'temperature') {
          const t1 = tele.inlets?.[0]?.temperature != null ? tele.inlets[0].temperature - 273.15 : null;
          const t2 = tele.outlets?.[0]?.temperature != null ? tele.outlets[0].temperature - 273.15 : null;
          if (t1 !== null) { minVal = Math.min(minVal, t1); maxVal = Math.max(maxVal, t1); }
          if (t2 !== null) { minVal = Math.min(minVal, t2); maxVal = Math.max(maxVal, t2); }
        } else if (mode === 'volumeflow') {
          const q1 = tele.inlets?.[0]?.flow_rate != null ? Math.abs(tele.inlets[0].flow_rate * 60000.0) : null;
          const q2 = tele.outlets?.[0]?.flow_rate != null ? Math.abs(tele.outlets[0].flow_rate * 60000.0) : null;
          if (q1 !== null) { minVal = Math.min(minVal, q1); maxVal = Math.max(maxVal, q1); }
          if (q2 !== null) { minVal = Math.min(minVal, q2); maxVal = Math.max(maxVal, q2); }
        } else if (mode === 'velocity') {
          const dia = e.data?.diameter || 0.1;
          const area = (Math.PI * Math.pow(dia, 2)) / 4.0;
          const q1 = tele.inlets?.[0]?.flow_rate != null ? Math.abs(tele.inlets[0].flow_rate) : null;
          const q2 = tele.outlets?.[0]?.flow_rate != null ? Math.abs(tele.outlets[0].flow_rate) : null;
          const v1 = (q1 !== null && area > 0) ? q1 / area : null;
          const v2 = (q2 !== null && area > 0) ? q2 / area : null;
          if (v1 !== null) { minVal = Math.min(minVal, v1); maxVal = Math.max(maxVal, v1); }
          if (v2 !== null) { minVal = Math.min(minVal, v2); maxVal = Math.max(maxVal, v2); }
        }
      });
    });

    if (minVal === Infinity || maxVal === -Infinity || Math.abs(maxVal - minVal) < 1e-4) {
      if (mode === 'pressure') return { min: 0.0, max: 6.0 };
      if (mode === 'temperature') return { min: 20.0, max: 60.0 };
      if (mode === 'volumeflow') return { min: 0.0, max: 200.0 };
      if (mode === 'velocity') return { min: 0.0, max: 10.0 };
    }

    return { min: Math.max(0, minVal), max: maxVal };
  }, [edges, cases, activeCaseId, telemetryMode, heatmapSettings.mode, heatmapSettings.autoScale, heatmapSettings.globalAutoScale, heatmapSettings.customRanges]);

  const scalingInfo = useMemo(() => {
    const activeCase = getActiveCase(cases, activeCaseId);
    return getActiveCaseScalingInfo(activeCase);
  }, [cases, activeCaseId]);

  const styledEdges = useMemo(() => {
    return edges.map(edge => {
      const effectiveData = getEffectiveEdgeData(edge, cases, activeCaseId, telemetryMode, scalingInfo);
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
  }, [edges, cases, activeCaseId, telemetryMode, isSimulating, heatmapSettings.mode, computedHeatmapRange, scalingInfo]);

  const interactiveNodes = useMemo(() => {
    return nodes.map(node => {
      const effectiveData = getEffectiveNodeData(node, cases, activeCaseId, telemetryMode, scalingInfo);
      const hasOverrides = hasActiveOverrides(node.id, cases, activeCaseId);
      return {
        ...node,
        draggable: true, // Keep constantly true to eliminate click/drag re-render lags
        data: {
          ...node.data,
          ...effectiveData,
          hasCaseOverrides: hasOverrides,
          onRotate: handleRotation,
          onChange: (node.type === 'linear_control_valve' || node.type === 'remote_control_valve') ? handleValveChange : undefined,
        }
      };
    });
  }, [nodes, cases, activeCaseId, telemetryMode, handleRotation, handleValveChange, scalingInfo]);

  const effectiveSelectedNode = useMemo(() => {
    if (!selectedNode) return null;
    const liveNode = nodes.find(n => n.id === selectedNode.id) || selectedNode;
    const effectiveData = getEffectiveNodeData(liveNode, cases, activeCaseId, telemetryMode, scalingInfo);
    return {
      ...liveNode,
      data: {
        ...liveNode.data,
        ...effectiveData
      }
    };
  }, [selectedNode, nodes, cases, activeCaseId, telemetryMode, scalingInfo]);

  const effectiveSelectedEdge = useMemo(() => {
    if (!selectedEdge) return null;
    const liveEdge = edges.find(e => e.id === selectedEdge.id) || selectedEdge;
    const effectiveData = getEffectiveEdgeData(liveEdge, cases, activeCaseId, telemetryMode, scalingInfo);
    return {
      ...liveEdge,
      data: {
        ...liveEdge.data,
        ...effectiveData
      }
    };
  }, [selectedEdge, edges, cases, activeCaseId, telemetryMode, scalingInfo]);

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

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#F0F4F4', overflow: 'hidden' }}>
      <Navbar 
        onCalculate={runSimulation}
        isSimulating={isSimulating}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        onOpenAdminHub={() => setIsAdminHubOpen(true)}
        onOpenHelpModal={(tab) => handleOpenHelpModal(tab || 'about')}
        onLogoutClear={resetCanvas}
        cases={cases}
        activeCaseId={activeCaseId}
        onSelectCase={setActiveCaseId}
        onAddCase={handleAddCase}
        activeProject={activeProject}
        activeDiagram={activeDiagram}
      />

      <div style={{ flexGrow: 1, display: 'flex', height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
        <Sidebar 
          onLoad={handleLoadDiagramWithCheck} 
          globalSettings={globalSettings}
          onUpdateGlobalSettings={setGlobalSettings}
          lastStats={lastStats}
          batchStats={batchStats}
          onSelectComponent={handleSelectComponent}
          templates={{
            "Industrial Process Systems": {
              "API 614 Lube Oil System (LOS)": exampleAPI614,
              "API 682 Mechanical Seal Flush": exampleAPI682,
              "Industrial Chilled Water Circuit": exampleChilledWater
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
          onSaveAsClick={() => setIsSaveAsModalOpen(true)}
          onNewDrawingClick={() => setIsNewDrawingModalOpen(true)}
          onImportClick={() => document.getElementById('sidebar-file-upload').click()}
          onExportClick={onSave}
          onOpenProjectsModal={(projId) => {
            setProjectManagerProjectId(projId || null);
            setIsProjectManagerModalOpen(true);
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
                  alert('Failed to load project file. Please ensure it is a valid .wlf or .json file.');
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
              <div style={{
                fontSize: '64px',
                marginBottom: '16px',
                filter: 'drop-shadow(0 4px 12px rgba(250, 133, 7, 0.5))'
              }}>
                📥
              </div>
              <h2 style={{ color: '#FFFFFF', margin: '0 0 8px 0', fontSize: '24px', fontWeight: '700', letterSpacing: '-0.01em' }}>
                Drop .wlf File to Import Diagram
              </h2>
              <p style={{ color: '#94A3B8', margin: 0, fontSize: '14px', fontWeight: '500' }}>
                Release anywhere on the canvas to load PFD configuration
              </p>
            </div>
          )}


          <ReactFlow 
            nodes={interactiveNodes} 
            edges={styledEdges} 
            nodeTypes={nodeTypes} 
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChangeCustom}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onNodesDelete={(deleted) => {
              if (selectedNode && deleted.some(n => n.id === selectedNode.id)) setSelectedNode(null);
            }}
            onEdgesDelete={(deleted) => {
              if (selectedEdge && deleted.some(e => e.id === selectedEdge.id)) setSelectedEdge(null);
            }}
            onPaneClick={onPaneClick}
            onInit={setReactFlowInstance}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeDragStop={() => pushHistorySnapshot(nodes, edges)}
            nodesDraggable={!activeDiagram || hasLock}
            nodesConnectable={!activeDiagram || hasLock}
            elementsSelectable={true}
            fitView
          >
            <Background color="#B8C9C8" gap={16} size={1} />
            <Controls>
              <ControlButton 
                onClick={() => setHeatmapSettings(prev => ({ ...prev, mode: prev.mode === 'default' ? 'pressure' : 'default' }))}
                title={heatmapSettings.mode === 'default' ? "Turn On Heatmap" : "Turn Off Heatmap"}
                className={heatmapSettings.mode !== 'default' ? 'active' : ''}
              >
                <FlameIcon size={14} />
              </ControlButton>
              <ControlButton 
                onClick={() => setShowCaseManager(prev => !prev)}
                title={showCaseManager ? "Hide Case Manager" : "Show Case Manager"}
                className={showCaseManager ? 'active' : ''}
              >
                <CaseIcon size={14} />
              </ControlButton>
              <ControlButton 
                onClick={() => handleOpenHelpModal('shortcuts')}
                title="Help & Information (?)"
              >
                <HelpIcon size={14} />
              </ControlButton>
            </Controls>
          </ReactFlow>

          <HelpInfoModal 
            isOpen={isHelpModalOpen} 
            onClose={() => setIsHelpModalOpen(false)} 
            initialTab={helpModalInitialTab}
          />

          <LoginModal 
            isOpen={isAuthModalOpen}
            onClose={() => setIsAuthModalOpen(false)}
          />

          <ProjectManagerModal
            isOpen={isProjectManagerModalOpen}
            onClose={() => {
              setIsProjectManagerModalOpen(false);
              setProjectManagerProjectId(null);
            }}
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

          <SaveAsModal
            isOpen={isSaveAsModalOpen}
            onClose={() => setIsSaveAsModalOpen(false)}
            onSaveAs={handleSaveAs}
            currentTitle={activeDiagram?.title || "Untitled Drawing"}
          />

          <NewDrawingModal
            isOpen={isNewDrawingModalOpen}
            onClose={() => setIsNewDrawingModalOpen(false)}
            onCreateNew={handleCreateNewDrawing}
          />

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
                fontSize: '13px',
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
                <div style={{ fontWeight: '700', color: 'var(--color-primary)' }}>Restored Session Draft</div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: '400', marginTop: '1px' }}>
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
                  fontSize: '14px',
                  padding: '2px 6px',
                  borderRadius: '4px'
                }}
              >
                ✕
              </button>
            </div>
          )}

          <AdminSetupModal
            isOpen={!adminStatus.adminExists}
            onClose={() => {}}
          />

          <AdminHubModal
            isOpen={isAdminHubOpen}
            onClose={() => setIsAdminHubOpen(false)}
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
          allEdges={edges}
          unmitigatedTelemetry={telemetryUnmitigated}
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
          globalSettings={globalSettings}
          onSelectCase={setActiveCaseId}
          onAddCase={handleAddCase}
          onRenameCase={handleRenameCase}
          onDeleteCase={handleDeleteCase}
          onReorderCases={handleReorderCases}
          onBatchResults={handleBatchResultsTelemetry}
          telemetryMode={telemetryMode}
          telemetryUnmitigated={telemetryUnmitigated}
          onSetCaseOverride={handleSetCaseOverride}
          runSimulation={runSimulation}
          showCaseManager={showCaseManager}
          onToggleCaseManager={() => setShowCaseManager(prev => !prev)}
        />
      </div>
    </div>
  </div>
);
}

export default function App() {
  return (
    <AuthProvider>
      <ReactFlowProvider>
        <WalFlowContent />
      </ReactFlowProvider>
    </AuthProvider>
  );
}
