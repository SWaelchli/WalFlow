from typing import List, Dict, Any
from simulation.schemas import ReactFlowGraph, ReactFlowNode, ReactFlowEdge, HydraulicNetwork
from simulation.equipment.tank import Tank
from simulation.equipment.pump import Pump
from simulation.equipment.valve import Valve
from simulation.equipment.pipe import Pipe
from simulation.equipment.orifice import Orifice
from simulation.equipment.splitter import Splitter
from simulation.equipment.mixer import Mixer
from simulation.equipment.heat_exchanger import HeatExchanger
from simulation.equipment.filter import Filter
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
            node = GraphParser.create_node(node_data, graph.global_settings)
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
            pipe.global_settings = graph.global_settings
            
            # Connect the source equipment to the pipe inlet
            source_node = nodes_dict.get(edge.source)
            target_node = nodes_dict.get(edge.target)
            
            if source_node and target_node:
                parsed_edges.append({
                    "id": edge.id,
                    "source": edge.source,
                    "target": edge.target,
                    "source_port": edge.sourceHandle,
                    "target_port": edge.targetHandle,
                    "pipe": pipe
                })

        return HydraulicNetwork(nodes=nodes_dict, edges=parsed_edges)

    @staticmethod
    def create_node(node_data: ReactFlowNode, global_settings: Any = None) -> HydraulicNode:
        t = node_data.type
        d = node_data.data
        name = d.get('label', f"{t}_{node_data.id}")
        
        node = None
        if t == 'tank':
            # Priority: Node data > Global settings > Default
            fluid_type = d.get('fluid_type')
            if not fluid_type and global_settings:
                fluid_type = getattr(global_settings, 'fluid_type', 'water')
            if not fluid_type:
                fluid_type = 'water'

            node = Tank(
                name=name,
                elevation=float(d.get('elevation', 0.0)),
                fluid_level=float(d.get('level', 1.0)),
                temperature=float(d.get('temperature', 293.15)),
                fluid_type=fluid_type
            )
        elif t == 'pump':
            node = Pump(
                name=name,
                A=float(d.get('A', 80.0)),
                B=float(d.get('B', 0.0)),
                C=float(d.get('C', -2000.0))
            )
        elif t == 'valve':
            node = Valve(
                name=name,
                max_cv=float(d.get('max_cv', 0.05)),
                opening_pct=float(d.get('opening', 50.0))
            )
        elif t == 'orifice':
            node = Orifice(
                name=name,
                pipe_diameter=float(d.get('pipe_diameter', 0.1)),
                orifice_diameter=float(d.get('orifice_diameter', 0.07))
            )
        elif t == 'heat_exchanger':
            node = HeatExchanger(
                name=name,
                heat_duty=float(d.get('heat_duty_kw', 0.0)) * 1000.0,
                # Use a default or look for k_factor in data
                pressure_drop_factor=float(d.get('k_factor', 10.0))
            )
        elif t == 'filter':
            node = Filter(
                name=name,
                resistance_clean=float(d.get('resistance', 1000.0)),
                clogging_factor=float(d.get('clogging_factor', 1.0))
            )
        elif t == 'splitter':
            # 1 inlet, 2 outlets
            node = Splitter(name=name, num_outlets=2)
        elif t == 'mixer':
            # 2 inlets, 1 outlet
            node = Mixer(name=name, num_inlets=2)
        else:
            node = HydraulicNode(name=name, node_type=t)
        
        if node:
            node.global_settings = global_settings
        return node
