from typing import List, Dict, Any, Optional
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
from simulation.equipment.three_way_tcv import ThreeWayTCV
from simulation.equipment.check_valve import CheckValve
from simulation.equipment.check_valve_orifice import CheckValveOrifice
from simulation.equipment.pressure_safety_valve import PressureSafetyValve
from simulation.equipment.rupture_disc import RuptureDisc
from simulation.equipment.base_node import HydraulicNode

class GraphParser:
    @staticmethod
    def resolve_graph_for_case(graph: ReactFlowGraph, target_case_id: Optional[str] = None) -> ReactFlowGraph:
        """
        Creates a new ReactFlowGraph instance where the active case (or target_case_id) overrides
        have been layered on top of the baseline node data and global settings.
        """
        if not graph.cases:
            return graph
        
        case_id = target_case_id or graph.active_case_id
        if not case_id:
            return graph

        selected_case = next((c for c in graph.cases if c.id == case_id), None)
        if not selected_case:
            return graph

        # Clone global settings with overrides if present
        resolved_global_settings = graph.global_settings.copy() if graph.global_settings else None
        if resolved_global_settings and selected_case.overrides and selected_case.overrides.global_settings:
            for key, val in selected_case.overrides.global_settings.items():
                if hasattr(resolved_global_settings, key):
                    setattr(resolved_global_settings, key, val)

        # Clone nodes with node-level overrides if present
        resolved_nodes = []
        node_overrides = (selected_case.overrides.nodes if selected_case.overrides else {}) or {}
        for node in graph.nodes:
            if node.id in node_overrides:
                merged_data = {**node.data, **node_overrides[node.id]}
                resolved_nodes.append(ReactFlowNode(
                    id=node.id,
                    type=node.type,
                    position=node.position,
                    data=merged_data
                ))
            else:
                resolved_nodes.append(node)

        return ReactFlowGraph(
            nodes=resolved_nodes,
            edges=graph.edges,
            global_settings=resolved_global_settings,
            cases=graph.cases,
            active_case_id=case_id
        )

    @staticmethod
    def parse_graph(graph: ReactFlowGraph, case_id: Optional[str] = None) -> HydraulicNetwork:
        """
        Converts a React Flow graph into a HydraulicNetwork, layering operating case overrides if specified.
        """
        resolved_graph = GraphParser.resolve_graph_for_case(graph, case_id)

        # 1. Instantiate Equipment Nodes (ignoring non-hydraulic visual annotations)
        nodes_dict: Dict[str, HydraulicNode] = {}
        for node_data in resolved_graph.nodes:
            if node_data.type in ['text_bubble', 'note', 'annotation']:
                continue
            node = GraphParser.create_node(node_data, resolved_graph.global_settings)
            node.id = node_data.id
            nodes_dict[node_data.id] = node

        # 2. Map Connections (Edges)
        parsed_edges = []
        
        for edge in resolved_graph.edges:

            edge_data = edge.data or {}
            
            # Identify Signal Edges (Yellow Links)
            edge_type = str(edge_data.get('type', '')).upper()
            if edge_type == 'SIGNAL':
                source_node = nodes_dict.get(edge.source)
                target_node = nodes_dict.get(edge.target)
                if isinstance(target_node, RemoteControlValve):
                    # Handle IDs like "signal-inlet-0" or just "inlet-0"
                    handle_id = str(edge.sourceHandle or "")
                    parts = handle_id.split('-')
                    if len(parts) >= 2:
                        port_type = parts[-2] # "inlet" or "outlet"
                        port_idx = int(parts[-1])
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
            pipe.global_settings = resolved_graph.global_settings
            
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

        # Auto-detect connected pipe diameter for Orifice, CheckValveOrifice, and RuptureDisc nodes
        for node_id, node in nodes_dict.items():
            if hasattr(node, 'orifice_diameter') or getattr(node, 'bore_type', '') == 'reduced_bore':
                connected_d = None
                # Check connected inlet pipes (upstream pipe diameter takes precedence)
                for edge_info in parsed_edges:
                    if edge_info["target"] == node_id and edge_info["pipe"].diameter > 0:
                        connected_d = edge_info["pipe"].diameter
                        break
                # Check connected outlet pipes if no inlet pipe found
                if connected_d is None:
                    for edge_info in parsed_edges:
                        if edge_info["source"] == node_id and edge_info["pipe"].diameter > 0:
                            connected_d = edge_info["pipe"].diameter
                            break
                if connected_d is not None and connected_d > 0:
                    node.pipe_diameter = connected_d
                elif not getattr(node, 'pipe_diameter', 0):
                    node.pipe_diameter = 0.05248 # Default fallback (DN50)

        network = HydraulicNetwork(nodes=nodes_dict, edges=parsed_edges)
        network.global_settings = resolved_graph.global_settings
        network.active_case_id = resolved_graph.active_case_id
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
                rated_cooling_kw=float(d.get('rated_cooling_kw', 300.0)),
                rated_flow_lmin=float(d.get('rated_flow_lmin', 500.0)),
                design_inlet_temp_c=float(d.get('design_inlet_temp_c', 50.0)),
                medium_temp_c=float(d.get('medium_temp_c', 10.0)),
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
        elif t == 'three_way_tcv':
            node = ThreeWayTCV(
                name=name,
                max_cv=float(d.get('max_cv', 0.1)),
                set_temperature=float(d.get('set_temperature_c', 40.0)) + 273.15,
                hot_port_idx=int(d.get('hot_port_idx', 0))
            )
        elif t == 'check_valve':
            node = CheckValve(
                name=name,
                cv=float(d.get('cv', 10.0)),
                cracking_pressure_bar=float(d.get('cracking_pressure_bar', 0.05))
            )
        elif t == 'check_valve_orifice':
            node = CheckValveOrifice(
                name=name,
                cv=float(d.get('cv', 10.0)),
                cracking_pressure_bar=float(d.get('cracking_pressure_bar', 0.05)),
                pipe_diameter=float(d.get('pipe_diameter', 0.1)),
                orifice_diameter=float(d.get('orifice_diameter', 0.01))
            )
        elif t == 'pressure_safety_valve' or t == 'psv':
            node = PressureSafetyValve(
                name=name,
                set_pressure_bar=float(d.get('set_pressure_bar', 20.0)),
                cv=float(d.get('cv', 10.0)),
                action_mode=str(d.get('action_mode', 'pop_action')),
                blowdown_pct=float(d.get('blowdown_pct', 7.0)),
                forced_state=str(d.get('forced_state', 'auto'))
            )
        elif t == 'rupture_disc':
            node = RuptureDisc(
                name=name,
                burst_pressure_bar=float(d.get('burst_pressure_bar', 25.0)),
                bore_type=str(d.get('bore_type', 'full_bore')),
                cv=float(d.get('cv', 10.0)),
                pipe_diameter=float(d.get('pipe_diameter', 0.05248)),
                orifice_diameter=float(d.get('orifice_diameter', 0.01)),
                forced_state=str(d.get('forced_state', 'auto'))
            )
        else:
            node = HydraulicNode(name=name, node_type=t)
        
        if node:
            node.global_settings = global_settings
            if 'active' in d:
                node.active = bool(d['active'])
        return node
