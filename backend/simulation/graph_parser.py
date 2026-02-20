from typing import List, Dict, Any
from simulation.schemas import ReactFlowGraph, ReactFlowNode, ReactFlowEdge, HydraulicNetwork
from simulation.equipment.tank import Tank
from simulation.equipment.pump import Pump
from simulation.equipment.valve import Valve
from simulation.equipment.pipe import Pipe
from simulation.equipment.orifice import Orifice
from simulation.equipment.splitter import Splitter
from simulation.equipment.mixer import Mixer
from simulation.equipment.base_node import HydraulicNode

class GraphParser:
    @staticmethod
    def parse_graph(graph: ReactFlowGraph) -> HydraulicNetwork:
        """
        Converts a React Flow graph into a HydraulicNetwork.
        Unlike Phase 7, this preserves the full branching structure.
        """
        # 1. Instantiate Equipment Nodes
        nodes_dict: Dict[str, HydraulicNode] = {}
        for node_data in graph.nodes:
            node = GraphParser.create_node(node_data)
            nodes_dict[node_data.id] = node

        # 2. Map Connections (Edges)
        # Every Edge in React Flow is also a Pipe in our physics.
        # We need to track the pipe object and the connections it forms.
        parsed_edges = []
        
        for edge in graph.edges:
            # Create a Pipe node for this edge
            edge_data = edge.data or {}
            pipe = Pipe(
                name=f"Pipe {edge.id}",
                length=float(edge_data.get('length', 25.0)),
                diameter=float(edge_data.get('diameter', 0.1)),
                friction_factor=float(edge_data.get('friction_factor', 0.02))
            )
            
            # Connect the source equipment to the pipe inlet
            source_node = nodes_dict.get(edge.source)
            target_node = nodes_dict.get(edge.target)
            
            if source_node and target_node:
                parsed_edges.append({
                    "source": edge.source,
                    "target": edge.target,
                    "pipe": pipe
                })

        return HydraulicNetwork(nodes=nodes_dict, edges=parsed_edges)

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
        elif t == 'splitter':
            # Count how many outlets we need (or default to 2)
            return Splitter(name=name, num_outlets=2)
        elif t == 'mixer':
            return Mixer(name=name, num_inlets=2)
        else:
            return HydraulicNode(name=name, node_type=t)
