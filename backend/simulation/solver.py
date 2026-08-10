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
    Final Network Solver with Live Diagnostics, Analytical Sparse Jacobian,
    Sparse Newton-Raphson Solver, and Warm-Start caching.
    """
    # Class-level cache: (topology_key, active_case_id) -> np.ndarray (converged state vector)
    _warm_start_cache = {}

    def __init__(self, network: HydraulicNetwork):
        self.network = network
        
        # Store original full lists of nodes and edges (these never change)
        self.all_nodes_list = list(network.nodes.values())
        self.all_node_ids = list(network.nodes.keys())
        self.all_edges_list = network.edges
        self.all_node_id_to_idx = {node_id: i for i, node_id in enumerate(self.all_node_ids)}
        self.node_to_key = {id(n): nid for nid, n in network.nodes.items()}
        
        self.last_prop_iters = 0
        self.active_case_id = getattr(network, 'active_case_id', None) or 'default'
        self.warm_start_status = "Cold Start"
        
        # Initial topology pruning
        self.prune_topology()

    def prune_topology(self):
        # 1. Identify inactive nodes
        inactive_node_ids = set()
        for node_id, node in self.network.nodes.items():
            is_inactive_pump = (not getattr(node, 'active', True) and getattr(node, 'blocks_flow_on_shutdown', False))
            is_closed_relief = (getattr(node, 'forced_state', '') == 'forced_closed' and getattr(node, 'node_type', '') in ['pressure_safety_valve', 'rupture_disc'])
            if is_inactive_pump or is_closed_relief:
                inactive_node_ids.add(node_id)
                
        # 2. Prune connected edges
        active_edges = []
        for edge in self.all_edges_list:
            if edge['source'] not in inactive_node_ids and edge['target'] not in inactive_node_ids:
                active_edges.append(edge)
                
        # 3. Reachability Analysis (undirected DFS from pressure boundaries)
        boundary_ids = [nid for nid, node in self.network.nodes.items() if getattr(node, 'is_pressure_boundary', False)]
        
        adj = {nid: set() for nid in self.all_node_ids}
        for edge in active_edges:
            adj[edge['source']].add(edge['target'])
            adj[edge['target']].add(edge['source'])
            
        visited = set()
        def dfs(u):
            visited.add(u)
            for v in adj[u]:
                if v not in visited:
                    dfs(v)
                    
        for boundary_id in boundary_ids:
            if boundary_id not in visited and boundary_id not in inactive_node_ids:
                dfs(boundary_id)
                
        reachable_node_ids = visited.copy()
        
        # Clean active edges to only keep those connecting reachable nodes
        active_edges = [e for e in active_edges if e['source'] in reachable_node_ids and e['target'] in reachable_node_ids]
        
        # 4. Leaf/Dead-End Pruning (recursively prune non-boundary nodes with degree <= 1)
        pruned_nodes_set = set(self.all_node_ids) - reachable_node_ids
        while True:
            degree = {nid: 0 for nid in reachable_node_ids}
            for edge in active_edges:
                degree[edge['source']] += 1
                degree[edge['target']] += 1
                
            leaves = []
            for nid in reachable_node_ids:
                node = self.network.nodes[nid]
                if not getattr(node, 'is_pressure_boundary', False) and degree[nid] <= 1:
                    leaves.append(nid)
                    
            if not leaves:
                break
                
            for leaf_id in leaves:
                reachable_node_ids.remove(leaf_id)
                pruned_nodes_set.add(leaf_id)
            active_edges = [e for e in active_edges if e['source'] in reachable_node_ids and e['target'] in reachable_node_ids]
            
        self.pruned_node_ids = pruned_nodes_set
        self.active_node_ids = reachable_node_ids
        
        # Setup solver active lists
        self.nodes_list = [self.network.nodes[nid] for nid in sorted(list(self.active_node_ids))]
        self.node_ids = sorted(list(self.active_node_ids))
        self.edges_list = active_edges
        self.node_id_to_idx = {node_id: i for i, node_id in enumerate(self.node_ids)}
        
        self.fixed_pressure_nodes = {}
        self.internal_node_indices = []
        self.control_node_indices = [] # Pressure regulators
        self.tcv_node_indices = []     # Thermal mixing valves
        
        # Build a fixed topology key that uniquely identifies the layout of nodes & edges
        self.topology_key = (
            tuple(self.node_ids),
            tuple((e['source'], e['target'], e.get('source_port'), e.get('target_port')) for e in self.edges_list)
        )
        
        for i, node in enumerate(self.nodes_list):
            if getattr(node, 'is_pressure_boundary', False):
                self.fixed_pressure_nodes[i] = node.calculate()
            else:
                self.internal_node_indices.append(i)
                if isinstance(node, (LinearRegulator, RemoteControlValve)):
                    self.control_node_indices.append(i)
                if isinstance(node, ThreeWayTCV):
                    self.tcv_node_indices.append(i)

    def solve(self, method=None):
        self.prune_topology()
        start_time = time.perf_counter()
        max_outer_iterations = 100
        tolerance_bar = 0.001 
        tolerance_temp = 0.1 # 0.1K target
        
        gs = getattr(self.network, 'global_settings', None)
        if gs:
            max_outer_iterations = getattr(gs, 'control_iterations', 100)
        damping_factor = getattr(gs, 'damping_factor', 0.25) if gs else 0.25
        
        if method is None:
            method = getattr(gs, 'solver_method', 'sparse_newton') if gs else 'sparse_newton'
        if method == 'hybr':
            method = 'sparse_newton'

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
        prev_temperatures = {}


        for it in range(max_outer_iterations):
            outer_iterations += 1
            
            # Record current control states before they are updated in this iteration
            curr_control_states = {}
            for idx in self.control_node_indices:
                curr_control_states[idx] = self.nodes_list[idx].opening_pct
            for idx in self.tcv_node_indices:
                curr_control_states[f"tcv_{idx}"] = self.nodes_list[idx].mix_ratio

            try:
                res = self._solve_hydraulics_core(method=method, x0_custom=x_start)
                final_sol_x, num_int, inner_iters, fallback, last_residuals = res
                total_inner_iterations += inner_iters
                if fallback: fallback_triggered = True
                x_start = final_sol_x
            except ValueError as e:
                solve_error = str(e)
                last_residuals = getattr(self, '_last_evaluated_residuals', None)
                break
            
            # Extract final q_edges (already unscaled from solver run)
            q_edges = final_sol_x[num_int:]
            
            # Run property propagation in outer loop
            self._propagate_properties(q_edges)
            
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
                
                error_bar = (sensed - node.set_pressure) / 100000.0
                max_err_bar = max(max_err_bar, abs(error_bar))
                
                direction = 1.0 if node.backpressure else -1.0
                # Proportional feedback update (15% opening adjustment per 1 bar of error)
                gain = 15.0
                target_opening = node.opening_pct + direction * gain * error_bar
                target_opening = max(0.1, min(100.0, target_opening))
                
                node.opening_pct = node.opening_pct + damping_factor * (target_opening - node.opening_pct)
                node.opening_pct = max(0.1, min(100.0, node.opening_pct))

            # 2. 3-Way Thermal Control Valves
            # Physical Direction: The mix_ratio is tied STRICTLY to the user-selected HOT port.
            for idx in self.tcv_node_indices:
                node = self.nodes_list[idx]
                t_out = node.outlets[0].temperature
                t_err = t_out - node.set_temperature
                max_err_temp = max(max_err_temp, abs(t_err))
                
                t_hot_port = node.inlets[node.hot_port_idx].temperature
                t_cold_port = node.inlets[1 - node.hot_port_idx].temperature
                
                q_hot = node.inlets[node.hot_port_idx].flow_rate
                q_cold = node.inlets[1 - node.hot_port_idx].flow_rate
                
                t_diff = t_hot_port - t_cold_port
                
                # Check if we have positive flow on both ports and a valid temperature diff
                if q_hot > 1e-9 and q_cold > 1e-9 and abs(t_diff) > 0.5:
                    # Check if target is physically within the range of inlet temperatures
                    t_min = min(t_hot_port, t_cold_port)
                    t_max = max(t_hot_port, t_cold_port)
                    if node.set_temperature >= t_max:
                        # Target is hotter than or equal to both inlets, open hot port fully
                        target_mix = 1.0 if t_hot_port >= t_cold_port else 0.0
                        node.mix_ratio = node.mix_ratio + damping_factor * (target_mix - node.mix_ratio)
                    elif node.set_temperature <= t_min:
                        # Target is colder than or equal to both inlets, open cold port fully
                        target_mix = 0.0 if t_hot_port >= t_cold_port else 1.0
                        node.mix_ratio = node.mix_ratio + damping_factor * (target_mix - node.mix_ratio)
                    else:
                        num = node.set_temperature - t_cold_port
                        den = t_hot_port - node.set_temperature
                        if abs(den) > 0.01:
                            # R_target = (T_set - T_cold) / (T_hot - T_set)
                            R_target = num / den
                            # R_actual = Q_hot / Q_cold
                            R_actual = q_hot / q_cold
                            r_curr = node.mix_ratio
                            X = (r_curr / max(0.0001, 1.0 - r_curr)) * (R_target / max(1e-10, R_actual))
                            target_mix = X / (1.0 + X)
                            target_mix = max(0.001, min(0.999, target_mix))
                            # Damped update for stability
                            node.mix_ratio = node.mix_ratio + damping_factor * (target_mix - node.mix_ratio)
                        else:
                            node.mix_ratio = 0.5
                else:
                    # Fallback to incremental adjustment if temperatures are close or negative flow is active
                    direction = -1.0 if t_hot_port >= t_cold_port else 1.0
                    adjustment = direction * 0.05 * t_err
                    node.mix_ratio = max(0.001, min(0.999, node.mix_ratio + adjustment))
                node.mix_ratio = max(0.001, min(0.999, node.mix_ratio))




            # Calculate max temp change in properties to check convergence
            max_temp_change = 0.0
            curr_temperatures = {}
            for node_id, node in self.network.nodes.items():
                for p_idx, p in enumerate(node.inlets + node.outlets):
                    key = f"{node_id}_p_{p_idx}"
                    curr_temperatures[key] = p.temperature
                    if key in prev_temperatures:
                        max_temp_change = max(max_temp_change, abs(p.temperature - prev_temperatures[key]))
            
            if not prev_temperatures:
                max_temp_change = 1.0
            prev_temperatures = curr_temperatures

            properties_converged = (max_temp_change < 0.05)

            # Check if control states have changed during this iteration
            control_settled = False
            has_controls = (len(self.control_node_indices) > 0 or len(self.tcv_node_indices) > 0)
            if has_controls and it >= 2:
                max_mix_change = 0.0
                max_open_change = 0.0
                for idx in self.control_node_indices:
                    diff = abs(self.nodes_list[idx].opening_pct - curr_control_states[idx])
                    max_open_change = max(max_open_change, diff)
                for idx in self.tcv_node_indices:
                    diff = abs(self.nodes_list[idx].mix_ratio - curr_control_states[f"tcv_{idx}"])
                    max_mix_change = max(max_mix_change, diff)

                if max_mix_change < 0.001 and max_open_change < 0.05:
                    control_settled = True


            if (max_err_bar < tolerance_bar and max_err_temp < tolerance_temp and properties_converged) or control_settled:
                break

        if solve_error is None and final_sol_x is not None:
            num_int = len(self.internal_node_indices)
            self._update_telemetry(final_sol_x[:num_int], final_sol_x[num_int:])

        bottleneck = self._identify_bottleneck(last_residuals) if last_residuals is not None else None
        max_hydraulic_residual = float(np.max(np.abs(last_residuals))) if (last_residuals is not None and len(last_residuals) > 0) else 0.0
        stats = {
            "success": solve_error is None,
            "error": solve_error,
            "time_ms": (time.perf_counter() - start_time) * 1000,
            "outer_iterations": outer_iterations,
            "total_inner_iterations": total_inner_iterations,
            "property_iterations": self.last_prop_iters,
            "fallback_used": fallback_triggered,
            "solver_method": method,
            "warm_start_status": self.warm_start_status,
            "max_residual": max_hydraulic_residual,
            "system_size": len(self.internal_node_indices) + len(self.edges_list),
            "num_nodes": len(self.internal_node_indices),
            "num_edges": len(self.edges_list),
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
            return {"type": "Node", "name": node.name, "id": node.id, "error_type": "Mass Balance", "magnitude": max_val}
        else:
            edge_idx = max_idx - num_internal
            edge = self.edges_list[edge_idx]
            return {"type": "Connection", "name": edge.get('label') or edge.get('id'), "id": edge.get('id'), "error_type": "Pressure Balance", "magnitude": max_val}

    def _generate_initial_guess(self):
        gs = getattr(self.network, 'global_settings', None)
        warm_start_enabled = getattr(gs, 'warm_start', True) if gs else True
        
        if warm_start_enabled:
            # Check warm-start cache first
            cache_key = (self.topology_key, self.active_case_id)
            if cache_key in NetworkSolver._warm_start_cache:
                self.warm_start_status = "Exact Hit"
                return NetworkSolver._warm_start_cache[cache_key].copy()

            # Fallback: reuse any cached solution with matching topology
            for (tok, cid), cached_val in NetworkSolver._warm_start_cache.items():
                if tok == self.topology_key:
                    self.warm_start_status = "Topology Match"
                    return cached_val.copy()
            
            self.warm_start_status = "Cold Start"
        else:
            self.warm_start_status = "Disabled"


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

    def calculate_jacobian(self, x_scaled) -> np.ndarray:
        """
        Calculates the sparse Jacobian J(x_scaled) analytically.
        """
        import scipy.sparse as sp
        
        num_internal = len(self.internal_node_indices)
        num_edges = len(self.edges_list)
        N = num_internal + num_edges
        
        p_scale = 100000.0
        q_scale = 0.001
        
        rows = []
        cols = []
        data = []
        
        # Extract variables from x_scaled
        p_in_internal = x_scaled[:num_internal] * p_scale
        q_edges = x_scaled[num_internal:] * q_scale
        
        # Reconstruct all node pressures
        p_in_all = np.zeros(len(self.nodes_list))
        for i, p in self.fixed_pressure_nodes.items():
            p_in_all[i] = p
        for i, idx in enumerate(self.internal_node_indices):
            p_in_all[idx] = p_in_internal[i]

        # Precompute q_in_node for all nodes
        q_in_node_all = np.zeros(len(self.nodes_list))
        for j, edge in enumerate(self.edges_list):
            tgt_idx = self.node_id_to_idx[edge['target']]
            q_in_node_all[tgt_idx] += q_edges[j]

        # 1. Mass Balance Rows (a < num_internal)
        for a, node_idx in enumerate(self.internal_node_indices):
            node_id = self.node_ids[node_idx]
            
            # Tiny regularization to prevent exactly singular matrix (floating nodes)
            rows.append(a)
            cols.append(a)
            data.append(1e-9)
            
            for j, edge in enumerate(self.edges_list):
                if edge['target'] == node_id:
                    rows.append(a)
                    cols.append(num_internal + j)
                    data.append(5.0)
                if edge['source'] == node_id:
                    rows.append(a)
                    cols.append(num_internal + j)
                    data.append(-5.0)

        # 2. Pressure Balance Rows (a_row = num_internal + j)
        for j, edge in enumerate(self.edges_list):
            a_row = num_internal + j
            src_id = edge['source']
            tgt_id = edge['target']
            src_idx = self.node_id_to_idx[src_id]
            tgt_idx = self.node_id_to_idx[tgt_id]
            src_node = self.nodes_list[src_idx]
            
            src_internal_idx = -1
            if src_idx in self.internal_node_indices:
                src_internal_idx = self.internal_node_indices.index(src_idx)
            tgt_internal_idx = -1
            if tgt_idx in self.internal_node_indices:
                tgt_internal_idx = self.internal_node_indices.index(tgt_idx)

            if self._use_mcp_for_node(src_node):
                epsilon = 1e-4
                cracking_pa = src_node.cracking_pressure_bar * 100000.0 if hasattr(src_node, 'cracking_pressure_bar') else getattr(src_node, 'burst_pressure_bar', 0.0) * 100000.0
                
                pipe = edge['pipe']
                pipe_inlet = pipe.inlets[0]
                pipe_density = pipe_inlet.density
                pipe_viscosity = pipe_inlet.viscosity
                dp_pipe = pipe.calculate_delta_p(q_edges[j], pipe_density, pipe_viscosity)
                dp_deriv_pipe = max(100.0, pipe.calculate_dp_derivative(q_edges[j], pipe_density, pipe_viscosity))
                
                inlet = src_node.inlets[0] if src_node.inlets else None
                density = inlet.density if inlet else 1000.0
                viscosity = inlet.viscosity if inlet else 0.001
                dp_friction, dfriction_dq = src_node.calculate_open_friction_and_deriv(q_edges[j], density, viscosity)
                
                a_val = q_edges[j] / q_scale
                p_in = p_in_all[src_idx]
                p_tgt_in = p_in_all[tgt_idx]
                dp_valve = p_in - (p_tgt_in + dp_pipe)
                b_val = (cracking_pa + dp_friction - dp_valve) / p_scale
                
                denom = math.sqrt(a_val**2 + b_val**2 + epsilon**2)
                dPhi_da = (a_val / denom) - 1.0
                dPhi_db = (b_val / denom) - 1.0
                
                if src_internal_idx != -1:
                    rows.append(a_row)
                    cols.append(src_internal_idx)
                    data.append(-dPhi_db)
                    
                if tgt_internal_idx != -1:
                    rows.append(a_row)
                    cols.append(tgt_internal_idx)
                    data.append(dPhi_db)
                    
                db_dq = (dfriction_dq + dp_deriv_pipe) / p_scale
                dPhi_dq = dPhi_da + dPhi_db * db_dq * q_scale
                rows.append(a_row)
                cols.append(num_internal + j)
                data.append(dPhi_dq)
            else:
                if src_internal_idx != -1:
                    rows.append(a_row)
                    cols.append(src_internal_idx)
                    data.append(1.0)

                if tgt_internal_idx != -1:
                    rows.append(a_row)
                    cols.append(tgt_internal_idx)
                    data.append(-1.0)

                # Term 1: d(P_src_out)/dq_k
                if not isinstance(src_node, ThreeWayTCV) and hasattr(src_node, 'calculate_delta_p'):
                    inlet = src_node.inlets[0] if src_node.inlets else None
                    density = inlet.density if inlet else 1000.0
                    viscosity = inlet.viscosity if inlet else 0.001
                    
                    dp_deriv_src = src_node.calculate_dp_derivative(q_in_node_all[src_idx], density, viscosity)
                    is_pump = isinstance(src_node, (CentrifugalPump, VolumetricPump))
                    sign = 1.0 if is_pump else -1.0
                    dp_deriv_src_signed = sign * dp_deriv_src
                    
                    for k, e in enumerate(self.edges_list):
                        if e['target'] == src_id:
                            rows.append(a_row)
                            cols.append(num_internal + k)
                            data.append((q_scale / p_scale) * dp_deriv_src_signed)

                # Term 2: d(dp_pipe)/dq_j
                pipe = edge['pipe']
                pipe_inlet = pipe.inlets[0]
                pipe_density = pipe_inlet.density
                pipe_viscosity = pipe_inlet.viscosity
                dp_deriv_pipe = max(100.0, pipe.calculate_dp_derivative(q_edges[j], pipe_density, pipe_viscosity))
                
                # Term 3: d(dp_tcv)/dq_j
                dp_deriv_tcv = 0.0
                if isinstance(self.network.nodes[tgt_id], ThreeWayTCV):
                    tgt_node = self.network.nodes[tgt_id]
                    port_idx = self._parse_port_idx(edge.get('target_port', 'inlet-0'))
                    tcv_density = tgt_node.inlets[port_idx].density
                    tcv_viscosity = tgt_node.inlets[port_idx].viscosity
                    dp_deriv_tcv = max(100.0, tgt_node.calculate_dp_derivative_path(q_edges[j], tcv_density, port_idx, tcv_viscosity))

                rows.append(a_row)
                cols.append(num_internal + j)
                data.append((q_scale / p_scale) * (-dp_deriv_pipe - dp_deriv_tcv))

        return sp.coo_matrix((data, (rows, cols)), shape=(N, N)).tocsr()

    def _solve_sparse_newton(self, objective, x0, tol=1e-6, max_iter=100):
        """
        Custom high-performance sparse Newton-Raphson solver using backtracking line search.
        """
        import scipy.sparse.linalg as spla
        
        class SolResult:
            def __init__(self, success, message, x, nfev, njev):
                self.success = success
                self.message = message
                self.x = x
                self.nfev = nfev
                self.njev = njev

        x = x0.copy()
        r = objective(x)
        err = np.max(np.abs(r))
        
        nfev = 1
        njev = 0
        
        if err < tol:
            return SolResult(True, "Already converged", x, nfev, njev)
            
        for it in range(max_iter):
            J = self.calculate_jacobian(x)
            njev += 1
            
            try:
                # Solve linear system J * dx = -r
                dx = spla.spsolve(J, -r)
            except Exception as e:
                return SolResult(False, f"Linear system solver failed: {e}", x, nfev, njev)
            
            # Backtracking line search
            alpha = 1.0
            r_norm = np.linalg.norm(r)
            backtrack_success = False
            
            for bt in range(25):
                x_next = x + alpha * dx
                r_next = objective(x_next)
                nfev += 1
                r_next_norm = np.linalg.norm(r_next)
                
                if r_next_norm < r_norm:
                    x = x_next
                    r = r_next
                    err = np.max(np.abs(r))
                    backtrack_success = True
                    break
                alpha *= 0.5
                
            if not backtrack_success:
                return SolResult(False, "Backtracking line search failed to decrease residual", x, nfev, njev)
                
            if err < tol:
                return SolResult(True, "Converged", x, nfev, njev)
                
        return SolResult(False, f"Reached max iterations ({max_iter})", x, nfev, njev)

    def _solve_hydraulics_core(self, method='sparse_newton', x0_custom=None) -> Tuple[np.ndarray, int, int, bool, np.ndarray]:
        num_internal = len(self.internal_node_indices)
        num_edges = len(self.edges_list)
        if (num_internal + num_edges) == 0:
            self._update_telemetry(np.array([]), np.array([]))
            self._last_evaluated_residuals = np.array([])
            return np.array([]), 0, 0, False, np.array([])

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
            p_in_all = np.zeros(len(self.nodes_list))
            for i, p in self.fixed_pressure_nodes.items(): p_in_all[i] = p
            for i, idx in enumerate(self.internal_node_indices): p_in_all[idx] = p_in_internal[i]
            
            residuals = []
            # 1. Mass Balance
            for i, node_idx in enumerate(self.internal_node_indices):
                node_id = self.node_ids[node_idx]
                q_in = sum(q_edges[j] for j, e in enumerate(self.edges_list) if e['target'] == node_id)
                q_out = sum(q_edges[j] for j, e in enumerate(self.edges_list) if e['source'] == node_id)
                residuals.append(5.0 * (q_in - q_out) / q_scale + 1e-9 * x_scaled[i])
            
            # 2. Pressure Balance
            for j, edge in enumerate(self.edges_list):
                src_id = edge['source']
                tgt_id = edge['target']
                src_idx = self.node_id_to_idx[src_id]
                tgt_idx = self.node_id_to_idx[tgt_id]
                src_node = self.nodes_list[src_idx]
                
                if isinstance(src_node, ThreeWayTCV):
                    p_src_out = p_in_all[src_idx]
                elif self._use_mcp_for_node(src_node):
                    pipe = edge['pipe']
                    dp_pipe = pipe.calculate_delta_p(q_edges[j], pipe.inlets[0].density, pipe.inlets[0].viscosity)
                    p_out_est = p_in_all[tgt_idx] + dp_pipe
                    
                    inlet = src_node.inlets[0] if src_node.inlets else None
                    density = inlet.density if inlet else 1000.0
                    viscosity = inlet.viscosity if inlet else 0.001
                    dp_node = src_node.calculate_delta_p(q_edges[j], density, viscosity, p_in_pa=p_in_all[src_idx], p_out_pa=p_out_est, update_state=False)
                    p_src_out = p_in_all[src_idx] - dp_node
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

        def dense_jacobian(x_scaled):
            return self.calculate_jacobian(x_scaled).toarray()

        gs = getattr(self.network, 'global_settings', None)
        inner_max_steps = getattr(gs, 'inner_iterations', 1000) if gs else 1000
        tol = getattr(gs, 'tolerance', 1e-6) if gs else 1e-6
        fallback_used = False
        
        residual_tolerance = max(1e-4, 10.0 * tol)
        
        if method == 'sparse_newton':
            sol = self._solve_sparse_newton(objective, x0, tol=residual_tolerance, max_iter=inner_max_steps)
            if not sol.success or not is_physical(sol.x):
                # Fallback to LM starting from original initial guess x0
                fallback_used = True
                sol = root(objective, x0, method='lm', jac=dense_jacobian, tol=residual_tolerance, options={'maxiter': inner_max_steps})
        else:
            # Explicitly selected LM least-squares solver
            sol = root(objective, x0, method='lm', jac=dense_jacobian, tol=residual_tolerance, options={'maxiter': inner_max_steps})

                
        final_residuals = objective(sol.x)
        self._last_evaluated_residuals = final_residuals
        max_res = np.max(np.abs(final_residuals))
        
        is_converged = bool(sol.success and (max_res <= residual_tolerance))
        
        if is_converged:
            final_p = sol.x[:num_internal] * p_scale
            final_q = sol.x[num_internal:] * q_scale
            self._update_telemetry(final_p, final_q)
            
            # Cache the converged state vector if enabled
            gs = getattr(self.network, 'global_settings', None)
            warm_start_enabled = getattr(gs, 'warm_start', True) if gs else True
            converged_x = np.concatenate([final_p, final_q])
            if warm_start_enabled:
                NetworkSolver._warm_start_cache[(self.topology_key, self.active_case_id)] = converged_x
            
            return converged_x, num_internal, getattr(sol, 'nfev', 0), fallback_used, final_residuals
        else:
            msg = getattr(sol, 'message', 'Residuals did not converge to tolerance')
            raise ValueError(f"Solver failed to converge: message='{msg}', max_residual={max_res:.6f} (scaled)")


    def _use_mcp_for_node(self, node) -> bool:
        if getattr(node, 'use_mcp_formulation', False):
            return True
        if getattr(node, 'node_type', '') in ['pressure_safety_valve', 'rupture_disc']:
            if getattr(node, 'forced_state', '') == 'auto':
                is_open = getattr(node, 'status', '') in ['cracked', 'burst', 'overcapacity'] or getattr(node, 'is_burst', False)
                return not is_open
        return False

    def _get_node_p_out(self, node, p_in, q_in, q_out, update_state: bool = False):
        inlet = node.inlets[0] if node.inlets else None
        density = inlet.density if inlet else 1000.0
        viscosity = inlet.viscosity if inlet else 0.001
        
        if isinstance(node, (CentrifugalPump, VolumetricPump)):
            return p_in + node.calculate_delta_p(q_in, density, viscosity)
        elif hasattr(node, 'calculate_delta_p'):
            if self._use_mcp_for_node(node):
                p_out_est = p_in
                for edge in self.all_edges_list:
                    if edge['source'] == node.id:
                        tgt_id = edge['target']
                        tgt_idx = self.all_node_id_to_idx[tgt_id]
                        tgt_node = self.network.nodes[tgt_id]
                        p_out_est = tgt_node.inlets[0].pressure + edge['pipe'].calculate_delta_p(q_in, density, viscosity)
                        break
                return p_in - node.calculate_delta_p(q_in, density, viscosity, p_in_pa=p_in, p_out_pa=p_out_est, update_state=update_state)
            
            if hasattr(node, 'node_type') and node.node_type in ['pressure_safety_valve', 'rupture_disc']:
                return p_in - node.calculate_delta_p(q_in, density, viscosity, p_in_pa=p_in, update_state=update_state)
            return p_in - node.calculate_delta_p(q_in, density, viscosity)
        else:
            return p_in

    def _update_telemetry(self, p_in_internal, q_edges):
        self._propagate_properties(q_edges)
        
        # Populate all nodes' pressures and edges' flows (including pruned ones)
        gs = getattr(self.network, 'global_settings', None)
        atm_p = getattr(gs, 'atmospheric_pressure', 101325.0) if gs else 101325.0
        p_in_all = np.full(len(self.all_nodes_list), atm_p)
        
        # 1. Populate fixed pressure boundaries
        for i, node in enumerate(self.all_nodes_list):
            if getattr(node, 'is_pressure_boundary', False):
                p_in_all[i] = node.calculate()
                
        # 2. Populate active solved internal node pressures
        for i, idx in enumerate(self.internal_node_indices):
            active_node_id = self.node_ids[idx]
            all_idx = self.all_node_id_to_idx[active_node_id]
            p_in_all[all_idx] = p_in_internal[i]
            
        # 4. Clear all flows to 0.0 initially
        for node in self.all_nodes_list:
            for port in node.inlets: port.flow_rate = 0.0
            for port in node.outlets: port.flow_rate = 0.0

        # 5. Populate active flows
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

        # 6. First pass: Populate active node pressures and update active node states
        for node in self.all_nodes_list:
            node_key = self.node_to_key[id(node)]
            if node_key in self.active_node_ids:
                all_idx = self.all_node_id_to_idx[node_key]
                p_in = p_in_all[all_idx]
                for port in node.inlets: port.pressure = p_in
                q_in_total = sum(p.flow_rate for p in node.inlets)
                q_out_total = sum(p.flow_rate for p in node.outlets)
                p_out = self._get_node_p_out(node, p_in, q_in_total, q_out_total, update_state=True)
                for port in node.outlets: port.pressure = p_out
                if isinstance(node, ThreeWayTCV):
                    node.calculate()

        # 6b. Bidirectional pressure propagation to pruned/inactive components
        def is_closed_relief_node(n):
            return getattr(n, 'node_type', '') in ['pressure_safety_valve', 'rupture_disc'] and \
                   (getattr(n, 'status', '') in ['closed', 'intact'] or getattr(n, 'forced_state', '') == 'forced_closed')

        for _ in range(5):
            for edge in self.all_edges_list:
                src_node = self.network.nodes[edge['source']]
                tgt_node = self.network.nodes[edge['target']]
                
                src_key = self.node_to_key[id(src_node)]
                tgt_key = self.node_to_key[id(tgt_node)]
                
                # Case 1: Propagate downstream (src is active, tgt is pruned)
                if src_key not in self.pruned_node_ids and tgt_key in self.pruned_node_ids:
                    # Closed relief nodes block pressure propagation from inlet to outlet
                    if is_closed_relief_node(src_node):
                        continue
                    src_port_idx = self._parse_port_idx(edge.get('source_port', 'outlet-0'))
                    if src_port_idx < len(src_node.outlets):
                        p_src_out = src_node.outlets[src_port_idx].pressure
                        tgt_idx = self.all_node_id_to_idx[tgt_key]
                        p_in_all[tgt_idx] = p_src_out
                        for port in tgt_node.inlets: port.pressure = p_src_out
                        if not is_closed_relief_node(tgt_node):
                            p_out = self._get_node_p_out(tgt_node, p_src_out, 0.0, 0.0, update_state=True)
                            for port in tgt_node.outlets: port.pressure = p_out

                # Case 2: Propagate upstream (tgt is active, src is pruned)
                elif tgt_key not in self.pruned_node_ids and src_key in self.pruned_node_ids:
                    # Closed relief nodes block pressure propagation from outlet to inlet
                    if is_closed_relief_node(tgt_node):
                        continue
                    tgt_port_idx = self._parse_port_idx(edge.get('target_port', 'inlet-0'))
                    if tgt_port_idx < len(tgt_node.inlets):
                        p_tgt_in = tgt_node.inlets[tgt_port_idx].pressure
                        src_idx = self.all_node_id_to_idx[src_key]
                        p_in_all[src_idx] = p_tgt_in
                        for port in src_node.outlets: port.pressure = p_tgt_in
                        if not is_closed_relief_node(src_node):
                            for port in src_node.inlets: port.pressure = p_tgt_in

                # Case 3: Both pruned -> propagate from updated node to unupdated node (relative to atmospheric pressure)
                elif src_key in self.pruned_node_ids and tgt_key in self.pruned_node_ids:
                    src_idx = self.all_node_id_to_idx[src_key]
                    tgt_idx = self.all_node_id_to_idx[tgt_key]
                    p_src = p_in_all[src_idx]
                    p_tgt = p_in_all[tgt_idx]
                    
                    if abs(p_src - atm_p) > abs(p_tgt - atm_p):
                        if is_closed_relief_node(src_node):
                            continue
                        src_port_idx = self._parse_port_idx(edge.get('source_port', 'outlet-0'))
                        if src_port_idx < len(src_node.outlets):
                            p_src_out = src_node.outlets[src_port_idx].pressure
                            p_in_all[tgt_idx] = p_src_out
                            for port in tgt_node.inlets: port.pressure = p_src_out
                            if not is_closed_relief_node(tgt_node):
                                p_out = self._get_node_p_out(tgt_node, p_src_out, 0.0, 0.0, update_state=True)
                                for port in tgt_node.outlets: port.pressure = p_out
                    elif abs(p_tgt - atm_p) > abs(p_src - atm_p):
                        if is_closed_relief_node(tgt_node):
                            continue
                        tgt_port_idx = self._parse_port_idx(edge.get('target_port', 'inlet-0'))
                        if tgt_port_idx < len(tgt_node.inlets):
                            p_tgt_in = tgt_node.inlets[tgt_port_idx].pressure
                            p_in_all[src_idx] = p_tgt_in
                            for port in src_node.outlets: port.pressure = p_tgt_in
                            if not is_closed_relief_node(src_node):
                                for port in src_node.inlets: port.pressure = p_tgt_in

        # 7. Special handling for closed/pruned relief nodes (PSV & Rupture Disc)
        for node in self.all_nodes_list:
            if getattr(node, 'node_type', '') in ['pressure_safety_valve', 'rupture_disc']:
                is_closed = getattr(node, 'status', '') in ['closed', 'intact'] or getattr(node, 'forced_state', '') == 'forced_closed'
                if is_closed:
                    node_id = self.node_to_key[id(node)]
                    ds_p = node.inlets[0].pressure if node.inlets else 101325.0
                    for edge in self.all_edges_list:
                        if edge['source'] == node_id:
                            tgt_id = edge['target']
                            tgt_idx = self.all_node_id_to_idx[tgt_id]
                            ds_p = p_in_all[tgt_idx]
                            break
                    for port in node.inlets: port.flow_rate = 0.0
                    for port in node.outlets:
                        port.flow_rate = 0.0
                        port.pressure = ds_p

        # 8. Populate all edges' pipe flows and pressures
        for edge in self.all_edges_list:
            pipe = edge['pipe']
            src_node = self.network.nodes[edge['source']]
            tgt_node = self.network.nodes[edge['target']]
            
            is_active = (edge in self.edges_list)
            q = q_edges[self.edges_list.index(edge)] if is_active else 0.0
            
            src_is_closed_relief = getattr(src_node, 'node_type', '') in ['pressure_safety_valve', 'rupture_disc'] and \
                                   (getattr(src_node, 'status', '') in ['closed', 'intact'] or getattr(src_node, 'forced_state', '') == 'forced_closed')
            tgt_is_closed_relief = getattr(tgt_node, 'node_type', '') in ['pressure_safety_valve', 'rupture_disc'] and \
                                   (getattr(tgt_node, 'status', '') in ['closed', 'intact'] or getattr(tgt_node, 'forced_state', '') == 'forced_closed')

            if src_is_closed_relief:
                pipe_p = src_node.outlets[0].pressure
                pipe.inlets[0].pressure = pipe_p
                pipe.outlets[0].pressure = pipe_p
                pipe.inlets[0].flow_rate = 0.0
                pipe.outlets[0].flow_rate = 0.0
            elif tgt_is_closed_relief:
                pipe_p = tgt_node.inlets[0].pressure
                pipe.inlets[0].pressure = pipe_p
                pipe.outlets[0].pressure = pipe_p
                pipe.inlets[0].flow_rate = 0.0
                pipe.outlets[0].flow_rate = 0.0
            else:
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
        # Save all port pressures to prevent property calculations from corrupting solved pressures
        saved_pressures = {}
        for node in self.network.nodes.values():
            saved_pressures[node] = (
                [port.pressure for port in node.inlets],
                [port.pressure for port in node.outlets]
            )

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

        # Restore all port pressures
        for node, (in_pressures, out_pressures) in saved_pressures.items():
            for port, p in zip(node.inlets, in_pressures):
                port.pressure = p
            for port, p in zip(node.outlets, out_pressures):
                port.pressure = p


def run_sequential_relief_simulation(network, solver, extract_telemetry_fn):
    """
    Executes sequential multi-pass relief valve popping physics.
    Pass 1: Lock all relief valves forced_closed to calculate unmitigated baseline.
    Passes 2+: Sequentially unlock relief devices starting with the lowest setpoint first.
             Only unlock higher setpoint devices if lower setpoint devices fail to suppress overpressure.
    """
    psv_nodes = [node for node in network.nodes.values() if getattr(node, 'node_type', '') in ['pressure_safety_valve', 'rupture_disc']]
    has_psv = len(psv_nodes) > 0

    if not psv_nodes:
        stats = solver.solve()
        telemetry = extract_telemetry_fn(network)
        return stats, telemetry, telemetry, False

    # Save original forced_state configured by user
    original_states = {node.name: node.forced_state for node in psv_nodes}

    def get_set_pressure_bar(node):
        if hasattr(node, 'set_pressure_bar'):
            return float(node.set_pressure_bar)
        elif hasattr(node, 'burst_pressure_bar'):
            return float(node.burst_pressure_bar)
        return 0.0

    def calc_max_pressure_bara(tel):
        """Helper to compute maximum system pressure across all nodes and edges in bara (bar absolute)."""
        max_pa = 0.0
        if tel and "nodes" in tel:
            for n in tel["nodes"].values():
                for p in n.get("inlets", []) + n.get("outlets", []):
                    p_val = p.get("pressure")
                    if isinstance(p_val, (int, float)) and p_val > max_pa:
                        max_pa = p_val
        if tel and "edges" in tel:
            for e in tel["edges"].values():
                for p in e.get("inlets", []) + e.get("outlets", []):
                    p_val = p.get("pressure")
                    if isinstance(p_val, (int, float)) and p_val > max_pa:
                        max_pa = p_val
        return max_pa / 100000.0 if max_pa > 0 else 1.01325

    # Pass 1: Unmitigated (All relief nodes forced closed to establish overpressure baseline)
    for node in psv_nodes:
        node.forced_state = "forced_closed"
        node.reset_run_state()

    solver.solve()
    telemetry_unmitigated = extract_telemetry_fn(network)

    # Initialize sequential states for Mitigated passes
    auto_psv_nodes = [node for node in psv_nodes if original_states[node.name] == "auto"]

    for node in auto_psv_nodes:
        node.forced_state = "forced_closed"
        node.reset_run_state()

    stats = None
    max_passes = len(auto_psv_nodes) + 1
    pass_max_pressures = []

    for pass_idx in range(max_passes):
        # 1. Solve current state
        stats = solver.solve()
        tel_pass = extract_telemetry_fn(network)
        pass_max_pressures.append(calc_max_pressure_bara(tel_pass))

        # 2. Check inlet pressures of closed auto relief nodes
        breached_nodes = []
        for node in auto_psv_nodes:
            if node.forced_state == "forced_closed":
                p_in_bar = (node.inlets[0].pressure / 100000.0) if node.inlets else 0.0
                set_p = get_set_pressure_bar(node)
                if p_in_bar >= set_p:
                    breached_nodes.append((set_p, node))

        # 3. If no closed relief devices breached set pressure, steady-state equilibrium achieved!
        if not breached_nodes:
            break

        # 4. Find lowest set pressure among breached closed devices
        min_set_p = min(item[0] for item in breached_nodes)

        # 5. Unlock all breached closed devices sharing this minimum set pressure
        unlocked_any = False
        for set_p, node in breached_nodes:
            if abs(set_p - min_set_p) < 1e-4:
                node.forced_state = "auto"
                node.reset_run_state()
                unlocked_any = True

        if not unlocked_any:
            break

    telemetry_mitigated = extract_telemetry_fn(network)

    # =========================================================================
    # RELIEF CONTINGENCY PRESSURE METRICS (ALL IN BARA / BAR ABSOLUTE)
    # -------------------------------------------------------------------------
    # 1. Relieved System Pressure: Post-mitigation steady-state max pressure
    #    after relief devices have opened to suppress overpressure.
    # 2. Peak System Pressure: Maximum system pressure recorded during the
    #    overpressure transient at the moment of opening relief devices.
    # 3. Unmitigated Peak Pressure: Maximum system pressure if ALL relief
    #    devices remain locked closed (Pass 1 baseline).
    # =========================================================================
    relieved_pressure_bara = calc_max_pressure_bara(telemetry_mitigated)
    unmitigated_peak_pressure_bara = calc_max_pressure_bara(telemetry_unmitigated)
    
    # Calculate peak pressure at the moment the first relief device popped:
    # 1. Identify all relief devices that popped open.
    # 2. Pick the one that opened first (the one with the lowest set/burst rating).
    # 3. Scale down the system pressure drop from the unmitigated baseline (Pass 0)
    #    to the exact moment when the differential pressure across that first device
    #    reached its cracking setpoint.
    # 4. If no relief devices popped, the peak pressure equals the relieved operating pressure.
    popped_nodes = [
        node for node in psv_nodes
        if telemetry_mitigated.get("nodes", {}).get(node.id, {}).get("status") in ["cracked", "burst", "overcapacity"]
    ]
    if popped_nodes:
        # Identify the highest setpoint relief device that actually opened in the simulation.
        # - If the highest opened device is a modulating valve, the pressure does not drop
        #   abruptly upon opening; therefore, the peak pressure equals the final steady-state
        #   relieved operating pressure.
        # - If the highest opened device is a pop-action PSV or a rupture disc, the pressure
        #   drops once it opens. Thus, the peak pressure is the scaled transient cracking pressure.
        highest_popped_node = max(popped_nodes, key=get_set_pressure_bar)
        is_modulating = (getattr(highest_popped_node, 'action_mode', '') == 'modulating')
        
        if is_modulating:
            peak_pressure_bara = relieved_pressure_bara
        else:
            node_id = highest_popped_node.id
            unmit_node = telemetry_unmitigated.get("nodes", {}).get(node_id)
            if unmit_node and unmit_node.get("inlets") and unmit_node.get("outlets"):
                p_in = unmit_node["inlets"][0]["pressure"]
                p_out = unmit_node["outlets"][0]["pressure"]
                dp_unmit = max(1.0, p_in - p_out)
                dp_cracking = get_set_pressure_bar(highest_popped_node) * 100000.0
                
                # Scaling factor (S <= 1.0)
                S = min(1.0, dp_cracking / dp_unmit)
                
                # Find max/min pressure in unmitigated pass
                unmit_max_pa = 0.0
                unmit_min_pa = float('inf')
                for n in telemetry_unmitigated["nodes"].values():
                    for p in n.get("inlets", []) + n.get("outlets", []):
                        p_val = p.get("pressure")
                        if isinstance(p_val, (int, float)):
                            if p_val > unmit_max_pa: unmit_max_pa = p_val
                            if p_val < unmit_min_pa: unmit_min_pa = p_val
                for e in telemetry_unmitigated["edges"].values():
                    for p in e.get("inlets", []) + e.get("outlets", []):
                        p_val = p.get("pressure")
                        if isinstance(p_val, (int, float)):
                            if p_val > unmit_max_pa: unmit_max_pa = p_val
                            if p_val < unmit_min_pa: unmit_min_pa = p_val
                
                if unmit_min_pa == float('inf'):
                    unmit_min_pa = 101325.0
                
                # Scale the absolute pressure from reference min pressure
                peak_pressure_pa = unmit_min_pa + S * (unmit_max_pa - unmit_min_pa)
                peak_pressure_bara = peak_pressure_pa / 100000.0
            else:
                peak_pressure_bara = relieved_pressure_bara
    else:
        peak_pressure_bara = relieved_pressure_bara

    if "kpis" not in telemetry_mitigated or not isinstance(telemetry_mitigated["kpis"], dict):
        telemetry_mitigated["kpis"] = {}
    if "kpis" not in telemetry_unmitigated or not isinstance(telemetry_unmitigated["kpis"], dict):
        telemetry_unmitigated["kpis"] = {}

    telemetry_mitigated["kpis"]["relieved_pressure_bara"] = round(relieved_pressure_bara, 2)
    telemetry_mitigated["kpis"]["peak_pressure_bara"] = round(peak_pressure_bara, 2)
    telemetry_mitigated["kpis"]["unmitigated_peak_pressure_bara"] = round(unmitigated_peak_pressure_bara, 2)
    telemetry_mitigated["kpis"]["max_pressure_bar"] = round(relieved_pressure_bara, 2)

    telemetry_unmitigated["kpis"]["relieved_pressure_bara"] = round(relieved_pressure_bara, 2)
    telemetry_unmitigated["kpis"]["peak_pressure_bara"] = round(peak_pressure_bara, 2)
    telemetry_unmitigated["kpis"]["unmitigated_peak_pressure_bara"] = round(unmitigated_peak_pressure_bara, 2)
    telemetry_unmitigated["kpis"]["max_pressure_bar"] = round(unmitigated_peak_pressure_bara, 2)

    return stats, telemetry_mitigated, telemetry_unmitigated, has_psv
