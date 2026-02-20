from typing import List, Dict, Any
from simulation.schemas import ReactFlowGraph, ReactFlowNode, ReactFlowEdge
from simulation.equipment.tank import Tank
from simulation.equipment.pump import Pump
from simulation.equipment.valve import Valve
from simulation.equipment.pipe import Pipe
from simulation.equipment.orifice import Orifice
from simulation.equipment.base_node import HydraulicNode

class GraphParser:
    @staticmethod
    def parse_graph(graph: ReactFlowGraph) -> List[HydraulicNode]:
        """
        Converts a React Flow graph into a list of HydraulicNode objects.
        For Phase 7, we assume a linear chain for simplicity.
        """
        nodes_dict: Dict[str, HydraulicNode] = {}
        
        # 1. Instantiate Nodes
        for node_data in graph.nodes:
            node = GraphParser.create_node(node_data)
            nodes_dict[node_data.id] = node

        # 2. Chain Nodes based on Edges
        # In Phase 7, every Edge is also a Pipe.
        # This means for every edge between A and B, we insert a Pipe node: A -> Pipe -> B
        
        # To maintain a simple list for the current solver, we need to find the order.
        # Let's find the start node (a tank with no incoming edges)
        
        incoming_counts = {node_id: 0 for node_id in nodes_dict}
        outgoing_edges: Dict[str, List[ReactFlowEdge]] = {node_id: [] for node_id in nodes_dict}
        
        for edge in graph.edges:
            if edge.target in incoming_counts:
                incoming_counts[edge.target] += 1
            if edge.source in outgoing_edges:
                outgoing_edges[edge.source].append(edge)

        start_nodes = [node_id for node_id, count in incoming_counts.items() 
                       if count == 0 and isinstance(nodes_dict[node_id], Tank)]
        
        if not start_nodes:
            # Fallback: just take the first tank
            start_nodes = [node_id for node_id, node in nodes_dict.items() if isinstance(node, Tank)]
            
        if not start_nodes:
            raise ValueError("No starting tank found in graph.")

        ordered_nodes = []
        current_node_id = start_nodes[0]
        visited = set()

        while current_node_id:
            if current_node_id in visited:
                break
            visited.add(current_node_id)
            
            # Add the equipment node
            equipment_node = nodes_dict[current_node_id]
            ordered_nodes.append(equipment_node)
            
            # Check outgoing edges to find the next node
            edges = outgoing_edges.get(current_node_id, [])
            if not edges:
                break
                
            # For Phase 7, we take the first edge and treat it as a Pipe
            edge = edges[0]
            
            # Create a Pipe node for this edge
            pipe_name = f"Pipe {edge.id}"
            
            # Extract pipe parameters from edge data if available, otherwise use defaults
            edge_data = edge.data or {}
                
            length = float(edge_data.get('length', 25.0))
            diameter = float(edge_data.get('diameter', 0.1))
            friction = float(edge_data.get('friction_factor', 0.02))
            
            pipe = Pipe(name=pipe_name, length=length, diameter=diameter, friction_factor=friction)
            ordered_nodes.append(pipe)
            
            current_node_id = edge.target
            
        return ordered_nodes

    @staticmethod
    def create_node(node_data: ReactFlowNode) -> HydraulicNode:
        t = node_data.type
        d = node_data.data
        name = d.get('label', f"{t}_{node_data.id}")
        
        if t == 'tank':
            return Tank(
                name=name,
                elevation=float(d.get('elevation', 0.0)),
                fluid_level=float(d.get('level', 1.0))
            )
        elif t == 'pump':
            return Pump(
                name=name,
                A=float(d.get('A', 80.0)),
                B=float(d.get('B', 0.0)),
                C=float(d.get('C', -2000.0))
            )
        elif t == 'valve':
            return Valve(
                name=name,
                max_cv=float(d.get('max_cv', 0.05)),
                opening_pct=float(d.get('opening', 50.0))
            )
        elif t == 'orifice':
            return Orifice(
                name=name,
                pipe_diameter=float(d.get('pipe_diameter', 0.1)),
                orifice_diameter=float(d.get('orifice_diameter', 0.07))
            )
        else:
            # Default to a generic node if unknown
            return HydraulicNode(name=name, node_type=t)
