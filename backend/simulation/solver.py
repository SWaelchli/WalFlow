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

class NetworkSolver:
    """
    Unified Network Solver (Phase 8).
    Handles parallel paths and branching by solving for:
    - P_node: Pressure at the INLET of every internal node.
    - Q_edge: Flow rate through every edge (pipe).
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

    def _get_node_p_out(self, node, p_in, q_node):
        """Helper to calculate outlet pressure of any node."""
        density = 1000.0
        if isinstance(node, Pump):
            return p_in + node.calculate_delta_p(q_node, density)
        elif hasattr(node, 'calculate_delta_p'):
            # Generic equipment (Valve, Orifice, etc.)
            return p_in - node.calculate_delta_p(q_node, density)
        else:
            return p_in

    def solve(self):
        num_internal = len(self.internal_node_indices)
        num_edges = len(self.edges_list)
        num_vars = num_internal + num_edges
        
        if num_vars == 0: return 0.0

        # Initial guess based on fixed boundary tanks
        avg_p = np.mean(list(self.fixed_pressure_nodes.values())) if self.fixed_pressure_nodes else 101325.0
        x0 = np.concatenate([np.full(num_internal, avg_p), np.full(num_edges, 0.1)])

        def objective(x):
            p_in_internal = x[:num_internal]
            q_edges = x[num_internal:]
            
            p_in_all = np.zeros(len(self.nodes_list))
            for i, p in self.fixed_pressure_nodes.items(): p_in_all[i] = p
            for i, idx in enumerate(self.internal_node_indices): p_in_all[idx] = p_in_internal[i]

            # Calculate node flows for DeltaP calculations
            node_flows = np.zeros(len(self.nodes_list))
            for j, edge in enumerate(self.edges_list):
                target_idx = self.node_id_to_idx[edge['target']]
                node_flows[target_idx] += q_edges[j]

            # Calculate residuals
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
                
                # P_out of source node - P_in of target node = P_drop of pipe
                p_src_out = self._get_node_p_out(self.nodes_list[src_idx], p_in_all[src_idx], q) # Approximating node flow here
                p_tgt_in = p_in_all[tgt_idx]
                
                dp_pipe = pipe.calculate_delta_p(abs(q), 1000.0)
                residuals.append((p_src_out - p_tgt_in) - (np.sign(q) * dp_pipe))

            return np.array(residuals)

        # Solve using Levenberg-Marquardt with high iterations
        solution = root(objective, x0, method='lm', options={'maxiter': 10000})
        
        if solution.success:
            self._update_telemetry(solution.x[:num_internal], solution.x[num_internal:])
            return solution.x[num_internal] if num_edges > 0 else 0.0
        else:
            raise ValueError(f"Solver failed: {solution.message}")

    def _update_telemetry(self, p_in_internal, q_edges):
        """Populates Port objects for visual display."""
        p_in_all = np.zeros(len(self.nodes_list))
        for i, p in self.fixed_pressure_nodes.items(): p_in_all[i] = p
        for i, idx in enumerate(self.internal_node_indices): p_in_all[idx] = p_in_internal[i]

        node_flows_in = np.zeros(len(self.nodes_list))
        node_flows_out = np.zeros(len(self.nodes_list))
        for j, edge in enumerate(self.edges_list):
            node_flows_in[self.node_id_to_idx[edge['target']]] += q_edges[j]
            node_flows_out[self.node_id_to_idx[edge['source']]] += q_edges[j]

        # Update Node Ports
        for i, node in enumerate(self.nodes_list):
            q_in = node_flows_in[i]
            q_out = node_flows_out[i]
            p_in = p_in_all[i]
            # Use q_in for DeltaP calculation
            p_out = self._get_node_p_out(node, p_in, q_in)
            
            for port in node.inlets:
                port.pressure = p_in
                port.flow_rate = q_in
            for port in node.outlets:
                port.pressure = p_out
                port.flow_rate = q_out

        # Update Edge (Pipe) Ports
        for j, edge in enumerate(self.edges_list):
            pipe = edge['pipe']
            q = q_edges[j]
            src_idx = self.node_id_to_idx[edge['source']]
            tgt_idx = self.node_id_to_idx[edge['target']]
            
            # Pipe inlet pressure = source node outlet pressure
            p_src_in = p_in_all[src_idx]
            q_src_in = node_flows_in[src_idx]
            p_src_out = self._get_node_p_out(self.nodes_list[src_idx], p_src_in, q_src_in)
            
            pipe.inlets[0].pressure = p_src_out
            pipe.inlets[0].flow_rate = q
            pipe.outlets[0].pressure = p_in_all[tgt_idx]
            pipe.outlets[0].flow_rate = q
