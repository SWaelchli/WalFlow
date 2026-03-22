import numpy as np
import math
import time
from scipy.optimize import root
from typing import List, Dict, Any, Tuple

from simulation.schemas import HydraulicNetwork
from simulation.equipment.base_node import HydraulicNode
from simulation.equipment.tank import Tank
from simulation.equipment.pipe import Pipe
from simulation.equipment.centrifugal_pump import CentrifugalPump
from simulation.equipment.volumetric_pump import VolumetricPump
from simulation.equipment.linear_control_valve import LinearControlValve
from simulation.equipment.linear_regulator import LinearRegulator
from simulation.equipment.remote_control_valve import RemoteControlValve
from simulation.equipment.orifice import Orifice
from simulation.equipment.heat_exchanger import HeatExchanger
from simulation.equipment.filter import Filter
from simulation.equipment.three_way_tcv import ThreeWayTCV
from simulation.fluid_utils import FluidProperties

class NetworkSolver:
    """
    Final Network Solver with Live Diagnostics and 3-Way TCV Support.
    """
    def __init__(self, network: HydraulicNetwork):
        self.network = network
        self.nodes_list = list(network.nodes.values())
        self.node_ids = list(network.nodes.keys())
        self.edges_list = network.edges
        self.node_id_to_idx = {node_id: i for i, node_id in enumerate(self.node_ids)}
        
        self.fixed_pressure_nodes = {}
        self.internal_node_indices = []
        self.control_node_indices = [] # Pressure regulators
        self.tcv_node_indices = []     # Thermal mixing valves
        
        self.last_prop_iters = 0
        
        for i, node in enumerate(self.nodes_list):
            if isinstance(node, Tank):
                self.fixed_pressure_nodes[i] = node.calculate()
            else:
                self.internal_node_indices.append(i)
                if isinstance(node, (LinearRegulator, RemoteControlValve)):
                    self.control_node_indices.append(i)
                if isinstance(node, ThreeWayTCV):
                    self.tcv_node_indices.append(i)

    def solve(self, method=None):
        start_time = time.perf_counter()
        max_outer_iterations = 100
        tolerance_bar = 0.001 
        tolerance_temp = 0.1 # 0.1K target
        
        gs = getattr(self.network, 'global_settings', None)
        if gs:
            max_outer_iterations = getattr(gs, 'control_iterations', 100)
        
        if method is None:
            method = getattr(gs, 'solver_method', 'hybr') if gs else 'hybr'

        final_sol_x = None
        num_int = 0
        total_inner_iterations = 0
        outer_iterations = 0
        fallback_triggered = False
        
        x_start = self._generate_initial_guess()

        # Reset control positions
        for idx in self.control_node_indices:
            self.nodes_list[idx].opening_pct = 50.0
        for idx in self.tcv_node_indices:
            self.nodes_list[idx].mix_ratio = 0.5

        solve_error = None
        last_residuals = None

        for it in range(max_outer_iterations):
            outer_iterations += 1
            try:
                res = self._solve_hydraulics_core(method=method, x0_custom=x_start)
                final_sol_x, num_int, inner_iters, fallback, last_residuals = res
                total_inner_iterations += inner_iters
                if fallback: fallback_triggered = True
                x_start = final_sol_x
            except ValueError as e:
                solve_error = str(e)
                break
            
            max_err_bar = 0.0
            max_err_temp = 0.0

            # 1. Pressure Regulators
            for idx in self.control_node_indices:
                node = self.nodes_list[idx]
                if isinstance(node, LinearRegulator):
                    sensed = node.inlets[0].pressure if node.backpressure else node.outlets[0].pressure
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
                            sensed = node.outlets[0].pressure
                    else:
                        sensed = node.outlets[0].pressure
                    node.sensed_pressure = sensed
                    sensed_at_outlet = not node.backpressure
                
                error_bar = abs(sensed - node.set_pressure) / 100000.0
                max_err_bar = max(max_err_bar, error_bar)
                
                current_dp = (node.inlets[0].pressure - node.outlets[0].pressure)
                target_dp = current_dp + (sensed - node.set_pressure) if sensed_at_outlet else current_dp + (node.set_pressure - sensed)
                
                rho = node.inlets[0].density
                q = node.inlets[0].flow_rate
                abs_q = abs(q)
                K_CV_SI = 1.732e9
                min_dp = (K_CV_SI * rho * q * abs_q) / (node.max_cv**2) if abs_q > 0 else 0
                
                if target_dp <= min_dp or abs_q < 1e-8:
                    target_opening = 100.0
                else:
                    cv_req = math.sqrt((K_CV_SI * rho * q**2) / max(1.0, target_dp))
                    target_opening = (cv_req / node.max_cv) * 100.0
                
                node.opening_pct = node.opening_pct + 0.6 * (target_opening - node.opening_pct)
                node.opening_pct = max(0.1, min(100.0, node.opening_pct))

            # 2. 3-Way Thermal Control Valves
            # Physical Direction: The mix_ratio is tied STRICTLY to the user-selected HOT port.
            # If Too Hot (t_err > 0) -> we MUST close the HOT port (decrease mix_ratio).
            for idx in self.tcv_node_indices:
                node = self.nodes_list[idx]
                t_out = node.outlets[0].temperature
                t_err = t_out - node.set_temperature
                max_err_temp = max(max_err_temp, abs(t_err))
                
                # Fixed Direction: 
                # mix_ratio = 1.0 means Hot Port is wide open.
                # Too Hot (t_err > 0) -> decrease mix_ratio.
                # Too Cold (t_err < 0) -> increase mix_ratio.
                direction = -1.0
                
                # Use a small damping factor (0.01) for thermal stability
                adjustment = direction * 0.01 * t_err
                node.mix_ratio = max(0.001, min(0.999, node.mix_ratio + adjustment))

            if max_err_bar < tolerance_bar and max_err_temp < tolerance_temp:
                break

        bottleneck = self._identify_bottleneck(last_residuals) if last_residuals is not None else None
        stats = {
            "success": solve_error is None,
            "error": solve_error,
            "time_ms": (time.perf_counter() - start_time) * 1000,
            "outer_iterations": outer_iterations,
            "total_inner_iterations": total_inner_iterations,
            "property_iterations": self.last_prop_iters,
            "fallback_used": fallback_triggered,
            "system_size": len(self.internal_node_indices) + len(self.edges_list),
            "bottleneck": bottleneck
        }
        return stats

    def _identify_bottleneck(self, residuals) -> Dict[str, Any]:
        if residuals is None or len(residuals) == 0: return None
        abs_res = np.abs(residuals)
        max_idx = np.argmax(abs_res)
        max_val = float(abs_res[max_idx])
        num_internal = len(self.internal_node_indices)
        if max_idx < num_internal:
            node_idx = self.internal_node_indices[max_idx]
            node = self.nodes_list[node_idx]
            return {"type": "Node", "name": node.name, "error_type": "Mass Balance", "magnitude": max_val}
        else:
            edge_idx = max_idx - num_internal
            edge = self.edges_list[edge_idx]
            return {"type": "Connection", "name": edge.get('label') or edge.get('id'), "error_type": "Pressure Balance", "magnitude": max_val}

    def _generate_initial_guess(self):
        num_internal = len(self.internal_node_indices)
        num_edges = len(self.edges_list)
        atm_p = 101325.0
        if self.nodes_list and self.nodes_list[0].global_settings:
            atm_p = getattr(self.nodes_list[0].global_settings, 'atmospheric_pressure', 101325.0)
        avg_p = np.mean(list(self.fixed_pressure_nodes.values())) if self.fixed_pressure_nodes else atm_p
        q_guess_base = 0.005
        for node in self.nodes_list:
            if hasattr(node, 'flow_rated') and node.flow_rated > 0:
                q_guess_base = node.flow_rated
                break
        return np.concatenate([np.full(num_internal, avg_p), np.full(num_edges, q_guess_base)])

    def _solve_hydraulics_core(self, method='hybr', x0_custom=None) -> Tuple[np.ndarray, int, int, bool, np.ndarray]:
        num_internal = len(self.internal_node_indices)
        num_edges = len(self.edges_list)
        if (num_internal + num_edges) == 0: return np.array([]), 0, 0, False, np.array([])

        p_scale = 100000.0
        q_scale = 0.001
        
        if x0_custom is not None:
            x0 = np.concatenate([x0_custom[:num_internal] / p_scale, x0_custom[num_internal:] / q_scale])
        else:
            x0_raw = self._generate_initial_guess()
            x0 = np.concatenate([x0_raw[:num_internal] / p_scale, x0_raw[num_internal:] / q_scale])

        def objective(x_scaled):
            p_in_internal = x_scaled[:num_internal] * p_scale
            q_edges = x_scaled[num_internal:] * q_scale
            self._propagate_properties(q_edges)
            p_in_all = np.zeros(len(self.nodes_list))
            for i, p in self.fixed_pressure_nodes.items(): p_in_all[i] = p
            for i, idx in enumerate(self.internal_node_indices): p_in_all[idx] = p_in_internal[i]
            
            residuals = []
            # 1. Mass Balance
            for i, node_idx in enumerate(self.internal_node_indices):
                node_id = self.node_ids[node_idx]
                q_in = sum(q_edges[j] for j, e in enumerate(self.edges_list) if e['target'] == node_id)
                q_out = sum(q_edges[j] for j, e in enumerate(self.edges_list) if e['source'] == node_id)
                residuals.append(5.0 * (q_in - q_out) / q_scale)
            
            # 2. Pressure Balance
            for j, edge in enumerate(self.edges_list):
                src_id = edge['source']
                tgt_id = edge['target']
                src_idx = self.node_id_to_idx[src_id]
                tgt_idx = self.node_id_to_idx[tgt_id]
                src_node = self.nodes_list[src_idx]
                
                if isinstance(src_node, ThreeWayTCV):
                    p_src_out = src_node.outlets[0].pressure
                else:
                    q_in_node = sum(q_edges[k] for k, e in enumerate(self.edges_list) if e['target'] == src_id)
                    q_out_node = sum(q_edges[k] for k, e in enumerate(self.edges_list) if e['source'] == src_id)
                    p_src_out = self._get_node_p_out(src_node, p_in_all[src_idx], q_in_node, q_out_node)
                
                if isinstance(self.network.nodes[tgt_id], ThreeWayTCV):
                    tgt_node = self.network.nodes[tgt_id]
                    port_idx = self._parse_port_idx(edge.get('target_port', 'inlet-0'))
                    dp_tcv = tgt_node.calculate_path_dp(q_edges[j], tgt_node.inlets[port_idx].density, port_idx)
                    dp_pipe = edge['pipe'].calculate_delta_p(q_edges[j], edge['pipe'].inlets[0].density, edge['pipe'].inlets[0].viscosity)
                    residuals.append(((p_src_out - p_in_all[tgt_idx]) - (dp_pipe + dp_tcv)) / p_scale)
                else:
                    dp_pipe = edge['pipe'].calculate_delta_p(q_edges[j], edge['pipe'].inlets[0].density, edge['pipe'].inlets[0].viscosity)
                    residuals.append(((p_src_out - p_in_all[tgt_idx]) - dp_pipe) / p_scale)
            return np.array(residuals)

        def is_physical(x_scaled):
            q_edges = x_scaled[num_internal:] * q_scale
            p_nodes = x_scaled[:num_internal] * p_scale
            if np.any(p_nodes < -100000.0): return False
            for j, edge in enumerate(self.edges_list):
                src_node = self.network.nodes[edge['source']]
                if isinstance(src_node, (CentrifugalPump, VolumetricPump)):
                    if q_edges[j] < -1e-6: return False
            return True

        gs = getattr(self.network, 'global_settings', None)
        inner_max_steps = getattr(gs, 'inner_iterations', 1000) if gs else 1000
        fallback_used = False
        sol = root(objective, x0, method=method, options={'maxfev': inner_max_steps})
        if method == 'hybr' and (not sol.success or not is_physical(sol.x)):
            fallback_used = True
            sol = root(objective, sol.x, method='lm', options={'maxiter': inner_max_steps})
        final_residuals = objective(sol.x)
        if sol.success:
            final_p = sol.x[:num_internal] * p_scale
            final_q = sol.x[num_internal:] * q_scale
            self._update_telemetry(final_p, final_q)
            return np.concatenate([final_p, final_q]), num_internal, getattr(sol, 'nfev', 0), fallback_used, final_residuals
        else:
            raise ValueError(f"Solver failed: {sol.message}")

    def _get_node_p_out(self, node, p_in, q_in, q_out):
        inlet = node.inlets[0] if node.inlets else None
        density = inlet.density if inlet else 1000.0
        viscosity = inlet.viscosity if inlet else 0.001
        if isinstance(node, (CentrifugalPump, VolumetricPump)):
            return p_in + node.calculate_delta_p(q_in, density, viscosity)
        elif hasattr(node, 'calculate_delta_p'):
            return p_in - node.calculate_delta_p(q_in, density, viscosity)
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
            for port in node.inlets: port.pressure = p_in
            q_in_total = sum(p.flow_rate for p in node.inlets)
            q_out_total = sum(p.flow_rate for p in node.outlets)
            p_out = self._get_node_p_out(node, p_in, q_in_total, q_out_total)
            for port in node.outlets: port.pressure = p_out
        for j, edge in enumerate(self.edges_list):
            pipe = edge['pipe']
            q = q_edges[j]
            src_node = self.nodes_list[self.node_id_to_idx[edge['source']]]
            tgt_node = self.nodes_list[self.node_id_to_idx[edge['target']]]
            pipe.inlets[0].pressure = src_node.outlets[0].pressure
            pipe.inlets[0].flow_rate = q
            pipe.outlets[0].pressure = tgt_node.inlets[0].pressure
            pipe.outlets[0].flow_rate = q

    def _parse_port_idx(self, port_str: str) -> int:
        try:
            return int(port_str.split('-')[-1])
        except (ValueError, IndexError, AttributeError):
            return 0

    def _propagate_properties(self, q_edges):
        max_iterations = 5
        if self.nodes_list and self.nodes_list[0].global_settings:
            max_iterations = getattr(self.nodes_list[0].global_settings, 'property_iterations', 5)
        actual_iters = 0
        for _ in range(max_iterations):
            actual_iters += 1
            max_temp_change = 0.0
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
                old_temps = [p.temperature for p in node.outlets] + [p.temperature for p in node.inlets]
                for j, edge in enumerate(self.edges_list):
                    q = q_edges[j]
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
                new_temps = [p.temperature for p in node.outlets] + [p.temperature for p in node.inlets]
                for old_t, new_t in zip(old_temps, new_temps):
                    max_temp_change = max(max_temp_change, abs(new_t - old_t))
            if max_temp_change < 0.01:
                break
        self.last_prop_iters = actual_iters
