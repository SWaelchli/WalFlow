import numpy as np
from scipy.optimize import root
from typing import List, Dict, Any

from simulation.schemas import HydraulicNetwork
from simulation.equipment.base_node import HydraulicNode
from simulation.equipment.tank import Tank
from simulation.equipment.pipe import Pipe
from simulation.equipment.pump import Pump
from simulation.equipment.valve import Valve
from simulation.equipment.orifice import Orifice
from simulation.equipment.heat_exchanger import HeatExchanger
from simulation.equipment.filter import Filter
from simulation.fluid_utils import FluidProperties

class NetworkSolver:
    """
    Unified Network Solver (Phase 9).
    Handles temperature propagation and property updates.
    """
    def __init__(self, network: HydraulicNetwork):
        self.network = network
        self.nodes_list = list(network.nodes.values())
        self.node_ids = list(network.nodes.keys())
        self.edges_list = network.edges
        
        self.node_id_to_idx = {node_id: i for i, node_id in enumerate(self.node_ids)}
        
        # Identify fixed boundary nodes (Tanks)
        self.fixed_pressure_nodes = {} # node_idx -> pressure
        self.internal_node_indices = []
        
        for i, node in enumerate(self.nodes_list):
            if isinstance(node, Tank):
                self.fixed_pressure_nodes[i] = node.calculate()
            else:
                self.internal_node_indices.append(i)

    def _propagate_properties(self, q_edges):
        """
        Propagates Temperature, Density, and Viscosity based on flow direction.
        """
        for _ in range(5):
            # 1. Update edges (pipes)
            for j, edge in enumerate(self.edges_list):
                src_node = self.network.nodes[edge['source']]
                tgt_node = self.network.nodes[edge['target']]
                pipe = edge['pipe']
                q = q_edges[j]
                
                # Sync flow rate to both ports so calculate() knows the direction
                pipe.inlets[0].flow_rate = q
                pipe.outlets[0].flow_rate = q
                
                if q >= 0:
                    # Normal: Source Out -> Pipe In
                    pipe.inlets[0].temperature = src_node.outlets[0].temperature
                    pipe.inlets[0].density = src_node.outlets[0].density
                    pipe.inlets[0].viscosity = src_node.outlets[0].viscosity
                else:
                    # Reverse: Target In -> Pipe Out
                    # (Note: In reverse flow, target_node.inlets[0] is the source)
                    pipe.outlets[0].temperature = tgt_node.inlets[0].temperature
                    pipe.outlets[0].density = tgt_node.inlets[0].density
                    pipe.outlets[0].viscosity = tgt_node.inlets[0].viscosity
                
                pipe.calculate() 

            # 2. Update nodes
            for node_id, node in self.network.nodes.items():
                if isinstance(node, Tank):
                    node.calculate()
                    continue
                
                # Update node ports from connected pipes
                for edge in self.edges_list:
                    q = q_edges[self.edges_list.index(edge)]
                    pipe = edge['pipe']
                    
                    if edge['target'] == node_id:
                        port_idx = self._parse_port_idx(edge.get('target_port', 'inlet-0'))
                        if port_idx < len(node.inlets):
                            node.inlets[port_idx].flow_rate = q
                            if q >= 0:
                                node.inlets[port_idx].temperature = pipe.outlets[0].temperature
                                node.inlets[port_idx].density = pipe.outlets[0].density
                                node.inlets[port_idx].viscosity = pipe.outlets[0].viscosity
                    
                    if edge['source'] == node_id:
                        port_idx = self._parse_port_idx(edge.get('source_port', 'outlet-0'))
                        if port_idx < len(node.outlets):
                            node.outlets[port_idx].flow_rate = q
                            if q < 0:
                                node.outlets[port_idx].temperature = pipe.inlets[0].temperature
                                node.outlets[port_idx].density = pipe.inlets[0].density
                                node.outlets[port_idx].viscosity = pipe.inlets[0].viscosity
                
                if hasattr(node, 'calculate_temperature'):
                    node.calculate_temperature()
                node.calculate()

    def _parse_port_idx(self, port_str: str) -> int:
        try:
            return int(port_str.split('-')[-1])
        except (ValueError, IndexError, AttributeError):
            return 0

    def _get_node_p_out(self, node, p_in, q_node):
        """Helper to calculate outlet pressure of any node."""
        inlet = node.inlets[0] if node.inlets else None
        density = inlet.density if inlet else 1000.0
        viscosity = inlet.viscosity if inlet else 0.001
        
        if isinstance(node, Pump):
            return p_in + node.calculate_delta_p(q_node, density, viscosity)
        elif hasattr(node, 'calculate_delta_p'):
            return p_in - node.calculate_delta_p(q_node, density, viscosity)
        else:
            return p_in

    def solve(self):
        num_internal = len(self.internal_node_indices)
        num_edges = len(self.edges_list)
        num_vars = num_internal + num_edges
        
        if num_vars == 0: return 0.0

        avg_p = np.mean(list(self.fixed_pressure_nodes.values())) if self.fixed_pressure_nodes else 101325.0
        x0 = np.concatenate([np.full(num_internal, avg_p), np.full(num_edges, 0.1)])

        def objective(x):
            p_in_internal = x[:num_internal]
            q_edges = x[num_internal:]
            
            # Update properties based on current flows
            self._propagate_properties(q_edges)

            p_in_all = np.zeros(len(self.nodes_list))
            for i, p in self.fixed_pressure_nodes.items(): p_in_all[i] = p
            for i, idx in enumerate(self.internal_node_indices): p_in_all[idx] = p_in_internal[i]

            residuals = []
            
            # 1. Mass Balance at internal nodes
            for i, node_idx in enumerate(self.internal_node_indices):
                node_id = self.node_ids[node_idx]
                q_in = sum(q_edges[j] for j, e in enumerate(self.edges_list) if e['target'] == node_id)
                q_out = sum(q_edges[j] for j, e in enumerate(self.edges_list) if e['source'] == node_id)
                residuals.append(q_in - q_out)

            # 2. Energy Balance at edges
            for j, edge in enumerate(self.edges_list):
                src_idx = self.node_id_to_idx[edge['source']]
                tgt_idx = self.node_id_to_idx[edge['target']]
                q = q_edges[j]
                pipe = edge['pipe']
                
                p_src_out = self._get_node_p_out(self.nodes_list[src_idx], p_in_all[src_idx], q)
                p_tgt_in = p_in_all[tgt_idx]
                
                dp_pipe = pipe.calculate_delta_p(q, pipe.inlets[0].density, pipe.inlets[0].viscosity)
                residuals.append((p_src_out - p_tgt_in) - dp_pipe)

            return np.array(residuals)

        solution = root(objective, x0, method='lm', options={'maxiter': 10000})
        
        if solution.success:
            self._update_telemetry(solution.x[:num_internal], solution.x[num_internal:])
            return solution.x[num_internal] if num_edges > 0 else 0.0
        else:
            raise ValueError(f"Solver failed: {solution.message}")

    def _update_telemetry(self, p_in_internal, q_edges):
        """Populates Port objects for visual display."""
        # 1. Ensure properties are propagated for the final solution
        self._propagate_properties(q_edges)
        
        p_in_all = np.zeros(len(self.nodes_list))
        for i, p in self.fixed_pressure_nodes.items(): p_in_all[i] = p
        for i, idx in enumerate(self.internal_node_indices): p_in_all[idx] = p_in_internal[i]

        # Reset all node flow rates first
        for node in self.nodes_list:
            for port in node.inlets: port.flow_rate = 0.0
            for port in node.outlets: port.flow_rate = 0.0

        # Update Node Ports from connected edges
        for j, edge in enumerate(self.edges_list):
            q = q_edges[j]
            src_node = self.network.nodes[edge['source']]
            tgt_node = self.network.nodes[edge['target']]
            
            src_port_idx = self._parse_port_idx(edge.get('source_port', 'outlet-0'))
            if src_port_idx < len(src_node.outlets):
                src_node.outlets[src_port_idx].flow_rate += q
                
            tgt_port_idx = self._parse_port_idx(edge.get('target_port', 'inlet-0'))
            if tgt_port_idx < len(tgt_node.inlets):
                tgt_node.inlets[tgt_port_idx].flow_rate += q

        # Update Node Pressures
        for i, node in enumerate(self.nodes_list):
            p_in = p_in_all[i]
            # For multi-port nodes, we assume zero internal pressure drop (junctions)
            # For others, we take the flow through the FIRST inlet as the reference for dP.
            q_ref = node.inlets[0].flow_rate if node.inlets else 0.0
            p_out = self._get_node_p_out(node, p_in, q_ref)
            
            for port in node.inlets:
                port.pressure = p_in
            for port in node.outlets:
                port.pressure = p_out

        # Update Edge (Pipe) Ports
        for j, edge in enumerate(self.edges_list):
            pipe = edge['pipe']
            q = q_edges[j]
            src_idx = self.node_id_to_idx[edge['source']]
            tgt_idx = self.node_id_to_idx[edge['target']]
            
            p_src_in = p_in_all[src_idx]
            q_src_ref = self.nodes_list[src_idx].inlets[0].flow_rate if self.nodes_list[src_idx].inlets else 0.0
            p_src_out = self._get_node_p_out(self.nodes_list[src_idx], p_src_in, q_src_ref)
            
            pipe.inlets[0].pressure = p_src_out
            pipe.inlets[0].flow_rate = q
            pipe.outlets[0].pressure = p_in_all[tgt_idx]
            pipe.outlets[0].flow_rate = q
