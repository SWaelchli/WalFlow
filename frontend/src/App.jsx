import ReactFlow, { 
  Background, 
  Controls, 
  MiniMap, 
  useNodesState, 
  useEdgesState,
  addEdge
} from 'reactflow';
import 'reactflow/dist/style.css'; 
import { useEffect, useRef, useState, useCallback } from 'react';

// Import all custom equipment nodes
import TankNode from './nodes/TankNode';
import PumpNode from './nodes/PumpNode';
import OrificeNode from './nodes/OrificeNode';
import LinearControlValveNode from './nodes/LinearControlValveNode';
import LinearRegulatorNode from './nodes/LinearRegulatorNode';
import FilterNode from './nodes/FilterNode';
import HeatExchangerNode from './nodes/HeatExchangerNode';
import SplitterNode from './nodes/SplitterNode';
import MixerNode from './nodes/MixerNode';

import Sidebar from './Sidebar';
import PropertyEditor from './PropertyEditor';
import DataList from './DataList';

// Import Examples
import examplePFD from '../Example_PFD.json';
import examplePRV from '../Example_PRV.json';
import exampleBPR from '../Example_BPR.json';

const nodeTypes = {
  tank: TankNode,
  pump: PumpNode,
  orifice: OrificeNode,
  linear_control_valve: LinearControlValveNode,
  linear_regulator: LinearRegulatorNode,
  filter: FilterNode,
  heat_exchanger: HeatExchangerNode,
  splitter: SplitterNode,
  mixer: MixerNode,
};

let idCount = 50; // High start to avoid conflicts with examples
const getId = () => `node_${idCount++}`;

export default function App() {
  const reactFlowWrapper = useRef(null);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const ws = useRef(null);
  
    const [selectedNode, setSelectedNode] = useState(null);
    const [selectedEdge, setSelectedEdge] = useState(null);
  
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [edgeIdCount, setEdgeIdCount] = useState(100);
    const [isSimulating, setIsSimulating] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [globalSettings, setGlobalSettings] = useState({
      fluid_type: 'water',
      ambient_temperature: 293.15,
      atmospheric_pressure: 101325.0,
      global_roughness: 0.000045,
      property_iterations: 5,
      tolerance: 1e-6,
      max_iterations: 1000
    });
  
    const runSimulation = useCallback(() => {
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        setIsSimulating(true);
        ws.current.send(JSON.stringify({ action: 'run_simulation' }));
      }
    }, []);

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

    // Internal Load Function (supports handle matching)
    const loadData = useCallback((data) => {
      if (data.nodes && data.edges) {
        const restoredNodes = data.nodes.map(node => ({
          ...node,
          data: {
            ...node.data,
            onChange: node.type === 'linear_control_valve' ? handleValveChange : undefined
          }
        }));
        setNodes(restoredNodes);
        setEdges(data.edges);
        if (data.globalSettings) {
          setGlobalSettings(data.globalSettings);
        }
      }
    }, [handleValveChange, setNodes, setEdges]);

    // Initialize with default example
    useEffect(() => {
      loadData(examplePFD);
    }, []);

    const onConnect = useCallback((params) => {
    setEdges((eds) => {
      const newId = `Pipe ${edgeIdCount}`;
      const newEdge = { 
        ...params, 
        id: newId,
        animated: true, 
        data: { label: newId, length: 25.0, diameter: 0.05248 } 
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
          const updatedEdge = { ...edge, data: { ...edge.data, ...newData } };
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
          label: `${type.toUpperCase()} ${idCount}`, 
          onChange: type === 'linear_control_valve' ? handleValveChange : undefined,
          ...(type === 'pump' && { A: 80.0, B: 0.0, C: -2000.0 }),
          ...(type === 'tank' && { level: 2.0, elevation: 0.0, temperature: 313.15 }),
          ...(type === 'linear_control_valve' && { max_cv: 0.05, opening: 50.0 }),
          ...(type === 'linear_regulator' && { max_cv: 0.05, set_pressure: 500000.0, backpressure: false }),
          ...(type === 'orifice' && { pipe_diameter: 0.1, orifice_diameter: 0.07 }),
          ...(type === 'filter' && { resistance: 1000.0 }),
          ...(type === 'heat_exchanger' && { heat_duty_kw: -10.0 }),
        },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, handleValveChange, setNodes]
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

  // WebSocket Connection
  useEffect(() => {
    ws.current = new WebSocket('ws://localhost:8000/ws/simulate');

    ws.current.onopen = () => {
      console.log('Connected to Python WalFlow Engine!');
      setIsConnected(true);
    };

    ws.current.onclose = () => {
      console.log('Disconnected from Python WalFlow Engine');
      setIsConnected(false);
    };

    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.status === 'success') {
        setIsSimulating(false);
        if (data.telemetry && data.telemetry.nodes) {
          setNodes((nds) => 
            nds.map((node) => {
              const nodeTelemetry = data.telemetry.nodes[node.id];
              if (nodeTelemetry) {
                const newData = { ...node.data, telemetry: nodeTelemetry };
                // If backend sent an updated opening percentage, sync it to the main data field
                if (nodeTelemetry.opening_pct !== undefined) {
                  newData.opening = nodeTelemetry.opening_pct;
                }
                return { ...node, data: newData };
              }
              return node;
            })
          );
        }
        if (data.telemetry && data.telemetry.edges) {
          setEdges((eds) => 
            eds.map((edge) => {
              const edgeTelemetry = data.telemetry.edges[edge.id];
              return edgeTelemetry ? { ...edge, data: { ...edge.data, telemetry: edgeTelemetry } } : edge;
            })
          );
        }
      } else if (data.status === 'error') {
        setIsSimulating(false);
        alert(`Simulation Error: ${data.message}`);
      }
    };

    return () => { if (ws.current) ws.current.close(); };
  }, []);

  // Update backend on change (Debounced to ensure consistency)
  useEffect(() => {
    const handler = setTimeout(() => {
      if (isConnected && ws.current && ws.current.readyState === WebSocket.OPEN) {
        console.log('Sending graph update to backend...');
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

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', backgroundColor: '#f4f4f5' }}>
      <Sidebar 
        onSave={onSave} 
        onLoad={loadData} 
        onClear={onClearCanvas} 
        onCalculate={runSimulation}
        isSimulating={isSimulating}
        globalSettings={globalSettings}
        onUpdateGlobalSettings={setGlobalSettings}
        templates={{
          "Standard PFD": examplePFD,
          "Pressure Reducing (PRV)": examplePRV,
          "Backpressure (BPR)": exampleBPR
        }}
      />

      <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        <div style={{ flexGrow: 1, position: 'relative' }} ref={reactFlowWrapper}>
          <PropertyEditor 
            node={selectedNode} 
            edge={selectedEdge}
            onUpdate={updateNodeData} 
            onUpdateEdge={updateEdgeData}
            onDelete={onDeleteNode} 
            onDeleteEdge={onDeleteEdge}
          />

          <ReactFlow 
            nodes={nodes} 
            edges={edges} 
            nodeTypes={nodeTypes} 
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
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
            <Background color="#ccc" gap={16} />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>
        
        <DataList nodes={nodes} edges={edges} onUpdateEdge={updateEdgeData} />
      </div>
    </div>
  );
}
