import ReactFlow, { Background, Controls, MiniMap, useNodesState, useEdgesState } from 'reactflow';
import 'reactflow/dist/style.css'; 
import { useEffect, useRef, useState, useCallback } from 'react';

// Import all 4 custom equipment nodes
import TankNode from './nodes/TankNode';
import PumpNode from './nodes/PumpNode';
import OrificeNode from './nodes/OrificeNode';
import ValveNode from './nodes/ValveNode';

const nodeTypes = {
  tank: TankNode,
  pump: PumpNode,
  orifice: OrificeNode,
  valve: ValveNode,
};

const initialEdges = [
  { id: 'edge-1', source: 'tank-a', target: 'pump-1', sourceHandle: 'outlet', targetHandle: 'inlet', animated: true },
  { id: 'edge-2', source: 'pump-1', target: 'orifice-1', sourceHandle: 'outlet', targetHandle: 'inlet', animated: true },
  { id: 'edge-3', source: 'orifice-1', target: 'valve-1', sourceHandle: 'outlet', targetHandle: 'inlet', animated: true },
  { id: 'edge-4', source: 'valve-1', target: 'tank-b', sourceHandle: 'outlet', targetHandle: 'inlet', animated: true },
];

export default function App() {
  // We use a React "ref" to hold onto the WebSocket connection without causing the screen to redraw
  const ws = useRef(null);
  
  // A new piece of state to hold the live flow rate coming back from Python
  const [flowRate, setFlowRate] = useState(0.0);

  // Define the function that the valve slider will call when it moves
  const handleValveChange = useCallback((newValue) => {
    // If the socket is open and ready, fire the JSON command to Python!
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ action: 'update_valve', value: parseFloat(newValue) }));
    }
  }, []);

  // The initial blueprint. Notice we pass handleValveChange directly into the valve's data!
  const initialNodes = [
    { 
      id: 'tank-a', 
      type: 'tank', 
      position: { x: 50, y: 150 }, 
      data: { label: 'Source Tank', level: 2.0, elevation: 0.0 } 
    },
    { 
      id: 'pump-1', 
      type: 'pump', 
      position: { x: 250, y: 170 }, 
      data: { label: 'Booster Pump', A: 80.0, B: 0.0, C: -2000.0 } 
    },
    { 
      id: 'orifice-1', 
      type: 'orifice', 
      position: { x: 400, y: 175 }, 
      data: { label: 'Flow Meter', pipe_diameter: 0.1, orifice_diameter: 0.07 } 
    },
    { 
      id: 'valve-1', 
      type: 'valve', 
      position: { x: 550, y: 140 }, 
      data: { label: 'FCV-101', opening: 50, max_cv: 0.05, onChange: handleValveChange } 
    },
    { 
      id: 'tank-b', 
      type: 'tank', 
      position: { x: 750, y: 150 }, 
      data: { label: 'Dest Tank', level: 2.0, elevation: 20.0 } 
    },
  ];

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // This block runs once when the app first loads to connect the WebSocket
  useEffect(() => {
    ws.current = new WebSocket('ws://localhost:8000/ws/simulate');

    ws.current.onopen = () => {
      console.log('Connected to Python WalFlow Engine!');
      
      // When we connect, send the initial graph to the backend
      ws.current.send(JSON.stringify({ 
        action: 'update_graph', 
        graph: { nodes, edges } 
      }));
      
      // Also trigger a valve update to start the loop
      ws.current.send(JSON.stringify({ action: 'update_valve', value: 50.0 }));
    };

    // Every time Python finishes the Newton-Raphson math, it sends data here
    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.status === 'success') {
        // Update the big flow rate number on the screen
        setFlowRate(data.flow_rate_m3s);
      } else if (data.status === 'error') {
        console.error('Simulation Error:', data.message);
      } else if (data.status === 'waiting') {
        console.log('Backend waiting:', data.message);
      }
    };

    // Cleanup the connection if the user closes the browser
    return () => {
      if (ws.current) ws.current.close();
    };
  }, []);

  // Update backend graph when nodes or edges change (simplified for now)
  // In a real app, we might debounce this to avoid excessive traffic
  useEffect(() => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ 
        action: 'update_graph', 
        graph: { nodes, edges } 
      }));
    }
  }, [nodes, edges]);

  return (
    <div style={{ width: '100vw', height: '100vh', backgroundColor: '#f4f4f5', position: 'relative' }}>
      
      {/* Heads-Up Display for the live Flow Rate */}
      <div style={{
        position: 'absolute', top: 20, left: 20, zIndex: 10,
        background: '#fff', padding: '15px 25px', borderRadius: '8px',
        border: '2px solid #0f172a', boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
      }}>
        <h3 style={{ margin: 0, color: '#475569', fontSize: '14px' }}>System Flow Rate</h3>
        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#0284c7' }}>
          {flowRate} <span style={{ fontSize: '14px', color: '#64748b' }}>m³/s</span>
        </div>
      </div>

      <ReactFlow 
        nodes={nodes} 
        edges={edges} 
        nodeTypes={nodeTypes} 
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
      >
        <Background color="#ccc" gap={16} />
        <Controls />
        <MiniMap nodeStrokeColor="#000" nodeColor="#fff" />
      </ReactFlow>
    </div>
  );
}