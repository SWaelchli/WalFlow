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

import Navbar from './components/layout/Navbar';
import Sidebar from './components/panels/Sidebar';
import PropertyEditor from './components/panels/PropertyEditor';
import DataList from './components/panels/DataList';
import DetailPanel from './components/details/DetailPanel';

import PipeEdge from './edges/PipeEdge';
import SignalEdge from './edges/SignalEdge';
import HeatmapLegend from './components/overlays/HeatmapLegend';
import CaseManager from './components/overlays/CaseManager';
import HelpInfoModal from './components/modals/HelpInfoModal';
import LoginModal from './components/modals/LoginModal';
import ProjectManagerModal from './components/modals/ProjectManagerModal';
import AdminSetupModal from './components/modals/AdminSetupModal';
import AdminHubModal from './components/modals/AdminHubModal';
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
  duplicateCase
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
};

const edgeTypes = {
  pipe: PipeEdge,
  default: PipeEdge,
  signal: SignalEdge,
};

const getId = () => `node_${crypto.randomUUID().split('-')[0]}`;

function WalFlowContent() {
  const { currentUser, isAuthenticated, adminStatus } = useAuth();
  const reactFlowWrapper = useRef(null);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges] = useEdgesState([]);
  const [edgeIdCount, setEdgeIdCount] = useState(100);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [helpModalInitialTab, setHelpModalInitialTab] = useState('shortcuts');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isProjectManagerModalOpen, setIsProjectManagerModalOpen] = useState(false);
  const [isAdminHubOpen, setIsAdminHubOpen] = useState(false);

  // Active Cloud Project & Auto-Save Session Hook
  const [activeProject, setActiveProject] = useState(null);
  const [showRestoredToast, setShowRestoredToast] = useState(false);

  // Reset active cloud project when user switches accounts or logs out
  const prevUserIdRef = useRef(currentUser?.id);
  useEffect(() => {
    if (prevUserIdRef.current !== currentUser?.id) {
      prevUserIdRef.current = currentUser?.id;
      setActiveProject(null);
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
    setCases(prev => updateCaseOverride(prev, caseId, nodeId, propKey, value));
  }, []);

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
    solver_method: 'hybr'
  });

  const {
    saveStatus,
    lastSavedTimestamp,
    restoredDraftTime,
    clearLocalDraft,
    loadLocalDraftOnBoot,
    triggerManualCloudSave
  } = useAutoSaveSession({
    nodes,
    edges,
    globalSettings,
    cases,
    activeCaseId,
    reactFlowInstance,
    isAuthenticated,
    activeProject,
    setActiveProject
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
    hasPsv,
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

    const newEdges = (copiedEdges || [])
      .filter((e) => idMap[e.source] && idMap[e.target])
      .map((e, idx) => {
        const isSignal = e.data?.type === 'SIGNAL';
        const newEdgeId = isSignal ? `Signal ${edgeIdCount + idx}` : `Pipe ${edgeIdCount + idx}`;
        return {
          ...e,
          id: newEdgeId,
          source: idMap[e.source],
          target: idMap[e.target],
          selected: true,
          data: {
            ...e.data,
            label: newEdgeId,
          },
        };
      });

    setEdgeIdCount((prev) => prev + newEdges.length);

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
  }, [edgeIdCount, handleRotation, handleValveChange, setNodes, setEdges, edges, pushHistorySnapshot]);

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
  }, [handleValveChange, handleRotation, setNodes, setEdges]);

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
      setShowRestoredToast(true);
      setTimeout(() => setShowRestoredToast(false), 5000);
    } else {
      loadData(greetingCanvas);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onConnect = useCallback((params) => {
    setEdges((eds) => {
      const isSourceSignal = params.sourceHandle?.startsWith('signal-');
      const isTargetSignal = params.targetHandle?.startsWith('signal-');
      
      if (isSourceSignal !== isTargetSignal) {
        alert("Cannot connect a signal handle to a hydraulic port.");
        return eds;
      }

      const isSignal = isSourceSignal && isTargetSignal;
      const newId = isSignal ? `Signal ${edgeIdCount}` : `Pipe ${edgeIdCount}`;
      
      const newEdge = { 
        ...params, 
        id: newId,
        label: newId,
        animated: true, 
        type: isSignal ? 'step' : 'default',
        style: isSignal 
          ? { stroke: '#fde047', strokeWidth: 3, strokeDasharray: '5,5' }
          : {},
        data: { 
          label: newId, 
          type: isSignal ? 'SIGNAL' : 'PIPE',
          length: 25.0, 
          diameter: 0.05248 
        } 
      };
      setEdgeIdCount(prev => prev + 1);
      return addEdge(newEdge, eds);
    });
  }, [setEdges, edgeIdCount]);

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
        setCases(prev => {
          let updatedCases = prev;
          Object.entries(caseVarUpdates).forEach(([key, val]) => {
            updatedCases = updateCaseOverride(updatedCases, activeCaseId, nodeId, key, val);
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
  }, [activeCaseId, cases, selectedNode, setNodes]);

  const updateEdgeData = useCallback((edgeId, newData) => {
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
  }, [selectedEdge, setEdges]);

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

      const type = event.dataTransfer.getData('application/reactflow');
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
          ...(type === 'orifice' && { pipe_diameter: 0.05248, orifice_diameter: 0.02, standardDn: 50, standardSch: '40' }),
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
    [reactFlowInstance, handleValveChange, handleRotation, setNodes, handleLoadDiagramWithCheck]
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
    setNodes((nds) => nds.filter((node) => node.id !== nodeId));
    setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    setSelectedNode(null);
  }, [setNodes, setEdges]);

  const onDeleteEdge = useCallback((edgeId) => {
    setEdges((eds) => eds.filter((edge) => edge.id !== edgeId));
    setSelectedEdge(null);
  }, [setEdges]);

  const resetCanvas = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setSelectedNode(null);
    setSelectedEdge(null);
    setCases([DEFAULT_BASE_CASE]);
    setActiveCaseId('case_base');
  }, [setNodes, setEdges]);

  const onClearCanvas = useCallback(() => {
    if (window.confirm('Are you sure you want to clear the entire canvas and purge the cached session draft?')) {
      resetCanvas();
      setActiveProject(null);
      clearLocalDraft();
    }
  }, [resetCanvas, clearLocalDraft]);

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

  const styledEdges = useMemo(() => {
    return edges.map(edge => {
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
          stroke: heatmapSettings.mode !== 'default' ? undefined : (hasFlow ? '#FA8507' : '#395253'),
          strokeWidth: hasFlow ? 3.5 : 2.5,
        }
      };
    });
  }, [edges, cases, activeCaseId, telemetryMode, isSimulating, heatmapSettings.mode, computedHeatmapRange]);

  const interactiveNodes = useMemo(() => {
    return nodes.map(node => {
      const effectiveData = getEffectiveNodeData(node, cases, activeCaseId, telemetryMode);
      const hasOverrides = hasActiveOverrides(node.id, cases, activeCaseId);
      return {
        ...node,
        draggable: Boolean(node.selected),
        data: {
          ...node.data,
          ...effectiveData,
          hasCaseOverrides: hasOverrides,
          onRotate: handleRotation,
          onChange: (node.type === 'linear_control_valve' || node.type === 'remote_control_valve') ? handleValveChange : undefined,
        }
      };
    });
  }, [nodes, cases, activeCaseId, telemetryMode, handleRotation, handleValveChange]);

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

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#F0F4F4', overflow: 'hidden' }}>
      <Navbar 
        onSave={onSave} 
        onLoad={handleLoadDiagramWithCheck} 
        onClear={onClearCanvas} 
        onCalculate={runSimulation}
        isSimulating={isSimulating}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        onOpenProjectsModal={() => setIsProjectManagerModalOpen(true)}
        onOpenAdminHub={() => setIsAdminHubOpen(true)}
        onOpenHelpModal={(tab) => handleOpenHelpModal(tab || 'about')}
        onLogoutClear={resetCanvas}
        cases={cases}
        activeCaseId={activeCaseId}
        onSelectCase={setActiveCaseId}
        onAddCase={handleAddCase}
        onRenameCase={handleRenameCase}
        onDeleteCase={handleDeleteCase}
        activeProject={activeProject}
        saveStatus={saveStatus}
        lastSavedTimestamp={lastSavedTimestamp}
        onTriggerManualSave={triggerManualCloudSave}
        telemetryMode={telemetryMode}
        onToggleTelemetryMode={setTelemetryMode}
        hasPsv={hasPsv || nodes.some(n => n.type === 'pressure_safety_valve' || n.type === 'psv' || n.type === 'rupture_disc')}
      />

      <div style={{ flexGrow: 1, display: 'flex', height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
        <Sidebar 
          onLoad={handleLoadDiagramWithCheck} 
          globalSettings={globalSettings}
          onUpdateGlobalSettings={setGlobalSettings}
          lastStats={lastStats}
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
        />

        <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
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
              border: '3px dashed #FA8507',
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
          <DetailPanel 
            selectedNode={effectiveSelectedNode} 
            allNodes={nodes}
            allEdges={edges}
            unmitigatedTelemetry={telemetryUnmitigated}
          />
          
          <PropertyEditor 
            key={selectedNode?.id || selectedEdge?.id || 'none'}
            node={selectedNode} 
            edge={selectedEdge}
            onUpdate={updateNodeData} 
            onUpdateEdge={updateEdgeData}
            onDelete={onDeleteNode} 
            onDeleteEdge={onDeleteEdge}
            heatmapActive={heatmapSettings.mode !== 'default'}
            cases={cases}
            activeCaseId={activeCaseId}
            onResetCaseOverride={handleResetCaseOverride}
          />

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
            fitView
          >
            <Background color="#B8C9C8" gap={16} size={1} />
            <Controls>
              <ControlButton 
                onClick={() => setHeatmapSettings(prev => ({ ...prev, mode: prev.mode === 'default' ? 'pressure' : 'default' }))}
                title={heatmapSettings.mode === 'default' ? "Turn On Heatmap" : "Turn Off Heatmap"}
                style={{
                  backgroundColor: heatmapSettings.mode !== 'default' ? '#FA8507' : '#ffffff',
                  color: heatmapSettings.mode !== 'default' ? '#ffffff' : '#395253',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s ease'
                }}
              >
                🎨
              </ControlButton>
              <ControlButton 
                onClick={() => setShowCaseManager(prev => !prev)}
                title={showCaseManager ? "Hide Case Manager" : "Show Case Manager"}
                style={{
                  backgroundColor: showCaseManager ? '#FA8507' : '#ffffff',
                  color: showCaseManager ? '#ffffff' : '#395253',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s ease'
                }}
              >
                💼
              </ControlButton>
              <ControlButton 
                onClick={() => handleOpenHelpModal('shortcuts')}
                title="Help & Information (?)"
                style={{
                  backgroundColor: '#ffffff',
                  color: '#395253',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s ease'
                }}
              >
                ❓
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
            onClose={() => setIsProjectManagerModalOpen(false)}
            currentFlowData={{ nodes, edges, globalSettings, cases, activeCaseId }}
            onLoadDiagram={loadData}
            activeProject={activeProject}
            setActiveProject={setActiveProject}
          />

          {showRestoredToast && (
            <div style={{
              position: 'fixed',
              bottom: '24px',
              right: '24px',
              backgroundColor: '#1C2B2C',
              color: '#ffffff',
              border: '1px solid #395253',
              borderRadius: '12px',
              padding: '12px 18px',
              fontSize: '13px',
              fontWeight: '600',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(250, 133, 7, 0.2)',
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
              <span style={{ fontSize: '18px' }}>🟢</span>
              <div>
                <div style={{ fontWeight: '700', color: '#FA8507' }}>Restored Session Draft</div>
                <div style={{ fontSize: '11px', color: '#B8C9C8', fontWeight: '400', marginTop: '1px' }}>
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
              style={{ top: heatmapSettings.mode !== 'default' ? '190px' : '16px' }}
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
