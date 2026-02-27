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
import ValveNode from './nodes/ValveNode';
import FilterNode from './nodes/FilterNode';
import HeatExchangerNode from './nodes/HeatExchangerNode';
import SplitterNode from './nodes/SplitterNode';
import MixerNode from './nodes/MixerNode';

import Sidebar from './Sidebar';
import PropertyEditor from './PropertyEditor';

const nodeTypes = {
  tank: TankNode,
  pump: PumpNode,
  orifice: OrificeNode,
  valve: ValveNode,
  filter: FilterNode,
  heat_exchanger: HeatExchangerNode,
  splitter: SplitterNode,
  mixer: MixerNode,
};

const initialEdges = [
  { id: 'edge-1', source: 'tank-a', target: 'pump-1', sourceHandle: 'outlet-0', targetHandle: 'inlet-0', animated: true, data: { length: 25.0, diameter: 0.1 } },
];

let idCount = 0;
const getId = () => `node_${idCount++}`;

export default function App() {
  const reactFlowWrapper = useRef(null);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const ws = useRef(null);
  
  const [flowRate, setFlowRate] = useState(0.0);
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);

  const handleValveChange = useCallback((newValue, nodeId) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ 
        action: 'update_valve', 
        value: parseFloat(newValue),
        node_id: nodeId
      }));
    }
  }, []);

  const initialNodes = [
    { 
      id: 'tank-a', 
      type: 'tank', 
      position: { x: 50, y: 150 }, 
      data: { label: 'Source Tank', level: 2.0, elevation: 0.0, temperature: 313.15, fluid_type: 'iso_vg_46' } 
    },
    { 
      id: 'pump-1', 
      type: 'pump', 
      position: { x: 250, y: 170 }, 
      data: { label: 'Main Pump', A: 80.0, B: 0.0, C: -2000.0 } 
    },
  ];

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback((params) => {
    setEdges((eds) => addEdge({ ...params, animated: true, data: { length: 25.0, diameter: 0.1 } }, eds));
  }, [setEdges]);

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
          onChange: type === 'valve' ? handleValveChange : undefined,
          ...(type === 'pump' && { A: 80.0, B: 0.0, C: -2000.0 }),
          ...(type === 'tank' && { level: 2.0, elevation: 0.0, temperature: 313.15, fluid_type: 'iso_vg_46' }),
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
    const flowData = { nodes, edges };
    const blob = new Blob([JSON.stringify(flowData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'walflow-pfd.json';
    link.click();
    URL.revokeObjectURL(url);
  }, [nodes, edges]);

  const onLoad = useCallback((data) => {
    if (data.nodes && data.edges) {
      const restoredNodes = data.nodes.map(node => ({
        ...node,
        data: {
          ...node.data,
          onChange: node.type === 'valve' ? handleValveChange : undefined
        }
      }));
      setNodes(restoredNodes);
      setEdges(data.edges);
    }
  }, [handleValveChange, setNodes, setEdges]);

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
      ws.current.send(JSON.stringify({ action: 'update_graph', graph: { nodes, edges } }));
    };

    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.status === 'success') {
        setFlowRate(data.flow_rate_m3s);
        if (data.telemetry && data.telemetry.nodes) {
          setNodes((nds) => 
            nds.map((node) => {
              const nodeTelemetry = data.telemetry.nodes[node.id];
              return nodeTelemetry ? { ...node, data: { ...node.data, telemetry: nodeTelemetry } } : node;
            })
          );
        }
      }
    };

    return () => { if (ws.current) ws.current.close(); };
  }, []);

  // Update backend on change
  useEffect(() => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ action: 'update_graph', graph: { nodes, edges } }));
    }
  }, [nodes, edges]);

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', backgroundColor: '#f4f4f5' }}>
      <Sidebar onSave={onSave} onLoad={onLoad} onClear={onClearCanvas} />

      <div style={{ flexGrow: 1, position: 'relative' }} ref={reactFlowWrapper}>
        <div style={{
          position: 'absolute', top: 20, left: 20, zIndex: 10,
          background: '#fff', padding: '15px 25px', borderRadius: '8px',
          border: '2px solid #0f172a', boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ margin: 0, color: '#475569', fontSize: '14px' }}>System Flow Rate</h3>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#0284c7' }}>
            {(flowRate * 60000).toFixed(1)} <span style={{ fontSize: '14px', color: '#64748b' }}>L/min</span>
          </div>
        </div>

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
    </div>
  );
}
