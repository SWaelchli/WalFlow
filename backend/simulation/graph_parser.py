from typing import List, Dict, Any
from simulation.schemas import ReactFlowGraph, ReactFlowNode, ReactFlowEdge, HydraulicNetwork
from simulation.equipment.tank import Tank
from simulation.equipment.centrifugal_pump import CentrifugalPump
from simulation.equipment.volumetric_pump import VolumetricPump
from simulation.equipment.linear_control_valve import LinearControlValve
from simulation.equipment.linear_regulator import LinearRegulator
from simulation.equipment.pipe import Pipe
from simulation.equipment.orifice import Orifice
from simulation.equipment.splitter import Splitter
from simulation.equipment.mixer import Mixer
from simulation.equipment.heat_exchanger import HeatExchanger
from simulation.equipment.filter import Filter
from simulation.equipment.remote_control_valve import RemoteControlValve
from simulation.equipment.base_node import HydraulicNode

class GraphParser:
    @staticmethod
    def parse_graph(graph: ReactFlowGraph) -> HydraulicNetwork:
        """
        Converts a React Flow graph into a HydraulicNetwork.
        """
        # 1. Instantiate Equipment Nodes
        nodes_dict: Dict[str, HydraulicNode] = {}
        for node_data in graph.nodes:
            node = GraphParser.create_node(node_data, graph.global_settings)
            nodes_dict[node_data.id] = node

        # 2. Map Connections (Edges)
        parsed_edges = []
        
        for edge in graph.edges:
            edge_data = edge.data or {}
            
            # Identify Signal Edges (Yellow Links)
            edge_type = str(edge_data.get('type', '')).upper()
            if edge_type == 'SIGNAL':
                source_node = nodes_dict.get(edge.source)
                target_node = nodes_dict.get(edge.target)
                if isinstance(target_node, RemoteControlValve):
                    # Handle IDs like "signal-inlet-0" or "signal-outlet-1"
                    handle_id = str(edge.sourceHandle or "")
                    parts = handle_id.split('-')
                    if len(parts) >= 3:
                        port_type = parts[1] # "inlet" or "outlet"
                        port_idx = int(parts[2])
                        target_node.remote_sensing_config = {
                            "node_id": edge.source,
                            "port_type": port_type,
                            "port_idx": port_idx
                        }
                    else:
                        # Fallback to node-level sensing (legacy)
                        target_node.remote_sensing_config = {
                            "node_id": edge.source,
                            "port_type": "outlet", # Default
                            "port_idx": 0
                        }
                continue # Do not create a Pipe for signal edges

            # Create a Pipe node for this hydraulic edge
            pipe = Pipe(
                name=f"Pipe {edge.id}",
                length=float(edge_data.get('length', 25.0)),
                diameter=float(edge_data.get('diameter', 0.1)),
                friction_factor=float(edge_data.get('friction_factor', 0.02))
            )
            pipe.global_settings = graph.global_settings
            
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

        network = HydraulicNetwork(nodes=nodes_dict, edges=parsed_edges)
        network.global_settings = graph.global_settings
        return network

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
        elif t == 'centrifugal_pump' or t == 'pump':
            flow_rated_lmin = float(d.get('flow_rated_lmin', 100.0))
            pressure_rated_bar = float(d.get('pressure_rated_bar', 5.0))
            rise_pct = float(d.get('rise_to_shutoff_pct', 20.0))

            node = CentrifugalPump(
                name=name,
                flow_rated=flow_rated_lmin / 60000.0,
                pressure_rated=pressure_rated_bar * 100000.0,
                rise_to_shutoff_pct=rise_pct
            )
        elif t == 'volumetric_pump':
            # flow_rated in L/min -> convert to m3/s
            flow_lmin = float(d.get('flow_rated', 100.0))
            flow_m3s = flow_lmin / 60000.0
            
            # motor_power in kW -> convert to W
            power_kw = float(d.get('motor_power', 5.0))
            power_w = power_kw * 1000.0
            
            # efficiency in % -> convert to decimal
            eff_pct = float(d.get('efficiency', 85.0))
            eff_dec = eff_pct / 100.0

            node = VolumetricPump(
                name=name,
                flow_rated=flow_m3s,
                motor_power=power_w,
                efficiency=eff_dec
            )
        elif t == 'linear_control_valve':
            node = LinearControlValve(
                name=name,
                max_cv=float(d.get('max_cv', 0.05)),
                opening_pct=float(d.get('opening', 50.0))
            )
        elif t == 'remote_control_valve':
            node = RemoteControlValve(
                name=name,
                max_cv=float(d.get('max_cv', 0.05)),
                set_pressure=float(d.get('set_pressure', 500000.0)),
                backpressure=bool(d.get('backpressure', False))
            )
        elif t == 'linear_regulator':
            node = LinearRegulator(
                name=name,
                max_cv=float(d.get('max_cv', 0.05)),
                set_pressure=float(d.get('set_pressure', 500000.0)),
                backpressure=bool(d.get('backpressure', False))
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
                dp_clean_bar=float(d.get('dp_clean', 0.2)),
                dp_terminal_bar=float(d.get('dp_terminal', 1.0)),
                flow_ref_lmin=float(d.get('flow_ref', 100.0)),
                clogging_pct=float(d.get('clogging', 0.0))
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
