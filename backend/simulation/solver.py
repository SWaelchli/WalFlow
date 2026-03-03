import numpy as np
import math
from scipy.optimize import root
from typing import List, Dict, Any

from simulation.schemas import HydraulicNetwork
from simulation.equipment.base_node import HydraulicNode
from simulation.equipment.tank import Tank
from simulation.equipment.pipe import Pipe
from simulation.equipment.pump import Pump
from simulation.equipment.linear_control_valve import LinearControlValve
from simulation.equipment.linear_regulator import LinearRegulator
from simulation.equipment.remote_control_valve import RemoteControlValve
from simulation.equipment.orifice import Orifice
from simulation.equipment.heat_exchanger import HeatExchanger
from simulation.equipment.filter import Filter
from simulation.fluid_utils import FluidProperties

class NetworkSolver:
    """
    Final Network Solver.
    Uses a clean 'Direct Physics' outer loop for regulators and control valves.
    """
    def __init__(self, network: HydraulicNetwork):
        self.network = network
        self.nodes_list = list(network.nodes.values())
        self.node_ids = list(network.nodes.keys())
        self.edges_list = network.edges
        self.node_id_to_idx = {node_id: i for i, node_id in enumerate(self.node_ids)}
        
        self.fixed_pressure_nodes = {}
        self.internal_node_indices = []
        self.control_node_indices = [] # Indices of regulators or RCVs
        
        for i, node in enumerate(self.nodes_list):
            if isinstance(node, Tank):
                self.fixed_pressure_nodes[i] = node.calculate()
            else:
                self.internal_node_indices.append(i)
                if isinstance(node, (LinearRegulator, RemoteControlValve)):
                    self.control_node_indices.append(i)

    def solve(self):
        max_outer_iterations = 40
        tolerance_bar = 0.01 
        
        # Initialize control nodes to a neutral position
        for idx in self.control_node_indices:
            self.nodes_list[idx].opening_pct = 50.0

        for it in range(max_outer_iterations):
            # 1. Solve the current hydraulics with fixed control positions
            try:
                final_sol_x, num_int = self._solve_hydraulics_core()
            except ValueError:
                # If solver fails, control nodes might be too closed. Open them up and retry.
                for idx in self.control_node_indices:
                    self.nodes_list[idx].opening_pct = 95.0
                continue
            
            # 2. Update control openings based on pressure error
            max_error = 0.0
            for idx in self.control_node_indices:
                node = self.nodes_list[idx]
                
                # Determine sensed pressure
                if isinstance(node, LinearRegulator):
                    sensed = node.inlets[0].pressure if node.backpressure else node.outlets[0].pressure
                    # Regulators always sense their own inlet/outlet
                    sensed_at_outlet = not node.backpressure
                elif isinstance(node, RemoteControlValve):
                    sensed = 0.0
                    config = node.remote_sensing_config
                    if config and config["node_id"] in self.network.nodes:
                        remote_node = self.network.nodes[config["node_id"]]
                        port_type = config["port_type"]
                        port_idx = config["port_idx"]
                        
                        if port_type == "inlet" and port_idx < len(remote_node.inlets):
                            sensed = remote_node.inlets[port_idx].pressure
                        elif port_type == "outlet" and port_idx < len(remote_node.outlets):
                            sensed = remote_node.outlets[port_idx].pressure
                        else:
                            sensed = node.outlets[0].pressure # Fallback
                    else:
                        # Fallback to local sensing if no signal
                        sensed = node.outlets[0].pressure
                    node.sensed_pressure = sensed
                    sensed_at_outlet = not node.backpressure # If backpressure=True, sensed_at_outlet=False (Upstream)
                
                error_bar = abs(sensed - node.set_pressure) / 100000.0
                max_error = max(max_error, error_bar)
                
                # Calculate required dP to reach setpoint
                # If sensed_at_outlet=True (Standard Downstream Control):
                #   We need to change our current dP by the error at the sensed location.
                #   target_dp = current_dp + (sensed - set_pressure)
                current_dp = (node.inlets[0].pressure - node.outlets[0].pressure)
                
                if sensed_at_outlet:
                    # If remote pressure is TOO HIGH, we need MORE dP (close valve)
                    # If remote pressure is TOO LOW, we need LESS dP (open valve)
                    target_dp = current_dp + (sensed - node.set_pressure)
                else:
                    # Upstream control (rare for RCV but supported)
                    # If remote pressure is TOO HIGH, we need LESS dP (open valve)
                    # If remote pressure is TOO LOW, we need MORE dP (close valve)
                    target_dp = current_dp + (node.set_pressure - sensed)
                
                # Use physics to find the target opening for this dP
                rho = node.inlets[0].density
                q = node.inlets[0].flow_rate
                abs_q = abs(q)
                K_CV_SI = 1.732e9
                
                min_dp = (K_CV_SI * rho * q * abs_q) / (node.max_cv**2)
                
                if target_dp <= min_dp or abs_q < 1e-8:
                    target_opening = 100.0
                else:
                    cv_req = math.sqrt((K_CV_SI * rho * q**2) / max(1.0, target_dp))
                    target_opening = (cv_req / node.max_cv) * 100.0
                
                # Damp the adjustment to prevent oscillation
                node.opening_pct = node.opening_pct + 0.5 * (target_opening - node.opening_pct)
                node.opening_pct = max(0.1, min(100.0, node.opening_pct))

            if max_error < tolerance_bar:
                break
        
        # Return the final flow rate from a reference edge
        final_q = final_sol_x[num_int] if final_sol_x is not None and len(final_sol_x) > num_int else 0.0
        return final_q

    def _solve_hydraulics_core(self):
        num_internal = len(self.internal_node_indices)
        num_edges = len(self.edges_list)
        if (num_internal + num_edges) == 0: return np.array([]), 0

        atm_p = 101325.0
        if self.nodes_list and self.nodes_list[0].global_settings:
            atm_p = getattr(self.nodes_list[0].global_settings, 'atmospheric_pressure', 101325.0)
        avg_p = np.mean(list(self.fixed_pressure_nodes.values())) if self.fixed_pressure_nodes else atm_p
        
        x0 = np.concatenate([np.full(num_internal, avg_p), np.full(num_edges, 0.005)])

        def objective(x):
            p_in_internal = x[:num_internal]
            q_edges = x[num_internal:]
            self._propagate_properties(q_edges)
            
            p_in_all = np.zeros(len(self.nodes_list))
            for i, p in self.fixed_pressure_nodes.items(): p_in_all[i] = p
            for i, idx in enumerate(self.internal_node_indices): p_in_all[idx] = p_in_internal[i]
            
            residuals = []
            for i, node_idx in enumerate(self.internal_node_indices):
                node_id = self.node_ids[node_idx]
                q_in = sum(q_edges[j] for j, e in enumerate(self.edges_list) if e['target'] == node_id)
                q_out = sum(q_edges[j] for j, e in enumerate(self.edges_list) if e['source'] == node_id)
                residuals.append(q_in - q_out)
            for j, edge in enumerate(self.edges_list):
                src_idx = self.node_id_to_idx[edge['source']]
                tgt_idx = self.node_id_to_idx[edge['target']]
                p_src_out = self._get_node_p_out(self.nodes_list[src_idx], p_in_all[src_idx], q_edges[j])
                dp_pipe = edge['pipe'].calculate_delta_p(q_edges[j], edge['pipe'].inlets[0].density, edge['pipe'].inlets[0].viscosity)
                residuals.append((p_src_out - p_in_all[tgt_idx]) - dp_pipe)
            return np.array(residuals)

        solution = root(objective, x0, method='hybr', options={'maxfev': 1000})
        if solution.success:
            self._update_telemetry(solution.x[:num_internal], solution.x[num_internal:])
            return solution.x, num_internal
        else:
            raise ValueError(f"Hydraulic solver failed: {solution.message}")

    def _propagate_properties(self, q_edges):
        iterations = 5
        if self.nodes_list and self.nodes_list[0].global_settings:
            iterations = getattr(self.nodes_list[0].global_settings, 'property_iterations', 5)
        for _ in range(iterations):
            for j, edge in enumerate(self.edges_list):
                src_node = self.network.nodes[edge['source']]
                tgt_node = self.network.nodes[edge['target']]
                pipe = edge['pipe']
                q = q_edges[j]
                pipe.inlets[0].flow_rate = q
                pipe.outlets[0].flow_rate = q
                if q >= 0:
                    pipe.inlets[0].temperature = src_node.outlets[0].temperature
                    pipe.inlets[0].density = src_node.outlets[0].density
                    pipe.inlets[0].viscosity = src_node.outlets[0].viscosity
                else:
                    pipe.outlets[0].temperature = tgt_node.inlets[0].temperature
                    pipe.outlets[0].density = tgt_node.inlets[0].density
                    pipe.outlets[0].viscosity = tgt_node.inlets[0].viscosity
                pipe.calculate() 
            for node_id, node in self.network.nodes.items():
                if isinstance(node, Tank):
                    node.calculate()
                    continue
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
        inlet = node.inlets[0] if node.inlets else None
        density = inlet.density if inlet else 1000.0
        viscosity = inlet.viscosity if inlet else 0.001
        if isinstance(node, Pump):
            return p_in + node.calculate_delta_p(q_node, density, viscosity)
        elif hasattr(node, 'calculate_delta_p'):
            return p_in - node.calculate_delta_p(q_node, density, viscosity)
        else:
            return p_in

    def _update_telemetry(self, p_in_internal, q_edges):
        self._propagate_properties(q_edges)
        p_in_all = np.zeros(len(self.nodes_list))
        for i, p in self.fixed_pressure_nodes.items(): p_in_all[i] = p
        for i, idx in enumerate(self.internal_node_indices): p_in_all[idx] = p_in_internal[i]
        for node in self.nodes_list:
            for port in node.inlets: port.flow_rate = 0.0
            for port in node.outlets: port.flow_rate = 0.0
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
        for i, node in enumerate(self.nodes_list):
            p_in = p_in_all[i]
            q_ref = node.inlets[0].flow_rate if node.inlets else 0.0
            p_out = self._get_node_p_out(node, p_in, q_ref)
            for port in node.inlets: port.pressure = p_in
            for port in node.outlets: port.pressure = p_out
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
