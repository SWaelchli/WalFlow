import ReactFlow, { 
  Background, 
  Controls,
  ControlButton,
  useNodesState, 
  useEdgesState,
  addEdge,
  applyEdgeChanges
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

import Sidebar from './Sidebar';
import PropertyEditor from './PropertyEditor';
import DetailPanel from './DetailPanel';
import DataList from './DataList';

import PipeEdge from './edges/PipeEdge';
import SignalEdge from './edges/SignalEdge';
import HeatmapLegend from './components/HeatmapLegend';

// Import Examples
import examplePFD from './example_pfd/Example_Standard_PFD.json';
import examplePRV from './example_pfd/Example_PRV.json';
import exampleBPR from './example_pfd/Example_BPR.json';
import exampleRemoteControl from './example_pfd/Example_RemoteControl.json';
import exampleAPI614 from './example_pfd/Example_API_614_LOS.json';
import exampleVolumetric from './example_pfd/Example_Volumetric.json';

const nodeTypes = {
  tank: TankNode,
  pump: CentrifugalPumpNode, // Legacy support
  centrifugal_pump: CentrifugalPumpNode,
  volumetric_pump: VolumetricPumpNode,
  orifice: OrificeNode,
  linear_control_valve: LinearControlValveNode,
  linear_regulator: LinearRegulatorNode,
  filter: FilterNode,
  heat_exchanger: HeatExchangerNode,
  splitter: SplitterNode,
  mixer: MixerNode,
  remote_control_valve: RemoteControlValveNode,
  three_way_tcv: ThreeWayTCVNode,
};

const edgeTypes = {
  pipe: PipeEdge,
  default: PipeEdge,
  signal: SignalEdge,
};

const getId = () => `node_${crypto.randomUUID().split('-')[0]}`;

export default function App() {
  const reactFlowWrapper = useRef(null);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const ws = useRef(null);
  
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges] = useEdgesState([]);
  const [edgeIdCount, setEdgeIdCount] = useState(100);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [lastStats, setLastStats] = useState(null);
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

  // Global UI Fix
  useEffect(() => {
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.overflow = 'hidden';
    document.body.style.width = '100vw';
    document.body.style.height = '100vh';
  }, []);

  const runSimulation = useCallback(() => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      setIsSimulating(true);
      ws.current.send(JSON.stringify({ 
        action: 'run_simulation',
        graph: { nodes, edges, global_settings: globalSettings }
      }));
    }
  }, [nodes, edges, globalSettings]);

  const handleValveChange = useCallback((newValue, nodeId) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        action: 'update_valve',
        value: parseFloat(newValue),
        node_id: nodeId
      }));
    }
    setNodes((nds) =>
      nds.map((node) =>
        node.id === nodeId ? { ...node, data: { ...node.data, opening: newValue } } : node
      )
    );
  }, [setNodes]);

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

  const selectNodeById = useCallback((id) => {
    setNodes((nds) => {
      const updated = nds.map((n) => ({ ...n, selected: n.id === id }));
      const found = updated.find(n => n.id === id);
      if (found) {
        setSelectedNode(found);
        setSelectedEdge(null);
      }
      return updated;
    });
    setEdges((eds) => eds.map((e) => ({ ...e, selected: false, style: {} })));
  }, [setNodes, setEdges]);

  const selectEdgeById = useCallback((id) => {
    setEdges((eds) => {
      const updated = eds.map((e) => {
        const isSelected = e.id === id;
        const isSignal = e.data?.type === 'SIGNAL';

        let style = {};
        if (isSelected) {
          style = { stroke: '#3b82f6', strokeWidth: 3 };
        } else if (isSignal) {
          style = { stroke: '#fde047', strokeWidth: 3, strokeDasharray: '5,5' };
        }

        return { 
          ...e, 
          selected: isSelected,
          style: style
        };
      });
      const found = updated.find(e => e.id === id);
      if (found) {
        setSelectedEdge(found);
        setSelectedNode(null);
      }
      return updated;
    });
    setNodes((nds) => nds.map((n) => ({ ...n, selected: false })));
  }, [setNodes, setEdges]);

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
      const restoredNodes = data.nodes.map(node => ({
        ...node,
        data: {
          ...node.data,
          rotation: node.data.rotation || 0,
          onRotate: handleRotation,
          onChange: (node.type === 'linear_control_valve' || node.type === 'remote_control_valve') ? handleValveChange : undefined
        }
      }));
      const restoredEdges = data.edges.map(edge => ({
        ...edge,
        label: edge.data?.label || edge.id 
      }));
      setNodes(restoredNodes);
      setEdges(restoredEdges);
      if (data.globalSettings) {
        setGlobalSettings(prev => ({ ...prev, ...data.globalSettings }));
      }
    }
  }, [handleValveChange, handleRotation, setNodes, setEdges]);

  useEffect(() => {
    loadData(examplePFD);
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

  const updateNodeData = useCallback((nodeId, newData) => {
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
  }, [selectedNode, setNodes]);

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

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
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
          ...(type === 'centrifugal_pump' && { flow_rated_lmin: 100.0, pressure_rated_bar: 5.0, rise_to_shutoff_pct: 20.0 }),
          ...(type === 'pump' && { flow_rated_lmin: 100.0, pressure_rated_bar: 5.0, rise_to_shutoff_pct: 20.0 }),
          ...(type === 'volumetric_pump' && { flow_rated: 100.0, motor_power: 5.0, efficiency: 85.0 }),
          ...(type === 'tank' && { level: 2.0, elevation: 0.0, temperature: 313.15 }),
          ...(type === 'linear_control_valve' && { max_cv: 0.05, opening: 50.0 }),
          ...(type === 'linear_regulator' && { max_cv: 0.05, set_pressure: 500000.0, backpressure: false }),
          ...(type === 'orifice' && { pipe_diameter: 0.1, orifice_diameter: 0.07 }),
          ...(type === 'filter' && { dp_clean: 0.2, dp_terminal: 1.0, flow_ref: 100.0, clogging: 0.0 }),
          ...(type === 'heat_exchanger' && { heat_duty_kw: -10.0 }),
          ...(type === 'remote_control_valve' && { max_cv: 0.05, set_pressure: 500000.0 }),
          ...(type === 'three_way_tcv' && { max_cv: 0.1, set_temperature_c: 40.0, hot_port_idx: 0 }),
        },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, handleValveChange, handleRotation, setNodes]
  );

  const onSave = useCallback(() => {
    const flowData = { nodes, edges, globalSettings };
    const blob = new Blob([JSON.stringify(flowData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'walflow-pfd.json';
    link.click();
    URL.revokeObjectURL(url);
  }, [nodes, edges, globalSettings]);

  const onDeleteNode = useCallback((nodeId) => {
    setNodes((nds) => nds.filter((node) => node.id !== nodeId));
    setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    setSelectedNode(null);
  }, [setNodes, setEdges]);

  const onDeleteEdge = useCallback((edgeId) => {
    setEdges((eds) => eds.filter((edge) => edge.id !== edgeId));
    setSelectedEdge(null);
  }, [setEdges]);

  const onClearCanvas = useCallback(() => {
    if (window.confirm('Are you sure you want to clear the entire canvas?')) {
      setNodes([]);
      setEdges([]);
      setSelectedNode(null);
      setSelectedEdge(null);
    }
  }, [setNodes, setEdges]);

  useEffect(() => {
    let socket = null;
    let reconnectTimeout = null;

    const connect = () => {
      socket = new WebSocket('ws://localhost:8000/ws/simulate');
      ws.current = socket;

      socket.onopen = () => {
        console.log('Connected to Python WalFlow Engine!');
        setIsConnected(true);
      };

      socket.onclose = () => {
        console.log('Disconnected from Python WalFlow Engine');
        setIsConnected(false);
        reconnectTimeout = setTimeout(connect, 3000);
      };

      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.status === 'success') {
          setIsSimulating(false);
          if (data.stats) setLastStats(data.stats);
          if (data.telemetry && data.telemetry.nodes) {
            setNodes((nds) => nds.map((node) => {
              const nodeTele = data.telemetry.nodes[node.id];
              if (!nodeTele) return node;
              
              const newData = { ...node.data, telemetry: nodeTele };
              if (nodeTele.opening_pct !== undefined) newData.opening = nodeTele.opening_pct;
              return { ...node, data: newData };
            }));
          }

          if (data.telemetry && data.telemetry.edges) {
            setEdges((eds) => eds.map((edge) => {
              const edgeTele = data.telemetry.edges[edge.id];
              if (!edgeTele) return edge;
              return { ...edge, data: { ...edge.data, telemetry: edgeTele } };
            }));
          }
        } else if (data.status === 'error') {
          setIsSimulating(false);
          alert(`Simulation Error: ${data.message}`);
        }
      };
    };

    connect();

    return () => {
      if (socket) socket.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [setNodes, setEdges]);

  useEffect(() => {
    const handler = setTimeout(() => {
      if (isConnected && ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ 
          action: 'update_graph', 
          graph: { 
            nodes, 
            edges, 
            global_settings: globalSettings 
          } 
        }));
      }
    }, 250);

    return () => clearTimeout(handler);
  }, [nodes, edges, isConnected, globalSettings]);

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
    customRanges: {
      pressure: { min: 0.0, max: 6.0 },
      temperature: { min: 20.0, max: 60.0 },
      velocity: { min: 0.0, max: 200.0 }
    }
  });

  const computedHeatmapRange = useMemo(() => {
    const mode = heatmapSettings.mode;
    if (mode === 'default') return { min: 0, max: 1 };

    if (!heatmapSettings.autoScale) {
      const custom = heatmapSettings.customRanges[mode];
      return custom || { min: 0, max: 10 };
    }

    let minVal = Infinity;
    let maxVal = -Infinity;

    edges.forEach((e) => {
      const tele = e.data?.telemetry || {};
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
      } else if (mode === 'velocity') {
        const q1 = tele.inlets?.[0]?.flow_rate != null ? Math.abs(tele.inlets[0].flow_rate * 60000.0) : null;
        const q2 = tele.outlets?.[0]?.flow_rate != null ? Math.abs(tele.outlets[0].flow_rate * 60000.0) : null;
        if (q1 !== null) { minVal = Math.min(minVal, q1); maxVal = Math.max(maxVal, q1); }
        if (q2 !== null) { minVal = Math.min(minVal, q2); maxVal = Math.max(maxVal, q2); }
      }
    });

    if (minVal === Infinity || maxVal === -Infinity || Math.abs(maxVal - minVal) < 1e-4) {
      if (mode === 'pressure') return { min: 0.0, max: 6.0 };
      if (mode === 'temperature') return { min: 20.0, max: 60.0 };
      if (mode === 'velocity') return { min: 0.0, max: 200.0 };
    }

    return { min: Math.max(0, minVal), max: maxVal };
  }, [edges, heatmapSettings.mode, heatmapSettings.autoScale, heatmapSettings.customRanges]);

  const styledEdges = useMemo(() => {
    return edges.map(edge => {
      const isSignal = edge.data?.type === 'SIGNAL';
      const hasFlow = isSimulating || (edge.data && edge.data.flow_rate && Math.abs(edge.data.flow_rate) > 1e-5);
      return {
        ...edge,
        type: isSignal ? 'signal' : 'pipe',
        animated: !isSignal && hasFlow,
        className: (!isSignal && hasFlow) ? 'simulating' : '',
        data: {
          ...edge.data,
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
  }, [edges, isSimulating, heatmapSettings.mode, computedHeatmapRange]);

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', backgroundColor: '#F0F4F4', overflow: 'hidden' }}>
      <Sidebar 
        onSave={onSave} 
        onLoad={loadData} 
        onClear={onClearCanvas} 
        onCalculate={runSimulation}
        isSimulating={isSimulating}
        globalSettings={globalSettings}
        onUpdateGlobalSettings={setGlobalSettings}
        lastStats={lastStats}
        templates={{
          "Standard PFD": examplePFD,
          "Volumetric Pump Example": exampleVolumetric,
          "Pressure Reducing (PRV)": examplePRV,
          "Backpressure (BPR)": exampleBPR,
          "API 614 LOS": exampleAPI614,
          "Remote Control Test": exampleRemoteControl
        }}
        />

      <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        <div style={{ flexGrow: 1, position: 'relative' }} ref={reactFlowWrapper}>
          <DetailPanel 
            selectedNode={selectedNode} 
            allNodes={nodes}
            allEdges={edges}
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
          />

          <ReactFlow 
            nodes={nodes} 
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
            </Controls>
          </ReactFlow>

          <HeatmapLegend 
            heatmapMode={heatmapSettings.mode} 
            onModeChange={(mode) => setHeatmapSettings(prev => ({ ...prev, mode }))}
            autoScale={heatmapSettings.autoScale}
            onToggleAutoScale={() => setHeatmapSettings(prev => ({ ...prev, autoScale: !prev.autoScale }))}
            activeRange={computedHeatmapRange}
            customRange={heatmapSettings.customRanges[heatmapSettings.mode]}
            onUpdateCustomRange={(min, max) => setHeatmapSettings(prev => ({
              ...prev,
              customRanges: {
                ...prev.customRanges,
                [prev.mode]: { min, max }
              }
            }))}
            onResetCustomRange={() => setHeatmapSettings(prev => ({
              ...prev,
              customRanges: {
                ...prev.customRanges,
                [prev.mode]: prev.mode === 'pressure' ? { min: 0.0, max: 6.0 } : prev.mode === 'temperature' ? { min: 20.0, max: 60.0 } : { min: 0.0, max: 200.0 }
              }
            }))}
          />
        </div>

        
        <DataList 
          nodes={nodes} 
          edges={edges} 
          onUpdateEdge={updateEdgeData} 
          onUpdateNode={updateNodeData}
          onSelectNode={selectNodeById}
          onSelectEdge={selectEdgeById}
        />
      </div>
    </div>
  );
}
