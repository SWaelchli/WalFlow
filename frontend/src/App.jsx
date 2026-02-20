import ReactFlow, { Background, Controls, MiniMap, useNodesState, useEdgesState } from 'reactflow';
import 'reactflow/dist/style.css'; 

// 1. Import all 4 custom equipment nodes
import TankNode from './nodes/TankNode';
import PumpNode from './nodes/PumpNode';
import OrificeNode from './nodes/OrificeNode';
import ValveNode from './nodes/ValveNode';

// 2. Register them with React Flow
const nodeTypes = {
  tank: TankNode,
  pump: PumpNode,
  orifice: OrificeNode,
  valve: ValveNode,
};

// 3. The Blueprint: Lay them out in a row
const initialNodes = [
  { id: 'tank-a', type: 'tank', position: { x: 50, y: 150 }, data: { label: 'Source Tank', level: 2.0 } },
  { id: 'pump-1', type: 'pump', position: { x: 250, y: 170 }, data: {} },
  { id: 'orifice-1', type: 'orifice', position: { x: 400, y: 175 }, data: {} },
  { id: 'valve-1', type: 'valve', position: { x: 550, y: 140 }, data: { label: 'FCV-101', opening: 50 } },
  { id: 'tank-b', type: 'tank', position: { x: 750, y: 150 }, data: { label: 'Dest Tank', level: 20.0 } },
];

// 4. Connect the plumbing sequentially
const initialEdges = [
  { id: 'edge-1', source: 'tank-a', target: 'pump-1', sourceHandle: 'outlet', targetHandle: 'inlet', animated: true },
  { id: 'edge-2', source: 'pump-1', target: 'orifice-1', sourceHandle: 'outlet', targetHandle: 'inlet', animated: true },
  { id: 'edge-3', source: 'orifice-1', target: 'valve-1', sourceHandle: 'outlet', targetHandle: 'inlet', animated: true },
  { id: 'edge-4', source: 'valve-1', target: 'tank-b', sourceHandle: 'outlet', targetHandle: 'inlet', animated: true },
];

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  return (
    <div style={{ width: '100vw', height: '100vh', backgroundColor: '#f4f4f5' }}>
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