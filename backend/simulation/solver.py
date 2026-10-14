import copy
import numpy as np
import math
import threading
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
    _warm_start_cache: Dict[Tuple, np.ndarray] = {}
    _MAX_WARM_START_ENTRIES: int = 128
    # Solves run in worker threads (asyncio.to_thread); every cache access goes through this lock (F1-14)
    _warm_start_lock = threading.Lock()

    @classmethod
    def clear_warm_start_cache(cls):
        """Clears the class-level warm-start cache to release memory."""
        with cls._warm_start_lock:
            cls._warm_start_cache.clear()

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
        self.persist_warm_start = True   # False for auxiliary solves (relief ramp) that must not overwrite the cache

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
                
        # F1-10: connected circuits (counting edges through inactive nodes) that contain no pressure reference
        full_adj = {nid: set() for nid in self.all_node_ids}
        for edge in self.all_edges_list:
            if edge['source'] in full_adj and edge['target'] in full_adj:
                full_adj[edge['source']].add(edge['target'])
                full_adj[edge['target']].add(edge['source'])
        seen = set()
        self.island_groups = []
        for start in self.all_node_ids:
            if start in seen:
                continue
            group, stack = [], [start]
            seen.add(start)
            while stack:
                u = stack.pop()
                group.append(u)
                for v in full_adj[u]:
                    if v not in seen:
                        seen.add(v)
                        stack.append(v)
            has_reference = any(
                getattr(self.network.nodes[n], 'is_pressure_boundary', False) or getattr(self.network.nodes[n], 'node_type', None) == 'flow_source'
                for n in group
            )
            if len(group) >= 2 and not has_reference:
                self.island_groups.append(sorted(group))

        # 3. Reachability Analysis (undirected DFS from pressure boundaries or flow sources)
        boundary_ids = [
            nid for nid, node in self.network.nodes.items()
            if getattr(node, 'is_pressure_boundary', False) or getattr(node, 'node_type', None) == 'flow_source'
        ]
        
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
                is_boundary = getattr(node, 'is_pressure_boundary', False) or getattr(node, 'node_type', None) == 'flow_source'
                if not is_boundary and degree[nid] <= 1:
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
        
        # Build a fixed topology key that uniquely identifies the layout of nodes & edges,
        # along with their boundary modes to prevent cache shape mismatch when nodes toggle modes.
        self.topology_key = (
            tuple(self.node_ids),
            tuple((e['source'], e['target'], e.get('source_port'), e.get('target_port')) for e in self.edges_list),
            tuple(getattr(node, 'is_pressure_boundary', False) for node in self.nodes_list)
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

        # Precompute fast incidence lookup tables for residual mass balance evaluation O(N)
        self.node_incoming_edge_indices = {nid: [] for nid in self.node_ids}
        self.node_outgoing_edge_indices = {nid: [] for nid in self.node_ids}
        for j, edge in enumerate(self.edges_list):
            if edge['target'] in self.node_incoming_edge_indices:
                self.node_incoming_edge_indices[edge['target']].append(j)
            if edge['source'] in self.node_outgoing_edge_indices:
                self.node_outgoing_edge_indices[edge['source']].append(j)

    # ------------------------------------------------------------------
    # Pressure-control outer loop (F1-01, F1-37)
    #
    # Unknown per controller: v = ln(opening). Error per controller:
    #   f = sign * (sensed - set) [bar], rising with the opening for PRV (sensed downstream)
    #   and BPR (sensed upstream, sign = -1). Newton on f(v) = 0 with a finite-difference Jacobian,
    # so interacting controllers (PRV + BPR in series) are solved together, with end stops
    # (wide open / closed) handled as saturation and a closed PRV as lock-up.
    # ------------------------------------------------------------------
    CONTROL_TOL_BAR = 1e-4          # setpoint error accepted as "at setpoint"
    LOCKUP_FLOW_TOL = 1e-9          # m³/s (6e-5 L/min): below this a locked-up regulator carries no demand
    OPENING_MIN_PCT = 0.05          # end stops of the controller search (the valve itself can close further)
    OPENING_MAX_PCT = 100.0
    MAX_STEP_LN = math.log(10.0)    # trust region: opening changes by at most a factor 10 per iteration
    FD_STEP_LN = 0.03

    @staticmethod
    def _opening_for_dp(node, q, dp_target, density, viscosity) -> float:
        """Opening (%) at which the node drops dp_target at flow q (bisection; dp falls with opening)."""
        saved = node.opening_pct
        try:
            node.opening_pct = 100.0
            if node.calculate_delta_p(q, density, viscosity) >= dp_target:
                return 100.0
            lo, hi = 0.0, 100.0
            for _ in range(60):
                mid = 0.5 * (lo + hi)
                node.opening_pct = mid
                if node.calculate_delta_p(q, density, viscosity) > dp_target:
                    lo = mid
                else:
                    hi = mid
            return 0.5 * (lo + hi)
        finally:
            node.opening_pct = saved

    def _sensed_pressure(self, node) -> float:
        if isinstance(node, LinearRegulator):
            return node.inlets[0].pressure if node.backpressure else node.outlets[0].pressure
        sensed = node.outlets[0].pressure
        config = node.remote_sensing_config
        if config and config["node_id"] in self.network.nodes:
            remote_node = self.network.nodes[config["node_id"]]
            port_type = config["port_type"]
            port_idx = config["port_idx"]
            if port_type == "inlet" and port_idx < len(remote_node.inlets):
                sensed = remote_node.inlets[port_idx].pressure
            elif port_type == "outlet" and port_idx < len(remote_node.outlets):
                sensed = remote_node.outlets[port_idx].pressure
        node.sensed_pressure = sensed
        return sensed

    def _init_controller(self, idx):
        node = self.nodes_list[idx]
        node.opening_pct = 50.0
        node.locked_up = False
        return {
            "node": node,
            "sign": -1.0 if node.backpressure else 1.0,
            "state": "regulating",   # regulating | open | closed | lockup
            "done": False,
            "error_bar": 0.0,
            "o_min": self.OPENING_MIN_PCT,   # lowered when lock-up shows a demand that needs less opening
            "lockup_exits": 0,
        }

    def _controller_error(self, st) -> float:
        node = st["node"]
        return st["sign"] * (self._sensed_pressure(node) - node.set_pressure) / 100000.0

    MAX_LOCKUP_EXITS = 3            # guard against lock-up <-> regulating cycling

    def _classify_controller(self, st, f) -> str:
        """regulating / open (setpoint out of reach even wide open) / closed (still above setpoint when closed)."""
        o = st["node"].opening_pct
        if abs(f) < self.CONTROL_TOL_BAR:
            return "regulating"
        if f > 0 and o <= st["o_min"] * (1.0 + 1e-9):
            return "closed"
        if f < 0 and o >= self.OPENING_MAX_PCT - 1e-9:
            return "open"
        return "regulating"

    def _may_lock_up(self, st) -> bool:
        node = st["node"]
        return isinstance(node, LinearRegulator) and not node.backpressure \
            and st["lockup_exits"] < self.MAX_LOCKUP_EXITS

    def _control_step(self, controllers, evaluate, memo) -> Tuple[bool, bool]:
        """
        One outer control iteration, after a hydraulic solution exists at the current openings.
        Returns (converged, perturbed): converged = every controller at its setpoint or saturated;
        perturbed = extra solves were run (the stored hydraulic state no longer matches the openings).
        """
        tol = self.CONTROL_TOL_BAR
        changed_mode = False
        for st in controllers.values():
            node = st["node"]
            f = self._controller_error(st)
            st["error_bar"] = f
            if st["state"] == "lockup":
                inlet = node.inlets[0]
                q = inlet.flow_rate
                if q > self.LOCKUP_FLOW_TOL and inlet.pressure > node.set_pressure:
                    # Demand downstream: the regulator opens just enough to carry it at the setpoint.
                    # That opening may lie below the search end stop (tiny demand): lower the stop to it.
                    node.locked_up = False
                    o_new = self._opening_for_dp(node, q, inlet.pressure - node.set_pressure,
                                                 inlet.density, inlet.viscosity)
                    st["o_min"] = min(st["o_min"], max(o_new * 0.5, 1e-4))
                    node.opening_pct = max(o_new, st["o_min"])
                    st["lockup_exits"] += 1
                    st.update(state="regulating", done=False)
                    changed_mode = True
                elif q < -self.LOCKUP_FLOW_TOL:
                    # Pinned at its setpoint, the outlet takes flow back: something else holds the downstream
                    # side ABOVE this setpoint (e.g. a parallel PRV set higher). The regulator is simply closed.
                    node.locked_up = False
                    node.opening_pct = st["o_min"]
                    st["lockup_exits"] = self.MAX_LOCKUP_EXITS       # no re-entry: closed is the answer
                    st.update(state="closed", done=True)
                    changed_mode = True
                elif inlet.pressure <= node.set_pressure:
                    # Supply has fallen below the setpoint: the regulator cannot hold it closed
                    node.locked_up = False
                    node.opening_pct = self.OPENING_MAX_PCT
                    st["lockup_exits"] += 1
                    st.update(state="regulating", done=False)
                    changed_mode = True
                else:
                    st["done"] = True
                continue
            state = self._classify_controller(st, f)
            if state == "closed" and self._may_lock_up(st):
                node.locked_up = True       # closed PRV: hold the setpoint downstream, re-solve
                st.update(state="lockup", done=False)
                changed_mode = True
                continue
            st["state"] = state
            st["done"] = state != "regulating" or abs(f) < tol

        active = [st for st in controllers.values() if st["state"] == "regulating"]
        if not changed_mode and all(st["done"] for st in controllers.values()) and \
                all(abs(st["error_bar"]) < tol for st in active):
            return True, False
        if changed_mode or not active:
            memo.clear()
            return False, False

        F = np.array([st["error_bar"] for st in active])
        keys = tuple(id(st["node"]) for st in active)

        # Backtrack only when the last Newton step overshot: an error changed sign AND grew. An error that
        # grows with the same sign comes from the fluid properties still settling between iterations
        # (moving target); stepping back would walk away from the setpoint (seen in API 614).
        prev = memo.get("prev")
        if prev is not None and prev["keys"] == keys and prev["halvings"] < 5:
            overshoot = any(np.sign(F[k]) != np.sign(prev["F"][k]) and abs(F[k]) > abs(prev["F"][k]) + tol
                            for k in range(len(active)))
            if overshoot:
                prev["halvings"] += 1
                prev["step"] = 0.5 * prev["step"]
                for k, st in enumerate(active):
                    st["node"].opening_pct = float(np.clip(math.exp(prev["v"][k] + prev["step"][k]),
                                                           st["o_min"], self.OPENING_MAX_PCT))
                return False, False

        # Finite-difference Jacobian of f with respect to v = ln(opening), active controllers only
        n = len(active)
        v0 = np.array([math.log(max(st["node"].opening_pct, 1e-6)) for st in active])
        J = np.zeros((n, n))
        for k, sk in enumerate(active):
            o0 = sk["node"].opening_pct
            h = -self.FD_STEP_LN if o0 >= self.OPENING_MAX_PCT * 0.99 else self.FD_STEP_LN
            sk["node"].opening_pct = min(self.OPENING_MAX_PCT, o0 * math.exp(h))
            h_eff = math.log(sk["node"].opening_pct / o0)
            if evaluate() and abs(h_eff) > 1e-12:
                for i, si in enumerate(active):
                    J[i, k] = (self._controller_error(si) - F[i]) / h_eff
            sk["node"].opening_pct = o0

        # Controllers whose own opening does not move their error (no authority) walk towards the end
        # stop that their error asks for until it shows an effect or reaches saturation
        authority = [k for k in range(n) if J[k, k] > 1e-9]
        for k in range(n):
            if J[k, k] < -1e-9:
                # Opening it moves the sensed pressure the wrong way (e.g. downstream mode sensing a point
                # upstream of the valve): like a real wrong-acting loop it runs to an end stop; say why.
                active[k]["reverse_acting"] = True
        dv = np.array([0.0 if k in authority else -math.copysign(self.MAX_STEP_LN, F[k]) for k in range(n)])
        if authority:
            Ja = J[np.ix_(authority, authority)]
            dv_a = np.linalg.lstsq(Ja, -F[authority], rcond=1e-9)[0]
            dv[authority] = dv_a
        biggest = float(np.max(np.abs(dv))) if n else 0.0
        if biggest > self.MAX_STEP_LN:
            dv *= self.MAX_STEP_LN / biggest
        memo["prev"] = {"keys": keys, "F": F.copy(), "v": v0, "step": dv.copy(), "halvings": 0}
        for k, st in enumerate(active):
            st["node"].opening_pct = float(np.clip(math.exp(v0[k] + dv[k]),
                                                   st["o_min"], self.OPENING_MAX_PCT))
        return False, True

    def _controller_report(self, states) -> Tuple[bool, List[Dict[str, Any]]]:
        """Final classification against the hydraulic state that is reported."""
        saturated = []
        converged = True
        for st in states.values():
            node = st["node"]
            f = self._controller_error(st)
            st["error_bar"] = f
            # Classify against the solution that is reported (positions were restored to it)
            st["state"] = "lockup" if node.locked_up else self._classify_controller(st, f)
            if st["state"] == "closed" and self._may_lock_up(st):
                converged = False          # the loop stopped before lock-up could be applied
            if st["state"] in ("open", "closed", "lockup"):
                saturated.append({
                    "id": node.id, "name": node.name,
                    "state": {"open": "wide_open", "closed": "closed", "lockup": "lock_up"}[st["state"]],
                    "setpoint_bar": node.set_pressure / 100000.0,
                    "sensed_bar": self._sensed_pressure(node) / 100000.0,
                    "reverse_acting": bool(st.get("reverse_acting", False)),
                })
            elif abs(f) >= self.CONTROL_TOL_BAR:
                converged = False
        return converged, saturated

    def solve(self, method=None):
        self.prune_topology()
        start_time = time.perf_counter()
        max_outer_iterations = 100
        tolerance_temp = 0.1 # 0.1K target

        gs = getattr(self.network, 'global_settings', None)
        if gs:
            max_outer_iterations = getattr(gs, 'control_iterations', 100)
        damping_factor = getattr(gs, 'damping_factor', 0.25) if gs else 0.25  # thermal (TCV) loop only

        if method is None:
            method = getattr(gs, 'solver_method', 'sparse_newton') if gs else 'sparse_newton'
        if method == 'hybr':
            method = 'sparse_newton'

        island_error = self._island_error()
        if island_error:
            # F1-10: a circuit without any pressure reference has no defined pressure level
            return self._failure_stats(start_time, method, island_error)

        state = {
            "x": self._generate_initial_guess(), "sol": None, "num_int": 0, "inner": 0,
            "fallback": False, "residuals": None, "error": None,
        }

        def run_hydraulics(fatal=True, propagate=True) -> bool:
            """Hydraulic solve at the current control positions, then fluid property propagation."""
            try:
                res = self._solve_hydraulics_core(method=method, x0_custom=state["x"])
            except ValueError as e:
                if fatal:
                    state["error"] = str(e)
                    state["residuals"] = getattr(self, '_last_evaluated_residuals', None)
                return False
            sol, num_int, inner_iters, fallback, residuals = res
            state.update(sol=sol, num_int=num_int, residuals=residuals, x=sol)
            state["inner"] += inner_iters
            state["fallback"] = state["fallback"] or fallback
            if propagate:
                self._propagate_properties(sol[num_int:])
            return True

        controllers = {idx: self._init_controller(idx) for idx in self.control_node_indices}
        for idx in self.tcv_node_indices:
            self.nodes_list[idx].mix_ratio = 0.5

        outer_iterations = 0
        prev_temperatures = {}
        properties_converged = False
        controls_converged = not controllers
        tcv_settled = not self.tcv_node_indices
        memo = {}
        base_states = {}
        dirty = False

        for it in range(max_outer_iterations):
            outer_iterations += 1

            # Control positions this hydraulic solution belongs to (F1-02)
            base_states = {idx: (self.nodes_list[idx].opening_pct, self.nodes_list[idx].locked_up)
                           for idx in self.control_node_indices}
            for idx in self.tcv_node_indices:
                base_states[f"tcv_{idx}"] = self.nodes_list[idx].mix_ratio
            dirty = False

            if not run_hydraulics():
                break

            # Property change since the previous solution (taken before any finite-difference solves)
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

            # 1. Pressure controllers (Newton on the openings, F1-01)
            if controllers:
                controls_converged, dirty = self._control_step(controllers, lambda: run_hydraulics(fatal=False, propagate=False), memo)
            else:
                controls_converged = True

            # 2. 3-Way Thermal Control Valves
            # Physical Direction: The mix_ratio is tied STRICTLY to the user-selected HOT port.
            max_err_temp = 0.0
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
                    if t_hot_port >= t_cold_port:
                        # Standard case: Hot port is warmer than cold port
                        t_min = min(t_hot_port, t_cold_port)
                        t_max = max(t_hot_port, t_cold_port)
                        if node.set_temperature >= t_max:
                            # Target is hotter than or equal to both inlets, open hot port fully
                            target_mix = 1.0
                        elif node.set_temperature <= t_min:
                            # Target is colder than or equal to both inlets, open cold port fully
                            target_mix = 0.0
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
                            else:
                                target_mix = 0.5
                    else:
                        # Inversion case: Hot port is colder than cold port
                        # Sensed temperature below setpoint -> open hot port fully (mix_ratio -> 1.0)
                        # Sensed temperature above setpoint -> open cold port fully (mix_ratio -> 0.0)
                        target_mix = 1.0 if t_out < node.set_temperature else 0.0

                    target_mix = max(0.001, min(0.999, target_mix))
                    # Damped update for stability
                    node.mix_ratio = node.mix_ratio + damping_factor * (target_mix - node.mix_ratio)
                else:
                    # Fallback to incremental adjustment if temperatures are close or negative flow is active.
                    # Always direct action feedback: sensed temp below setpoint -> open hot port (increase mix_ratio).
                    direction = -1.0
                    adjustment = direction * 0.05 * t_err
                    node.mix_ratio = max(0.001, min(0.999, node.mix_ratio + adjustment))
                node.mix_ratio = max(0.001, min(0.999, node.mix_ratio))

            properties_converged = (max_temp_change < 0.05)

            if self.tcv_node_indices:
                max_mix_change = max(abs(self.nodes_list[idx].mix_ratio - base_states[f"tcv_{idx}"])
                                     for idx in self.tcv_node_indices)
                tcv_settled = (max_err_temp < tolerance_temp) or (it >= 2 and max_mix_change < 0.001)

            if controls_converged and tcv_settled and properties_converged:
                break

        saturated = []
        if state["error"] is None and state["sol"] is not None:
            # F1-02: report the hydraulic solution together with the control positions it was solved with;
            # the loop may have moved them afterwards (e.g. at its iteration limit).
            for idx in self.control_node_indices:
                node = self.nodes_list[idx]
                node.opening_pct, node.locked_up = base_states[idx]
            for idx in self.tcv_node_indices:
                self.nodes_list[idx].mix_ratio = base_states[f"tcv_{idx}"]
            if dirty:
                run_hydraulics()    # finite-difference solves overwrote the stored state

            # F1-15: with the control positions frozen, iterate the fluid properties until the reported
            # pressures belong to the reported temperatures (the loop may have stopped at its limit)
            if state["error"] is None and not properties_converged:
                for _ in range(20):
                    before = {(nid, k, i): p.temperature for nid, n in self.network.nodes.items()
                              for k, ports in (("in", n.inlets), ("out", n.outlets)) for i, p in enumerate(ports)}
                    if not run_hydraulics(fatal=False):
                        break
                    change = max((abs(p.temperature - before[(nid, k, i)]) for nid, n in self.network.nodes.items()
                                  for k, ports in (("in", n.inlets), ("out", n.outlets)) for i, p in enumerate(ports)), default=0.0)
                    if change < 0.05:
                        properties_converged = True
                        break

            num_int = len(self.internal_node_indices)
            sol = state["sol"]
            self._update_telemetry(sol[:num_int], sol[num_int:])
            if controllers:
                controls_converged, saturated = self._controller_report(controllers)
                for st in controllers.values():
                    if st["state"] == "lockup":
                        st["node"].opening_pct = 0.0    # closed tight; the solver pinned its outlet at the setpoint

        final_sol_x = state["sol"]
        last_residuals = state["residuals"]
        self._store_warm_start(final_sol_x if state["error"] is None else None)
        solve_error = state["error"]
        bottleneck = self._identify_bottleneck(last_residuals) if last_residuals is not None else None
        max_hydraulic_residual = float(np.max(np.abs(last_residuals))) if (last_residuals is not None and len(last_residuals) > 0) else 0.0
        stats = {
            "success": solve_error is None,
            "error": solve_error,
            "time_ms": (time.perf_counter() - start_time) * 1000,
            "outer_iterations": outer_iterations,
            "total_inner_iterations": state["inner"],
            "property_iterations": self.last_prop_iters,
            "fallback_used": state["fallback"],
            "solver_method": method,
            "warm_start_status": self.warm_start_status,
            "max_residual": max_hydraulic_residual,
            "system_size": len(self.internal_node_indices) + len(self.edges_list),
            "num_nodes": len(self.internal_node_indices),
            "num_edges": len(self.edges_list),
            "bottleneck": bottleneck,
            "controls_converged": bool(controls_converged),
            "saturated_controllers": saturated,
            "properties_converged": bool(properties_converged),
            "physical_validity": self._physical_validity() if solve_error is None and final_sol_x is not None else {"valid": True, "issues": []},
        }
        return stats

    def _store_warm_start(self, x) -> None:
        """Remember the final state of a solve as the next start (F1-14: never intermediate control iterations)."""
        gs = getattr(self.network, 'global_settings', None)
        if x is None or not self.persist_warm_start or not (getattr(gs, 'warm_start', True) if gs else True):
            return
        with NetworkSolver._warm_start_lock:
            if len(NetworkSolver._warm_start_cache) >= NetworkSolver._MAX_WARM_START_ENTRIES:
                NetworkSolver._warm_start_cache.pop(next(iter(NetworkSolver._warm_start_cache)))
            NetworkSolver._warm_start_cache[(self.topology_key, self.active_case_id)] = np.array(x, copy=True)

    def _failure_stats(self, start_time, method, message) -> Dict[str, Any]:
        return {
            "success": False,
            "error": message,
            "error_kind": "no_pressure_reference",   # a model problem the user can fix, shown as an error
            "time_ms": (time.perf_counter() - start_time) * 1000,
            "outer_iterations": 0,
            "total_inner_iterations": 0,
            "property_iterations": 0,
            "fallback_used": False,
            "solver_method": method,
            "warm_start_status": self.warm_start_status,
            "max_residual": 0.0,
            "system_size": 0,
            "num_nodes": 0,
            "num_edges": 0,
            "bottleneck": None,
            "controls_converged": False,
            "saturated_controllers": [],
            "properties_converged": False,
            "physical_validity": {"valid": True, "issues": []},
        }

    def _island_error(self):
        """F1-10: message for connected circuits that contain no tank, pressure source or flow source."""
        if not getattr(self, 'island_groups', None):
            return None
        names = []
        for group in self.island_groups[:3]:
            shown = [self.network.nodes[nid].name for nid in group[:4]]
            names.append(", ".join(shown) + (" …" if len(group) > 4 else ""))
        return ("No pressure reference: the circuit with " + "; and the circuit with ".join(names) +
                " has no tank, pressure source or flow source, so its pressure level is undefined. "
                "Connect it to a tank or source.")

    def _physical_validity(self) -> Dict[str, Any]:
        """F1-07: ports at negative absolute pressure or below vapour pressure are not a physical result."""
        gs = getattr(self.network, 'global_settings', None)
        fluid = getattr(gs, 'fluid_type', 'water') if gs else 'water'
        issues = []
        for nid in sorted(self.active_node_ids):
            node = self.network.nodes[nid]
            if isinstance(node, Pipe):
                continue
            for kind, ports in (("inlet", node.inlets), ("outlet", node.outlets)):
                for i, port in enumerate(ports):
                    p = port.pressure
                    if p < 0.0:
                        reason = "negative_absolute_pressure"
                    else:
                        try:
                            pv = FluidProperties.get_vapor_pressure(fluid, port.temperature)
                        except Exception:
                            pv = 0.0
                        if pv > 0.0 and p < pv:
                            reason = "below_vapor_pressure"
                        elif pv <= 0.0 and p < 10000.0 and port.flow_rate > 0.0:
                            reason = "near_vacuum"   # oils: vapour pressure negligible, flag below 0.1 bar(a)
                        else:
                            continue
                    issues.append({"node_id": node.id, "node": node.name, "port": f"{kind}-{i}",
                                   "pressure_bara": p / 100000.0, "reason": reason})
        return {"valid": not issues, "issues": issues}

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
            # Check warm-start cache first (copy under the lock: other solves may write concurrently)
            cache_key = (self.topology_key, self.active_case_id)
            with NetworkSolver._warm_start_lock:
                exact = NetworkSolver._warm_start_cache.get(cache_key)
                if exact is not None:
                    self.warm_start_status = "Exact Hit"
                    return exact.copy()
                # Fallback: reuse any cached solution with matching topology
                for (tok, cid), cached_val in list(NetworkSolver._warm_start_cache.items()):
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

        # 1. Mass Balance Rows (a < num_internal)
        for a, node_idx in enumerate(self.internal_node_indices):
            node_id = self.node_ids[node_idx]
            node = self.nodes_list[node_idx]
            
            # If a flow source is present, its derivative with respect to its own pressure is 1.0,
            # and 0 for everything else since its reference pressure is fixed to atmospheric.
            if getattr(node, 'node_type', None) == 'flow_source':
                rows.append(a)
                cols.append(a)
                data.append(1.0)
                continue

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
                # Complementarity rows (check valves, closed relief devices): the node itself decides which
                # branch of its model applies at the current state, so differentiate exactly that function
                # numerically instead of an analytic form that can describe a different branch (F1-12).
                pipe = edge['pipe']
                pipe_density = pipe.inlets[0].density
                pipe_viscosity = pipe.inlets[0].viscosity
                inlet = src_node.inlets[0] if src_node.inlets else None
                density = inlet.density if inlet else 1000.0
                viscosity = inlet.viscosity if inlet else 0.001

                tgt_node_obj = self.network.nodes[tgt_id]
                tcv_port = self._parse_port_idx(edge.get('target_port', 'inlet-0')) if isinstance(tgt_node_obj, ThreeWayTCV) else None

                def row_residual(p_src, p_tgt, q):
                    # Same function as the objective's row for this edge
                    dp_pipe_ = pipe.calculate_delta_p(q, pipe_density, pipe_viscosity)
                    dp_node_ = src_node.calculate_delta_p(q, density, viscosity, p_in_pa=p_src,
                                                          p_out_pa=p_tgt + dp_pipe_, update_state=False)
                    dp_tcv_ = 0.0
                    if tcv_port is not None:
                        port = tgt_node_obj.inlets[tcv_port]
                        dp_tcv_ = tgt_node_obj.calculate_path_dp(q, port.density, tcv_port, port.viscosity)
                    return ((p_src - dp_node_) - p_tgt - dp_pipe_ - dp_tcv_) / p_scale

                p_src0, p_tgt0, q0 = p_in_all[src_idx], p_in_all[tgt_idx], q_edges[j]
                h_p, h_q = 1.0, 1e-9
                if src_internal_idx != -1:
                    rows.append(a_row)
                    cols.append(src_internal_idx)
                    data.append((row_residual(p_src0 + h_p, p_tgt0, q0) - row_residual(p_src0 - h_p, p_tgt0, q0)) / (2 * h_p) * p_scale)
                if tgt_internal_idx != -1:
                    rows.append(a_row)
                    cols.append(tgt_internal_idx)
                    data.append((row_residual(p_src0, p_tgt0 + h_p, q0) - row_residual(p_src0, p_tgt0 - h_p, q0)) / (2 * h_p) * p_scale)
                rows.append(a_row)
                cols.append(num_internal + j)
                data.append((row_residual(p_src0, p_tgt0, q0 + h_q) - row_residual(p_src0, p_tgt0, q0 - h_q)) / (2 * h_q) * q_scale)
            else:
                src_locked = getattr(src_node, 'locked_up', False)
                if src_internal_idx != -1 and not src_locked:
                    rows.append(a_row)
                    cols.append(src_internal_idx)
                    data.append(1.0)

                if tgt_internal_idx != -1:
                    rows.append(a_row)
                    cols.append(tgt_internal_idx)
                    data.append(-1.0)

                # Term 1: d(P_src_out)/dq_j
                if not src_locked and not isinstance(src_node, ThreeWayTCV) and hasattr(src_node, 'calculate_delta_p'):
                    inlet = src_node.inlets[0] if src_node.inlets else None
                    density = inlet.density if inlet else 1000.0
                    viscosity = inlet.viscosity if inlet else 0.001
                    
                    dp_deriv_src = src_node.calculate_dp_derivative(q_edges[j], density, viscosity)
                    is_pump = isinstance(src_node, (CentrifugalPump, VolumetricPump))
                    sign = 1.0 if is_pump else -1.0
                    dp_deriv_src_signed = sign * dp_deriv_src
                    
                    rows.append(a_row)
                    cols.append(num_internal + j)
                    data.append((q_scale / p_scale) * dp_deriv_src_signed)

                # Term 2: d(dp_pipe)/dq_j
                pipe = edge['pipe']
                pipe_inlet = pipe.inlets[0]
                pipe_density = pipe_inlet.density
                pipe_viscosity = pipe_inlet.viscosity
                dp_deriv_pipe = max(1e-3, pipe.calculate_dp_derivative(q_edges[j], pipe_density, pipe_viscosity))
                
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

    def _solve_sparse_newton(self, objective, x0, tol=1e-6, max_iter=100, step_tol=None):
        """
        Custom high-performance sparse Newton-Raphson solver using backtracking line search.

        Converged means the residual is below `tol` AND the next Newton step moves no flow by more than `step_tol`
        (scaled units, L/s). The step test is what keeps low-loss sections honest (F1-06): a 10 Pa
        residual alone is satisfied by 150 L/min in a DN200 line between equal tank levels.
        """
        import scipy.sparse.linalg as spla

        class SolResult:
            def __init__(self, success, message, x, nfev, njev):
                self.success = success
                self.message = message
                self.x = x
                self.nfev = nfev
                self.njev = njev

        if step_tol is None:
            step_tol = tol

        x = x0.copy()
        r = objective(x)
        err = np.max(np.abs(r))

        nfev = 1
        njev = 0
        # Iterations allowed for the flow-step test once the residual is within tolerance. The shipped
        # examples need 0-2; the cap stops a step that never settles (near-singular flow direction)
        # from running to max_iter.
        STEP_TEST_BUDGET = 50
        within_tol_since = None

        for it in range(max_iter):
            J = self.calculate_jacobian(x)
            njev += 1

            try:
                # Solve linear system J * dx = -r
                dx = spla.spsolve(J, -r)
            except Exception as e:
                return SolResult(False, f"Linear system solver failed: {e}", x, nfev, njev)

            # Only flow steps count: a floating (unconstrained) node pressure can show large steps from rounding noise
            n_p = len(self.internal_node_indices)
            if err < tol and (len(dx) == n_p or np.max(np.abs(dx[n_p:])) < step_tol):
                return SolResult(True, "Converged", x, nfev, njev)
            if err < tol:
                within_tol_since = it if within_tol_since is None else within_tol_since
                if it - within_tol_since >= STEP_TEST_BUDGET:
                    return SolResult(True, "Converged (residual; flow step did not settle)", x, nfev, njev)
            else:
                within_tol_since = None

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
                # Residual can no longer be reduced (noise floor): accept only if it already meets the tolerance
                if err < tol:
                    return SolResult(True, "Converged (residual at noise floor)", x, nfev, njev)
                return SolResult(False, "Backtracking line search failed to decrease residual", x, nfev, njev)

        if err < tol:
            return SolResult(True, "Converged (iteration limit, residual within tolerance)", x, nfev, njev)
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
                node = self.nodes_list[node_idx]
                
                # If a flow source is present, bypass mass balance and pin its reference pressure
                # to the ambient/atmospheric pressure instead.
                if getattr(node, 'node_type', None) == 'flow_source':
                    atm_p = 101325.0
                    if self.network.global_settings:
                        atm_p = getattr(self.network.global_settings, 'atmospheric_pressure', 101325.0)
                    residuals.append((p_in_internal[i] - atm_p) / p_scale)
                    continue

                q_in = sum(q_edges[j] for j in self.node_incoming_edge_indices.get(node_id, []))
                q_out = sum(q_edges[j] for j in self.node_outgoing_edge_indices.get(node_id, []))
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
                elif getattr(src_node, 'locked_up', False):
                    p_src_out = src_node.set_pressure   # F1-37: closed regulator holds its setpoint downstream
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
                    p_src_out = self._get_node_p_out(src_node, p_in_all[src_idx], q_edges[j], q_edges[j])
                
                if isinstance(self.network.nodes[tgt_id], ThreeWayTCV):
                    tgt_node = self.network.nodes[tgt_id]
                    port_idx = self._parse_port_idx(edge.get('target_port', 'inlet-0'))
                    dp_tcv = tgt_node.calculate_path_dp(q_edges[j], tgt_node.inlets[port_idx].density, port_idx, tgt_node.inlets[port_idx].viscosity)
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

        # F1-06: honour the user tolerance (scaled units: 1e-6 = 0.1 Pa); no 10 Pa floor
        residual_tolerance = max(1e-8, tol)

        def run_newton(x_init):
            return self._solve_sparse_newton(objective, x_init, tol=residual_tolerance, max_iter=inner_max_steps,
                                             step_tol=max(1e-9, tol))

        def run_lm(x_init):
            return root(objective, x_init, method='lm', jac=dense_jacobian, tol=residual_tolerance,
                        options={'maxiter': inner_max_steps, 'xtol': 1e-12, 'ftol': 1e-12})

        def is_converged_solution(candidate):
            return bool(candidate.success and np.max(np.abs(objective(candidate.x))) <= residual_tolerance)

        # F1-11: whichever method is chosen, the other one is the fallback, and both are held to the same
        # tests: converged to the residual tolerance AND physical (no port below -1 bar(a), no reverse pump flow)
        primary, secondary = (run_newton, run_lm) if method == 'sparse_newton' else (run_lm, run_newton)
        sol = primary(x0)
        best = sol if is_converged_solution(sol) else None
        if best is None or not is_physical(best.x):
            fallback_used = True
            attempts = [secondary(x0)]
            if best is None and primary is run_newton:
                attempts.append(run_lm(sol.x))      # LM polishes a nearly converged Newton state
            for alt in attempts:
                if is_converged_solution(alt) and (best is None or (is_physical(alt.x) and not is_physical(best.x))):
                    best = alt
                    if is_physical(alt.x):
                        break
            if best is not None:
                sol = best

        final_residuals = objective(sol.x)
        self._last_evaluated_residuals = final_residuals
        max_res = np.max(np.abs(final_residuals))

        is_converged = bool(best is not None and sol is best and max_res <= residual_tolerance)
        
        if is_converged:
            final_p = sol.x[:num_internal] * p_scale
            final_q = sol.x[num_internal:] * q_scale
            self._update_telemetry(final_p, final_q)
            
            converged_x = np.concatenate([final_p, final_q])
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
        port = node.inlets[0] if node.inlets else (node.outlets[0] if node.outlets else None)
        density = port.density if port else 1000.0
        viscosity = port.viscosity if port else 0.001
        
        q_flow = q_out if getattr(node, 'node_type', '') == 'flow_source' else q_in
        
        if getattr(node, 'locked_up', False):
            return node.set_pressure
        if isinstance(node, LinearRegulator) and not node.backpressure and                 self.node_to_key.get(id(node)) in self.pruned_node_ids:
            # F1-37: a regulator without any flow path (dead end) is locked up, not wide open
            return min(p_in, node.set_pressure)
        if isinstance(node, (CentrifugalPump, VolumetricPump)):
            return p_in + node.calculate_delta_p(q_flow, density, viscosity)
        elif hasattr(node, 'calculate_delta_p'):
            if self._use_mcp_for_node(node):
                p_out_est = p_in
                node_key = self.node_to_key.get(id(node), node.id)
                for edge in self.all_edges_list:
                    if edge['source'] == node_key:
                        tgt_id = edge['target']
                        tgt_idx = self.all_node_id_to_idx[tgt_id]
                        tgt_node = self.network.nodes[tgt_id]
                        p_out_est = tgt_node.inlets[0].pressure + edge['pipe'].calculate_delta_p(q_flow, density, viscosity)
                        break
                return p_in - node.calculate_delta_p(q_flow, density, viscosity, p_in_pa=p_in, p_out_pa=p_out_est, update_state=update_state)
            
            if hasattr(node, 'node_type') and node.node_type in ['pressure_safety_valve', 'rupture_disc']:
                return p_in - node.calculate_delta_p(q_flow, density, viscosity, p_in_pa=p_in, update_state=update_state)
            return p_in - node.calculate_delta_p(q_flow, density, viscosity)
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

RELIEF_NODE_TYPES = ('pressure_safety_valve', 'rupture_disc')
RELIEF_RAMP_MAX_SOLVES = 24     # bisection steps per opening (λ resolution 2⁻²⁴)
RELIEF_RAMP_TOL_PA = 100.0      # 1 mbar: inlet pressure at the opening snapshot vs set pressure
RELIEF_RAMP_TOL_LAM = 1e-4


def _relief_set_pressure_bar(node) -> float:
    if hasattr(node, 'set_pressure_bar'):
        return float(node.set_pressure_bar)
    if hasattr(node, 'burst_pressure_bar'):
        return float(node.burst_pressure_bar)
    return 0.0


def _telemetry_max_pressure_bara(tel) -> float:
    """Maximum pressure (bar(a)) over all node and edge ports of a telemetry dict."""
    max_pa = 0.0
    for group in ("nodes", "edges"):
        for item in (tel or {}).get(group, {}).values():
            for p in item.get("inlets", []) + item.get("outlets", []):
                p_val = p.get("pressure")
                if isinstance(p_val, (int, float)) and p_val > max_pa:
                    max_pa = p_val
    return max_pa / 100000.0 if max_pa > 0 else 1.01325


def _inlet_pressure_bara(tel, node_id):
    inlets = (tel or {}).get("nodes", {}).get(node_id, {}).get("inlets") or []
    p = inlets[0].get("pressure") if inlets else None
    return round(p / 100000.0, 3) if isinstance(p, (int, float)) else None


def _find_relief_openings(network, opening_groups, auto_ids, original_states, extract_telemetry_fn):
    """
    F1-08: steady state at the moment each relief device opens.

    The case's relief drivers (is_relief_driver and relief_ramp_enabled: pumps, sources) are
    scaled with a ramp factor λ from 0 to their case value (λ = 1). For each group of devices
    that opened in the sequential relief passes (lowest set pressure first), λ is bisected until
    the group's highest margin P_inlet − P_set is zero: the devices that opened before are free
    to relieve, the group and every later auto device are held closed. Each snapshot is a
    converged steady-state solution (no time integration).

    Runs on a copy of the network, so the reported relieved state and the warm-start cache stay
    untouched. Returns (openings, error); openings lists one dict per group in opening order.
    """
    net = copy.deepcopy(network)
    drivers = [n for n in net.nodes.values()
               if getattr(n, 'is_relief_driver', False) and getattr(n, 'relief_ramp_enabled', True)]
    if not drivers:
        return [], "No ramped driver: enable 'Ramp during relief analysis' on a pump or source."

    ramp_solver = NetworkSolver(net)
    ramp_solver.persist_warm_start = False
    openings = []
    try:
        for g_idx, group_ids in enumerate(opening_groups):
            earlier = {k for grp in opening_groups[:g_idx] for k in grp}
            for k in auto_ids:
                net.nodes[k].forced_state = "auto" if k in earlier else "forced_closed"
            group_nodes = [(k, net.nodes[k]) for k in group_ids]

            best = None   # (|margin|, λ, telemetry)

            def margin_at(lam):
                for d in drivers:
                    d.apply_relief_ramp(lam)
                for k in auto_ids:
                    net.nodes[k].reset_run_state()
                stats = ramp_solver.solve()
                if not stats.get("success"):
                    return None, None
                margin = max(node.inlets[0].pressure - _relief_set_pressure_bar(node) * 100000.0
                             for _, node in group_nodes)
                return margin, extract_telemetry_fn(net)

            # The group breached its set pressure at λ = 1 (that is why it opened); below its
            # set pressure at λ = 0 (drivers at rest).
            lo, hi = 0.0, 1.0
            for _ in range(RELIEF_RAMP_MAX_SOLVES):
                lam = 0.5 * (lo + hi)
                margin, tel = margin_at(lam)
                if margin is None:
                    return openings, f"Relief ramp did not converge at {lam * 100:.1f} % driver load."
                if best is None or abs(margin) < best[0]:
                    best = (abs(margin), lam, tel)
                if margin >= 0.0:
                    hi = lam
                else:
                    lo = lam
                if abs(margin) < RELIEF_RAMP_TOL_PA or hi - lo < RELIEF_RAMP_TOL_LAM:
                    break

            _, lam, tel = best
            # The snapshot holds the auto devices closed by the method, not by the user
            for k in auto_ids:
                if k in tel.get("nodes", {}):
                    tel["nodes"][k]["forced_state"] = original_states[k]
            openings.append({
                "device_ids": list(group_ids),
                "ramp": lam,
                "telemetry": tel,
                "max_pressure_bara": _telemetry_max_pressure_bara(tel),
            })
    finally:
        for d in drivers:
            d.reset_relief_ramp()
    return openings, None


def run_sequential_relief_simulation(network, solver, extract_telemetry_fn):
    """
    Executes sequential multi-pass relief valve popping physics.
    Pass 1: Lock all relief valves forced_closed to calculate unmitigated baseline.
    Passes 2+: Sequentially unlock relief devices starting with the lowest setpoint first.
             Only unlock higher setpoint devices if lower setpoint devices fail to suppress overpressure.
    Then the opening of each device is located on a ramp of the relief drivers (F1-08).

    Returns (stats, telemetry_mitigated, telemetry_unmitigated, has_psv, telemetry_peak);
    telemetry_peak is None when the peak is the relieved state itself or is unavailable.
    """
    psv_items = [(k, node) for k, node in network.nodes.items() if getattr(node, 'node_type', '') in RELIEF_NODE_TYPES]
    psv_nodes = [node for _, node in psv_items]
    has_psv = len(psv_nodes) > 0

    if not psv_nodes:
        stats = solver.solve()
        telemetry = extract_telemetry_fn(network)
        return stats, telemetry, telemetry, False, None

    key_of = {id(node): k for k, node in psv_items}
    # Save original forced_state configured by user
    original_states = {k: node.forced_state for k, node in psv_items}

    # Pass 1: Unmitigated (All relief nodes forced closed to establish overpressure baseline)
    for node in psv_nodes:
        node.forced_state = "forced_closed"
        node.reset_run_state()

    first_stats = solver.solve()
    first_warm_start_status = first_stats.get("warm_start_status")   # F0-06: report the user's run, not the last pass
    telemetry_unmitigated = extract_telemetry_fn(network)

    # Initialize sequential states for Mitigated passes
    auto_psv_nodes = [node for node in psv_nodes if original_states[key_of[id(node)]] == "auto"]

    for node in auto_psv_nodes:
        node.forced_state = "forced_closed"
        node.reset_run_state()

    stats = None
    max_passes = len(auto_psv_nodes) + 1
    opening_groups = []   # device ids unlocked per pass, in opening order

    for pass_idx in range(max_passes):
        # 1. Solve current state
        stats = solver.solve()

        # 2. Check inlet pressures of closed auto relief nodes
        breached_nodes = []
        for node in auto_psv_nodes:
            if node.forced_state == "forced_closed":
                p_in_bar = (node.inlets[0].pressure / 100000.0) if node.inlets else 0.0
                set_p = _relief_set_pressure_bar(node)
                if p_in_bar >= set_p:
                    breached_nodes.append((set_p, node))

        # 3. If no closed relief devices breached set pressure, steady-state equilibrium achieved!
        if not breached_nodes:
            break

        # 4. Find lowest set pressure among breached closed devices
        min_set_p = min(item[0] for item in breached_nodes)

        # 5. Unlock all breached closed devices sharing this minimum set pressure
        group = []
        for set_p, node in breached_nodes:
            if abs(set_p - min_set_p) < 1e-4:
                node.forced_state = "auto"
                node.reset_run_state()
                group.append(key_of[id(node)])

        if not group:
            break
        opening_groups.append(group)

    telemetry_mitigated = extract_telemetry_fn(network)
    if stats is not None and first_warm_start_status is not None:
        stats["warm_start_status"] = first_warm_start_status

    # =========================================================================
    # RELIEF CONTINGENCY PRESSURE METRICS (ALL IN BARA / BAR ABSOLUTE)
    # -------------------------------------------------------------------------
    # 1. Relieved: steady-state max pressure with the relief devices in their final state.
    # 2. Peak: highest max pressure over the opening snapshots (each device exactly at its
    #    set pressure, found on the driver ramp) and the relieved state (F1-08).
    # 3. Unmitigated: steady-state max pressure with ALL relief devices held closed.
    # =========================================================================
    relieved_pressure_bara = _telemetry_max_pressure_bara(telemetry_mitigated)
    unmitigated_peak_pressure_bara = _telemetry_max_pressure_bara(telemetry_unmitigated)

    auto_ids = [key_of[id(node)] for node in auto_psv_nodes]
    openings, ramp_error = ([], None)
    if opening_groups and stats is not None and stats.get("success"):
        openings, ramp_error = _find_relief_openings(network, opening_groups, auto_ids, original_states, extract_telemetry_fn)

    peak = {"available": True, "reason": None, "pressure_bara": round(relieved_pressure_bara, 2),
            "source": "relieved", "device_ids": [], "ramp_pct": None}
    telemetry_peak = None
    if ramp_error:
        peak.update(available=False, reason=ramp_error, pressure_bara=None)
    else:
        for op in openings:
            if op["max_pressure_bara"] > relieved_pressure_bara and \
                    (peak["source"] == "relieved" or op["max_pressure_bara"] > peak["pressure_bara"]):
                peak.update(pressure_bara=round(op["max_pressure_bara"], 2), source="opening",
                            device_ids=op["device_ids"], ramp_pct=round(op["ramp"] * 100.0, 1))
                telemetry_peak = op["telemetry"]

    # Per-device results for the Relief Analysis Matrix
    opening_by_id = {}
    for order, op in enumerate(openings, start=1):
        for k in op["device_ids"]:
            opening_by_id[k] = (order, op)
    devices = {}
    for k, node in psv_items:
        node_tel = telemetry_mitigated.get("nodes", {}).get(k, {})
        outlets = node_tel.get("outlets") or []
        flow = outlets[0].get("flow_rate", 0.0) if outlets else 0.0
        order, op = opening_by_id.get(k, (None, None))
        devices[k] = {
            "set_pressure_bar": _relief_set_pressure_bar(node),
            "forced_state": original_states[k],
            "status": node_tel.get("status"),
            "opening_order": order,
            "opening_ramp_pct": round(op["ramp"] * 100.0, 1) if op else None,
            "inlet_at_opening_bara": _inlet_pressure_bara(op["telemetry"], k) if op else None,
            "inlet_relieved_bara": _inlet_pressure_bara(telemetry_mitigated, k),
            "inlet_unmitigated_bara": _inlet_pressure_bara(telemetry_unmitigated, k),
            "relief_flow_lmin": round(abs(flow) * 60000.0, 2),
        }
    telemetry_mitigated["relief"] = {"peak": peak, "devices": devices}

    for tel in (telemetry_mitigated, telemetry_unmitigated):
        if "kpis" not in tel or not isinstance(tel["kpis"], dict):
            tel["kpis"] = {}
        tel["kpis"]["relieved_pressure_bara"] = round(relieved_pressure_bara, 2)
        tel["kpis"]["peak_pressure_bara"] = peak["pressure_bara"]
        tel["kpis"]["unmitigated_peak_pressure_bara"] = round(unmitigated_peak_pressure_bara, 2)
    telemetry_mitigated["kpis"]["max_pressure_bar"] = round(relieved_pressure_bara, 2)
    telemetry_unmitigated["kpis"]["max_pressure_bar"] = round(unmitigated_peak_pressure_bara, 2)

    return stats, telemetry_mitigated, telemetry_unmitigated, has_psv, telemetry_peak
