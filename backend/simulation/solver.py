import copy
from collections import defaultdict, deque
import heapq
import itertools
import numpy as np
import math
import threading
import time
from scipy.optimize import root
import scipy.sparse as sp
import scipy.sparse.linalg as spla
from typing import List, Dict, Any, Tuple

from simulation.schemas import HydraulicNetwork
from simulation.equipment.base_node import HydraulicNode, Q_DEAD_LEG, Q_STAGNANT, select_inward
from simulation.equipment.tank import Tank
from simulation.equipment.flow_boundary import FlowBoundary
from simulation.equipment.pipe import Pipe
from simulation.equipment.component_link import ComponentLink, BoundaryLink, canvas_id
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
from simulation.limits import check_deadline
from simulation.equipment.relief_device import is_closed_relief


def is_stopped_blocking(node) -> bool:
    """A stopped pump that blocks flow (PD pump): removed from the solve, no pressure passes through it."""
    return not getattr(node, 'active', True) and getattr(node, 'blocks_flow_on_shutdown', False)


def blocks_at_rest(node) -> bool:
    return is_closed_relief(node) or is_stopped_blocking(node)


class ComponentRangeError(ValueError):
    """A component's equations cannot be evaluated at the trial state (e.g. the root of a negative number).
    `component` is the canvas component: {"type": "Node"|"Connection", "id", "name"}."""
    def __init__(self, component, cause):
        super().__init__(f"{component['name']}: {type(cause).__name__}: {cause}")
        self.component = component


class SolveNotConvergedError(ValueError):
    """The hydraulic solve ended above the residual tolerance; its final residuals locate the largest imbalance."""


def is_pressure_reference(node) -> bool:
    """A node that fixes the pressure (or the flow) of the circuit it sits in (topology pruning)."""
    return getattr(node, 'is_pressure_boundary', False) or getattr(node, 'node_type', None) == 'flow_boundary'

class NetworkSolver:
    """
    Final Network Solver with Live Diagnostics, Analytical Sparse Jacobian,
    Sparse Newton-Raphson Solver, and Warm-Start caching.
    """
    # Class-level cache: (topology_key, active_case_id) -> np.ndarray (converged state vector)
    _warm_start_cache: Dict[Tuple, np.ndarray] = {}
    _MAX_WARM_START_ENTRIES: int = 128
    # Solves run in worker threads (asyncio.to_thread); every cache access goes through this lock
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
        self.properties_frozen = False   # the final solve and its telemetry keep the converged properties
        self.held_closed_ids = set()   # auto relief devices the relief passes hold closed (leakage does not lift them)
        self.active_case_id = getattr(network, 'active_case_id', None) or 'default'
        self.warm_start_status = "Cold Start"
        self.persist_warm_start = True   # False for auxiliary solves (relief ramp) that must not overwrite the cache
        self._weights = None             # (w, f) of _edge_weights for the current solve

        self._edge_ports = self._side_links = None   # _build_port_table, on first use
        # Initial topology pruning
        self.prune_topology()

    def _build_port_table(self):
        """The ports at both ends of every edge and the links between node sides, built once: the topology is fixed
        for the solver's lifetime. The stagnant pressure groups, the property passes, the mixing solve and the
        dead-leg temperature fill all read it, so a port rule is written in one place. Built on the first solve, not
        in __init__: a solver is built on every graph edit, and an edge to a missing port fails only when run."""
        nodes = self.network.nodes
        edge_ports = {}                 # id(edge) -> (source node, source port, target node, target port)
        side_links = defaultdict(list)  # side -> [(port of this side on the edge, side at the other end)]
        for edge in self.all_edges_list:
            src, tgt = edge['source'], edge['target']
            src_port, tgt_port = self._src_port(edge, nodes[src]), self._tgt_port(edge, nodes[tgt])
            edge_ports[id(edge)] = (nodes[src], src_port, nodes[tgt], tgt_port)
            side_links[(src, 'out')].append((src_port, (tgt, 'in')))
            side_links[(tgt, 'in')].append((tgt_port, (src, 'out')))
        self._edge_ports, self._side_links = edge_ports, dict(side_links)

    @property
    def edge_ports(self):
        if self._edge_ports is None:
            self._build_port_table()
        return self._edge_ports

    @property
    def side_links(self):
        if self._side_links is None:
            self._build_port_table()
        return self._side_links

    def _upstream_end(self, edge, q):
        """For flow q on the edge: (upstream node, its port, downstream node, pipe's upstream end, pipe's downstream end)."""
        src, src_port, tgt, tgt_port = self.edge_ports[id(edge)]
        pipe = edge['pipe']
        if q >= 0:
            return src, src_port, tgt, pipe.inlets[0], pipe.outlets[0]
        return tgt, tgt_port, src, pipe.outlets[0], pipe.inlets[0]

    def prune_topology(self):
        # 1. Identify inactive nodes
        inactive_node_ids = set()
        for node_id, node in self.network.nodes.items():
            is_inactive_pump = is_stopped_blocking(node)
            # Only forced-closed relief devices are removed; one closed in 'auto' stays in the solve as q = 0
            is_forced_closed = (getattr(node, 'forced_state', '') == 'forced_closed' and getattr(node, 'node_type', '') in RELIEF_NODE_TYPES)
            if is_inactive_pump or is_forced_closed:
                inactive_node_ids.add(node_id)
                
        # 2. Prune connected edges
        active_edges = []
        for edge in self.all_edges_list:
            if edge['source'] not in inactive_node_ids and edge['target'] not in inactive_node_ids:
                active_edges.append(edge)
                
        # Connected circuits (counting edges through inactive nodes) that contain no pressure reference
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
            has_reference = any(is_pressure_reference(self.network.nodes[n]) for n in group)
            # The hidden port nodes of an in-line component count as the component (an unwired one is one node)
            canvas_ids = sorted({canvas_id(n) for n in group})
            if len(canvas_ids) >= 2 and not has_reference:
                self.island_groups.append(canvas_ids)

        # 3. Reachability Analysis (undirected DFS from pressure boundaries or flow boundaries)
        boundary_ids = [nid for nid, node in self.network.nodes.items() if is_pressure_reference(node)]
        
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
                if not is_pressure_reference(node) and degree[nid] <= 1:
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
        self.edge_pos = {id(e): j for j, e in enumerate(active_edges)}
        self._weights = None
        # Active edges per node for the property passes, with the node's own port (None for a handle beyond its ports)
        self.edges_into, self.edges_out_of = defaultdict(list), defaultdict(list)
        for j, edge in enumerate(active_edges):
            src, tgt = self.network.nodes[edge['source']], self.network.nodes[edge['target']]
            idx = self._parse_port_idx(edge.get('target_port', 'inlet-0'))
            self.edges_into[edge['target']].append((j, edge, tgt.inlets[idx] if idx < len(tgt.inlets) else None))
            idx = self._parse_port_idx(edge.get('source_port', 'outlet-0'))
            self.edges_out_of[edge['source']].append((j, edge, src.outlets[idx] if idx < len(src.outlets) else None))
        self.node_id_to_idx = {node_id: i for i, node_id in enumerate(self.node_ids)}
        # A pilot whose sensing point is left out of the solve senses its own inlet
        for node in self.network.nodes.values():
            if getattr(node, 'pilot_source', None) is not None:
                node.pilot_in_solve = node.remote_sensing_config["node_id"] in self.node_id_to_idx

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

        # Topology constants of the residual and its Jacobian; device states (lock-up, relief, MCP) are read per call
        self.internal_pos = {idx: i for i, idx in enumerate(self.internal_node_indices)}
        self._internal_idx = np.array(self.internal_node_indices, dtype=int)
        self._p_fixed = np.zeros(len(self.nodes_list))
        for i, p in self.fixed_pressure_nodes.items():
            self._p_fixed[i] = p
        # Per internal node: (is a flow boundary, incoming edges, outgoing edges)
        self._mass_rows = [(getattr(self.nodes_list[idx], 'node_type', None) == 'flow_boundary',
                            self.node_incoming_edge_indices.get(self.node_ids[idx], []),
                            self.node_outgoing_edge_indices.get(self.node_ids[idx], []))
                           for idx in self.internal_node_indices]
        # Per edge: (source index, target index, source position among the unknowns or -1, same for the target,
        # source node, target node, its 3-way TCV inlet port index when the target is a ThreeWayTCV else None, pipe,
        # source kind: "through" (a 3-way TCV or a node without a component law: its outlet is at its inlet pressure),
        # "mcp" (_use_mcp_for_node) or "law")
        self._edge_rows = []
        for edge in self.edges_list:
            src_idx, tgt_idx = self.node_id_to_idx[edge['source']], self.node_id_to_idx[edge['target']]
            src_node, tgt_node = self.nodes_list[src_idx], self.network.nodes[edge['target']]
            tcv_port = (self._parse_port_idx(edge.get('target_port', 'inlet-0'))
                        if isinstance(tgt_node, ThreeWayTCV) else None)
            if isinstance(src_node, ThreeWayTCV) or not hasattr(src_node, 'calculate_delta_p'):
                kind = "through"
            else:
                kind = "mcp" if self._use_mcp_for_node(src_node) else "law"
            self._edge_rows.append((src_idx, tgt_idx, self.internal_pos.get(src_idx, -1),
                                    self.internal_pos.get(tgt_idx, -1), src_node, tgt_node,
                                    tcv_port, edge['pipe'], kind))
        self._mass_jacobian = None   # (w_mass it was built with, rows, cols, data), calculate_jacobian

    def _all_pressures(self, p_in_internal) -> np.ndarray:
        """Pressures of all active nodes: the fixed boundary pressures and the internal unknowns."""
        p_in_all = self._p_fixed.copy()
        p_in_all[self._internal_idx] = p_in_internal
        return p_in_all

    # ------------------------------------------------------------------
    # Pressure-control outer loop
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

    # 3-way TCV loop: unknown z = logit(mix ratio), secant step on the outlet error, one step per outer iteration
    TCV_TOL_K = 0.01                # outlet error accepted as "at setpoint"
    TCV_MIX_MIN, TCV_MIX_MAX = 0.001, 0.999
    TCV_START_MIX = 0.5
    TCV_MAX_STEP = 3.0              # trust region in z (odds change by at most a factor 20 per iteration)
    TCV_BRACKET_AGE = 4             # regular steps a bracket end stays valid without being refreshed

    # Property loop: when successive hydraulic solutions swing back (flows and temperatures cycling), the flows
    # the properties are propagated with move only part of the way to the new solution, halving the step on
    # every further swing. Converged only when those flows match the hydraulic solution.
    PROP_RELAX_MIN = 1.0 / 64
    PROP_FLOW_TOL = 1e-4            # mismatch accepted, relative to the largest edge flow
    STILL_TOTAL_TOL = 1.0           # Pa: ports joined at rest without a pressure difference share a total

    @staticmethod
    def _logit(mix: float) -> float:
        return math.log(mix / (1.0 - mix))

    @staticmethod
    def _sigmoid(z: float) -> float:
        return 1.0 / (1.0 + math.exp(-z))

    def _clamp_mix(self, mix: float) -> float:
        return max(self.TCV_MIX_MIN, min(self.TCV_MIX_MAX, mix))

    def _tcv_step(self, node, tm) -> float:
        """
        One mix ratio update of a 3-way TCV from the solved state; returns the outlet error [K].
        Slope dT_out/dz: secant from the previous iteration, which includes density, throttling heat and the
        temperature coupling of the inlets. Before there is one (or when it is not plausible) the mass-weighted
        mixing balance gives (T_hot - T_cold)·w·(1 - w), w = hot mass fraction, as if the valve alone set the
        split; the secant only spans two regular steps. The step factor halves when the error changes sign
        without at least halving (overshoot) and recovers while the error falls with the same sign.
        Once regular steps have seen both signs of the error, the latest mix on each side brackets the
        setpoint; a step that would leave the bracket bisects it instead (an S-shaped T_out(z), e.g.
        laminar paths, otherwise lets the flat-region secant overshoot into a cycle). tm: per-TCV memory
        across outer iterations.
        """
        t_err = node.outlets[0].temperature - node.set_temperature
        prev_err, prev_kind, z_prev = tm.get("err"), tm.get("kind"), tm.get("z")
        hot, cold = node.inlets[node.hot_port_idx], node.inlets[1 - node.hot_port_idx]
        t_hot, t_cold, t_set = hot.temperature, cold.temperature, node.set_temperature
        z = self._logit(self._clamp_mix(node.mix_ratio))
        forward = hot.flow_rate > 1e-9 and cold.flow_rate > 1e-9
        span = t_hot - t_cold
        regular = forward and span > 2.0 * self.TCV_TOL_K and t_cold < t_set < t_hot
        if regular and prev_kind == "secant":
            same_sign = math.copysign(1.0, t_err) == math.copysign(1.0, prev_err)
            if not same_sign and abs(t_err) > 0.5 * abs(prev_err):
                tm["alpha"] = max(1.0 / 16.0, 0.5 * tm["alpha"])
            elif same_sign and abs(t_err) < abs(prev_err):
                tm["alpha"] = min(1.0, 2.0 * tm["alpha"])
        tm.update(err=t_err, z=z, kind="secant" if regular else "other")
        if not regular:
            tm.pop("lo", None)    # a bracket only holds between regular steps
            tm.pop("hi", None)

        if regular:
            tm["z_regular"] = z
            # Bracket ends: latest regular z with a too-cold (lo) and a too-hot (hi) outlet, with the step
            # they were seen at. An end not refreshed for TCV_BRACKET_AGE steps expires: early errors belong
            # to unsettled inlet temperatures and properties, and would hold a stale bracket.
            tm["k"] = tm.get("k", 0) + 1
            tm["hi" if t_err > 0 else "lo"] = (z, tm["k"])
            for end in ("lo", "hi"):
                if end in tm and tm["k"] - tm[end][1] > self.TCV_BRACKET_AGE:
                    del tm[end]
            m_hot, m_cold = hot.flow_rate * hot.density, cold.flow_rate * cold.density
            w = m_hot / (m_hot + m_cold)
            slope = span * max(w * (1.0 - w), 1e-4)
            if prev_kind == "secant" and abs(z - z_prev) > 1e-6:
                secant = (t_err - prev_err) / (z - z_prev)
                if 0.05 * slope < secant < 20.0 * slope:
                    slope = secant
            dz = float(np.clip(-tm["alpha"] * t_err / slope, -self.TCV_MAX_STEP, self.TCV_MAX_STEP))
            z_new = z + dz
            if "lo" in tm and "hi" in tm:
                z_a, z_b = sorted((tm["lo"][0], tm["hi"][0]))
                if z_b - z_a < 1e-6:
                    del tm["lo"], tm["hi"]    # both signs at one mix: the setpoint moved, the bracket is void
                elif not z_a < z_new < z_b:
                    z_new = 0.5 * (z_a + z_b)
            new_mix = self._sigmoid(z_new)
        elif forward and span > 2.0 * self.TCV_TOL_K:
            # Setpoint outside the inlet span: straight to the end stop
            new_mix = self.TCV_MIX_MAX if t_set >= t_hot else self.TCV_MIX_MIN
        elif forward and span < -2.0 * self.TCV_TOL_K:
            # Inversion (hot port colder): direct action by port role runs to an end stop
            new_mix = self.TCV_MIX_MAX if t_err < 0 else self.TCV_MIX_MIN
        elif not forward and prev_kind == "secant":
            # The last regular step went too far (a port lost its forward flow): back halfway to where it started
            new_mix = self._sigmoid(0.5 * (z + tm["z_regular"]))
        else:
            # No forward flow (also at an end stop), or equal inlet temperatures: incremental, direct action
            new_mix = node.mix_ratio - 0.05 * t_err
        node.mix_ratio = self._clamp_mix(new_mix)
        return t_err

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

    def _sensing_point(self, idx):
        """(node id, port type, port index) of the pressure the controller holds, as _sensed_pressure reads it."""
        node = self.nodes_list[idx]
        own = self.node_ids[idx]
        if isinstance(node, LinearRegulator):
            return (own, "inlet" if node.backpressure else "outlet", 0)
        config = node.remote_sensing_config
        if config and config["node_id"] in self.network.nodes:
            remote_node = self.network.nodes[config["node_id"]]
            ports = {"inlet": remote_node.inlets, "outlet": remote_node.outlets}.get(config["port_type"], [])
            if config["port_idx"] < len(ports):
                return (config["node_id"], config["port_type"], config["port_idx"])
        return (own, "outlet", 0)

    def _init_controller(self, idx):
        node = self.nodes_list[idx]
        node.opening_pct = 50.0
        node.locked_up = False
        return {
            "node": node,
            "point": self._sensing_point(idx),
            "tie": None,             # first controller of a group sharing one setpoint at one point
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

    def _share_sensing_points(self, controllers) -> bool:
        """
        Controllers that hold the same point in the same mode have no unique opening each: only the point's
        pressure is fixed. Their setpoints form tiers, highest PRV (lowest BPR) setpoint first. One tier
        regulates; the tiers before it are wide open (they cannot reach their higher setpoint) and the tiers
        after it are closed. Equal setpoints share control at one common opening (one controller output on all).
        Returns True when an opening was moved, so the hydraulic state no longer matches.
        """
        tol = self.CONTROL_TOL_BAR
        tie_pa = 0.5 * tol * 100000.0   # tied setpoints this close: at their mean every member is within tol
        groups = {}
        for st in controllers.values():
            st["tie"] = None
            if st["state"] != "lockup":
                groups.setdefault((st["point"], st["sign"]), []).append(st)
        moved = False

        def pin(st, opening, state):
            nonlocal moved
            if st["node"].opening_pct != opening:
                st["node"].opening_pct = opening
                moved = True
            st.update(state=state, done=True)

        for (_, sign), members in groups.items():
            for st in members:
                st["grouped"] = len(members) > 1
            if len(members) < 2:
                continue
            tiers = []
            for st in sorted(members, key=lambda s: -sign * s["node"].set_pressure):
                if tiers and sign * (tiers[-1][0]["node"].set_pressure - st["node"].set_pressure) <= tie_pa:
                    tiers[-1].append(st)
                else:
                    tiers.append([st])
            # The regulating tier is remembered by its setpoint, not its index: membership can change
            held = next((st["held_set"] for st in members if "held_set" in st), None)
            level = 0 if held is None else min(
                sum(sign * (tier[0]["node"].set_pressure - held) > tie_pa for tier in tiers), len(tiers) - 1)
            lead = tiers[level][0]
            if lead["state"] == "open" and level + 1 < len(tiers):
                level += 1          # wide open and still short of its setpoint: the next tier takes over
            elif lead["state"] == "closed" and level > 0 and tiers[level - 1][0]["error_bar"] > tol:
                level -= 1          # closed and still above, while the tier before is above its own setpoint
            for st in members:
                st["held_set"] = tiers[level][0]["node"].set_pressure
            for k, tier in enumerate(tiers):
                if k < level:
                    for st in tier:
                        pin(st, self.OPENING_MAX_PCT, "open")
                elif k > level:
                    for st in tier:
                        pin(st, st["o_min"], "closed")
            lead = tiers[level][0]
            o_min = min(st["o_min"] for st in tiers[level])     # one opening, one end stop
            for st in tiers[level]:
                st["o_min"] = o_min
            for st in tiers[level][1:]:
                st["tie"] = lead
                if st["node"].opening_pct != lead["node"].opening_pct:
                    st["node"].opening_pct = lead["node"].opening_pct
                    moved = True
                st.update(state=lead["state"], done=lead["done"])
            if len(tiers[level]) > 1:
                lead["tie"] = lead
        return moved

    def _may_lock_up(self, st) -> bool:
        node = st["node"]
        # A closed member of a shared sensing point is simply closed: the regulating member holds the point
        return isinstance(node, LinearRegulator) and not node.backpressure \
            and st["lockup_exits"] < self.MAX_LOCKUP_EXITS and not st.get("grouped")

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
        changed_mode = self._share_sensing_points(controllers) or changed_mode

        active = [st for st in controllers.values() if st["state"] == "regulating"]
        if not changed_mode and all(st["done"] for st in controllers.values()) and \
                all(abs(st["error_bar"]) < tol for st in active):
            return True, False
        if changed_mode or not active:
            memo.clear()
            return False, False

        # One unknown per unit: a controller, or a group sharing control (all members at one opening)
        units = {}
        for st in active:
            units.setdefault(id(st["tie"] or st), []).append(st)
        units = list(units.values())
        active = [unit[0] for unit in units]

        def set_opening(k, opening):
            for st in units[k]:
                st["node"].opening_pct = opening

        def unit_error(unit):
            # Tied setpoints differ by up to half the tolerance: the unit holds their mean
            return sum(self._controller_error(st) for st in unit) / len(unit)

        F = np.array([sum(st["error_bar"] for st in unit) / len(unit) for unit in units])
        keys = tuple(tuple(id(st["node"]) for st in unit) for unit in units)

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
                    set_opening(k, float(np.clip(math.exp(prev["v"][k] + prev["step"][k]),
                                                 st["o_min"], self.OPENING_MAX_PCT)))
                return False, False

        # Finite-difference Jacobian of f with respect to v = ln(opening), active controllers only
        n = len(active)
        v0 = np.array([math.log(max(st["node"].opening_pct, 1e-6)) for st in active])
        J = np.zeros((n, n))
        for k, sk in enumerate(active):
            o0 = sk["node"].opening_pct
            h = -self.FD_STEP_LN if o0 >= self.OPENING_MAX_PCT * 0.99 else self.FD_STEP_LN
            set_opening(k, min(self.OPENING_MAX_PCT, o0 * math.exp(h)))
            h_eff = math.log(sk["node"].opening_pct / o0)
            if evaluate() and abs(h_eff) > 1e-12:
                for i, unit in enumerate(units):
                    J[i, k] = (unit_error(unit) - F[i]) / h_eff
            set_opening(k, o0)

        # Controllers whose own opening does not move their error (no authority) walk towards the end
        # stop that their error asks for until it shows an effect or reaches saturation
        authority = [k for k in range(n) if J[k, k] > 1e-9]
        for k in range(n):
            if J[k, k] < -1e-9:
                # Opening it moves the sensed pressure the wrong way (e.g. downstream mode sensing a point
                # upstream of the valve): like a real wrong-acting loop it runs to an end stop; say why.
                for st in units[k]:
                    st["reverse_acting"] = True
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
            set_opening(k, float(np.clip(math.exp(v0[k] + dv[k]), st["o_min"], self.OPENING_MAX_PCT)))
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
        self._clear_stagnant_flags()   # a failed solve leaves no flags from the previous run
        self.properties_frozen = False
        start_time = time.perf_counter()
        max_outer_iterations = 100

        gs = getattr(self.network, 'global_settings', None)
        if gs:
            max_outer_iterations = getattr(gs, 'control_iterations', 100)

        if method is None:
            method = getattr(gs, 'solver_method', 'sparse_newton') if gs else 'sparse_newton'
        if method == 'hybr':
            method = 'sparse_newton'

        island_error = self._island_error()
        if island_error:
            # A circuit without any pressure reference has no defined pressure level
            return self._failure_stats(start_time, method, island_error)

        state = {
            "x": self._generate_initial_guess(), "sol": None, "num_int": 0, "inner": 0,
            "fallback": False, "residuals": None, "error": None,
            "q_prop": None, "dq": None, "omega": 1.0, "steady": 0, "flows_match": True,
        }

        def relaxed_flows(q_sol):
            """Flows for the property update: the solution itself until the updates start to swing back."""
            q_sol = np.asarray(q_sol, dtype=float)
            q_prev = state["q_prop"]
            if q_prev is None or len(q_prev) != len(q_sol):
                q = q_sol.copy()
            else:
                d = q_sol - q_prev
                d_prev = state["dq"]
                if d_prev is not None and np.dot(d, d_prev) < 0:
                    state["steady"] = 0
                    if np.linalg.norm(d) > 0.5 * np.linalg.norm(d_prev):
                        state["omega"] = max(0.5 * state["omega"], self.PROP_RELAX_MIN)
                elif d_prev is not None:
                    # Corrections in one direction: a single swing (a Newton overshoot) must not slow the rest of the run
                    state["steady"] += 1
                    if state["steady"] >= 3:
                        state["omega"], state["steady"] = min(2.0 * state["omega"], 1.0), 0
                state["dq"] = d
                q = q_prev + state["omega"] * d
            state["q_prop"] = q
            scale = float(np.max(np.abs(q_sol))) if len(q_sol) else 0.0
            gap = float(np.max(np.abs(q_sol - q))) if len(q_sol) else 0.0
            # A weak branch must also run the same way, or its ports carry the temperature of the other direction
            reversed_branch = np.any((q_sol * q < 0) & (np.maximum(np.abs(q_sol), np.abs(q)) > Q_DEAD_LEG))
            state["flows_match"] = gap <= self.PROP_FLOW_TOL * scale + Q_DEAD_LEG and not reversed_branch
            return q

        def run_hydraulics(fatal=True, propagate=True) -> bool:
            """Hydraulic solve at the current control positions, then fluid property propagation. Without
            propagate (the controllers' finite-difference solves) the properties are held as they are, so the
            differences measure the opening alone."""
            frozen = self.properties_frozen
            self.properties_frozen = frozen or not propagate
            try:
                # One property update per solve, with the relaxed flows, after the telemetry is written
                res = self._solve_hydraulics_core(method=method, x0_custom=state["x"],
                                                  property_flows=relaxed_flows if propagate else None)
            except ValueError as e:
                if fatal:
                    state["error"] = e
                    state["residuals"] = getattr(self, '_last_evaluated_residuals', None)
                return False
            finally:
                self.properties_frozen = frozen
            sol, num_int, inner_iters, fallback, residuals = res
            state.update(sol=sol, num_int=num_int, residuals=residuals, x=sol, frozen=frozen or not propagate)
            state["inner"] += inner_iters
            state["fallback"] = state["fallback"] or fallback
            if frozen:
                state["dq"] = None      # controllers may move the flows while frozen: no swing of the property loop
            return True

        # Relief devices start every run closed / intact; their state is decided between hydraulic solves
        relief_nodes = [n for n in self.nodes_list if getattr(n, 'node_type', '') in RELIEF_NODE_TYPES]
        for n in relief_nodes:
            n.reset_run_state()

        def update_relief_states() -> bool:
            # Held fixed inside each Newton solve; changed only here from the solved inlet pressures
            changed = False
            for n in relief_nodes:
                changed = n.update_relief_state() or changed
            if changed and state["sol"] is not None:
                # A device that opens leaves branches at exactly zero flow, where pump curves and pipe losses
                # have zero slope (singular Newton step); restart those flows from the initial flow guess
                x = np.array(state["x"], dtype=float)
                n_int = state["num_int"]
                q = x[n_int:]
                q[np.abs(q) < 1e-7] = self._initial_flow_guess()
                state["x"] = x
                state["dq"] = None      # the jump to the new relief state is no swing of the property loop
            return changed

        controllers = {idx: self._init_controller(idx) for idx in self.control_node_indices}
        for idx in self.tcv_node_indices:
            self.nodes_list[idx].mix_ratio = self.TCV_START_MIX
        tcv_memo = {idx: {"alpha": 1.0} for idx in self.tcv_node_indices}

        outer_iterations = 0
        relief_changed = False
        prev_temperatures = {}
        properties_converged = False
        controls_converged = not controllers
        tcv_settled = not self.tcv_node_indices
        tcv_on_setpoint = False
        memo = {}
        base_states = {}
        dirty = False

        for it in range(max_outer_iterations):
            outer_iterations += 1

            # Control positions this hydraulic solution belongs to
            base_states = {idx: (self.nodes_list[idx].opening_pct, self.nodes_list[idx].locked_up)
                           for idx in self.control_node_indices}
            for idx in self.tcv_node_indices:
                base_states[f"tcv_{idx}"] = self.nodes_list[idx].mix_ratio
            dirty = False

            # Once the properties have settled they are held fixed, so the controllers converge on pressures
            # that belong to the reported densities and viscosities
            solved_frozen = self.properties_frozen
            if not run_hydraulics():
                break
            relief_changed = update_relief_states()

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

            # 1. Pressure controllers (Newton on the openings)
            if controllers and relief_changed:
                # The solution above belongs to the previous relief state: differencing against it would mix
                # the relief jump into the Jacobian. Re-solve with the new state first.
                memo.clear()
                controls_converged, dirty = False, False
            elif controllers:
                controls_converged, dirty = self._control_step(controllers, lambda: run_hydraulics(fatal=False, propagate=False), memo)
            else:
                controls_converged = True

            # 2. 3-Way Thermal Control Valves (mix_ratio is the opening of the user-designated HOT port);
            # they act on temperatures, so they only move while the properties are propagated
            if self.tcv_node_indices and not solved_frozen:
                max_err_temp = 0.0
                for idx in self.tcv_node_indices:
                    max_err_temp = max(max_err_temp, abs(self._tcv_step(self.nodes_list[idx], tcv_memo[idx])))
                max_mix_change = max(abs(self.nodes_list[idx].mix_ratio - base_states[f"tcv_{idx}"])
                                     for idx in self.tcv_node_indices)
                tcv_on_setpoint = max_err_temp < self.TCV_TOL_K
                tcv_settled = tcv_on_setpoint or (it >= 2 and max_mix_change < 1e-6)
            elif self.tcv_node_indices and tcv_on_setpoint:
                # The frozen solve moves the flow split a little: a TCV that was on its setpoint must still be
                tcv_settled = all(abs(self.nodes_list[idx].outlets[0].temperature - self.nodes_list[idx].set_temperature)
                                  < self.TCV_TOL_K for idx in self.tcv_node_indices)

            # Controller and TCV steps move the flows on purpose, and their next step needs the temperatures of
            # the new flows: only swings at fixed control positions are damped
            if any((self.nodes_list[idx].opening_pct, self.nodes_list[idx].locked_up) != base_states[idx]
                   for idx in self.control_node_indices) or any(
                    self.nodes_list[idx].mix_ratio != base_states[f"tcv_{idx}"] for idx in self.tcv_node_indices):
                state["dq"], state["omega"] = None, 1.0

            properties_converged = max_temp_change < 0.05 and state["flows_match"]

            if controls_converged and tcv_settled and properties_converged and solved_frozen and not relief_changed:
                break
            # Freeze only on settled controllers, so the frozen properties belong to (nearly) the reported flows.
            # Controllers that still moved on frozen properties change the flows: propagate once more (and let the
            # TCVs check their temperatures) before freezing again
            freeze = (not solved_frozen and properties_converged and tcv_settled and controls_converged
                      and not relief_changed)
            if freeze != self.properties_frozen:
                memo.clear()    # the property change would look like a controller overshoot
            self.properties_frozen = freeze

        saturated = []
        if state["error"] is None and state["sol"] is not None:
            # Report the hydraulic solution together with the control positions it was solved with;
            # the loop may have moved them afterwards (e.g. at its iteration limit).
            for idx in self.control_node_indices:
                node = self.nodes_list[idx]
                node.opening_pct, node.locked_up = base_states[idx]
            for idx in self.tcv_node_indices:
                self.nodes_list[idx].mix_ratio = base_states[f"tcv_{idx}"]
            if dirty:
                run_hydraulics()    # finite-difference solves overwrote the stored state
            # A relief device that changed state after the last solve (iteration limit): solve again with it
            for _ in range(2 * len(relief_nodes) + 1):
                if state["error"] is not None or not relief_changed:
                    break
                run_hydraulics()
                relief_changed = update_relief_states()

            # With the control positions frozen, iterate the fluid properties until the reported
            # pressures belong to the reported temperatures (the loop may have stopped at its limit)
            if state["error"] is None and not properties_converged:
                for _ in range(20):
                    before = {(nid, k, i): p.temperature for nid, n in self.network.nodes.items()
                              for k, ports in (("in", n.inlets), ("out", n.outlets)) for i, p in enumerate(ports)}
                    if not run_hydraulics(fatal=False):
                        break
                    change = max((abs(p.temperature - before[(nid, k, i)]) for nid, n in self.network.nodes.items()
                                  for k, ports in (("in", n.inlets), ("out", n.outlets)) for i, p in enumerate(ports)), default=0.0)
                    if change < 0.05 and state["flows_match"]:
                        properties_converged = True
                        break

            # A solve followed by a property update belongs to the previous properties (iteration limit):
            # solve once more with the final properties held fixed, so the reported pressures satisfy every
            # component's equation with the reported densities and viscosities.
            num_int = len(self.internal_node_indices)
            last_solve_frozen = state.get("frozen", False)
            self.properties_frozen = True
            try:
                if state["error"] is None and not last_solve_frozen and not run_hydraulics(fatal=False, propagate=False):
                    properties_converged = False    # reported pressures still lag the properties
                sol = state["sol"]
                self._update_telemetry(sol[:num_int], sol[num_int:])
                for node in self.nodes_list:
                    if isinstance(node, (CentrifugalPump, VolumetricPump)) and node.inlets:
                        node.update_npsh(node.inlets[0])   # NPSHa from the reported suction pressure
            finally:
                self.properties_frozen = False
            if controllers:
                controls_converged, saturated = self._controller_report(controllers)
                for st in controllers.values():
                    if st["state"] == "lockup":
                        st["node"].opening_pct = 0.0    # closed tight; the solver pinned its outlet at the setpoint
            # A 3-way TCV off its setpoint at the iteration limit is a control loop that did not settle
            controls_converged = controls_converged and tcv_settled

        final_sol_x = state["sol"]
        last_residuals = state["residuals"]
        self._store_warm_start(final_sol_x if state["error"] is None else None)
        solve_error = state["error"]
        bottleneck = self._identify_bottleneck(last_residuals) if last_residuals is not None else None
        max_hydraulic_residual = float(np.max(np.abs(last_residuals))) if (last_residuals is not None and len(last_residuals) > 0) else 0.0
        failure = self._failure_report(solve_error, bottleneck) if solve_error is not None else {}
        stats = {
            "success": solve_error is None,
            "error": failure.get("message"),
            "error_kind": failure.get("kind"),
            "error_detail": str(solve_error) if solve_error is not None else None,
            "error_target": failure.get("target"),
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
        """Remember the final state of a solve as the next start (never intermediate control iterations)."""
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
            "error_detail": None,
            "error_target": None,
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

    def _failure_report(self, error, bottleneck) -> Dict[str, Any]:
        """Short message, kind and canvas target of a failed solve; the raw solver text goes to error_detail."""
        if isinstance(error, ComponentRangeError):
            target = error.component
            return {"kind": "out_of_range", "target": target, "message": (
                f"{target['name']} is outside its valid range: its equations cannot be evaluated at the pressures "
                "and flows the solver tried. Check its inputs and the pressures around it, for example a boundary "
                "pressure above a pump's shut-off head.")}
        if isinstance(error, SolveNotConvergedError) and bottleneck and bottleneck.get("id"):
            target = {k: bottleneck[k] for k in ("type", "id", "name")}
            return {"kind": "not_converged", "target": target, "message": (
                f"The solver did not converge. The largest imbalance is at {target['name']} "
                f"({bottleneck['error_type'].lower()}). Check the inputs around it.")}
        return {"kind": "not_converged", "target": None,
                "message": "The solver did not converge. Check the inputs and the boundary pressures."}

    def _component_ref(self, part, edge) -> Dict[str, Any]:
        """The canvas component of a part evaluated for an edge row: its pipe, the link of an in-line
        component or flow boundary, or a node (a hidden port node belongs to its component)."""
        if edge is not None and part is edge['pipe']:
            if isinstance(part, (ComponentLink, BoundaryLink)):
                cid = canvas_id(edge['id'])
                return {"type": "Node", "id": cid, "name": self._canvas_node(cid).name}
            return {"type": "Connection", "id": canvas_id(edge.get('id') or ''), "name": edge.get('label') or edge.get('id')}
        if getattr(part, 'hidden', False):
            cid = canvas_id(part.id)
            return {"type": "Node", "id": cid, "name": self._canvas_node(cid).name}
        return {"type": "Node", "id": canvas_id(part.id), "name": part.name}

    def _canvas_node(self, cid):
        """The canvas component of id cid: a node or an in-line component."""
        return self.network.nodes.get(cid) or self.network.inline_nodes[cid]

    def _island_error(self):
        """Message for connected circuits that contain no tank, pressure boundary or flow boundary."""
        if not getattr(self, 'island_groups', None):
            return None
        names = []
        for group in self.island_groups[:3]:
            shown = [self._canvas_node(nid).name for nid in group[:4]]
            names.append(", ".join(shown) + (" …" if len(group) > 4 else ""))
        return ("No pressure reference: the circuit with " + "; and the circuit with ".join(names) +
                " has no tank, pressure boundary or flow boundary, so its pressure level is undefined. "
                "Connect it to a tank or boundary.")

    def _physical_validity(self) -> Dict[str, Any]:
        """Ports at negative absolute pressure or below vapour pressure are not a physical result."""
        gs = getattr(self.network, 'global_settings', None)
        fluid = getattr(gs, 'fluid_type', 'water') if gs else 'water'
        issues = []
        t_lo, t_hi = FluidProperties.temperature_range_c(fluid)
        for nid in sorted(self.active_node_ids):
            node = self.network.nodes[nid]
            if isinstance(node, Pipe) or getattr(node, 'port_hubs', None):   # a flow boundary: on its port nodes
                continue
            node_id, name = node.id, node.name
            named_ports = [(f"{kind}-{i}", port) for kind, ports in (("inlet", node.inlets), ("outlet", node.outlets))
                           for i, port in enumerate(ports)]
            if getattr(node, 'hidden', False):   # a port of an in-line component or a flow boundary: reported on it
                node_id, port_label = canvas_id(nid), nid.split('#')[1]
                owner = self._canvas_node(node_id)
                name = owner.name
                if isinstance(owner, FlowBoundary):   # its canvas ports on this hidden node
                    named_ports = [(f"port-{k}", hub.port(i)) for k, (hub, i) in sorted(owner.port_hubs.items())
                                   if hub is node]
                else:
                    named_ports = [(port_label, named_ports[0][1])] if named_ports else []
            # Fluid correlations are only valid inside the fluid's temperature range
            t_ports = [p.temperature - 273.15 for _, p in named_ports if p.flow_rate != 0.0]
            if t_ports and (min(t_ports) < t_lo or max(t_ports) > t_hi):
                t_bad = min(t_ports) if min(t_ports) < t_lo else max(t_ports)
                issues.append({"node_id": node_id, "node": name, "port": "-", "temperature_c": t_bad,
                               "range_c": [t_lo, t_hi], "reason": "temperature_out_of_range"})
            for port_name, port in named_ports:
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
                issues.append({"node_id": node_id, "node": name, "port": port_name,
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
            # A hidden port node of an in-line component or a flow boundary is located on that component
            name = self._canvas_node(canvas_id(node.id)).name if getattr(node, 'hidden', False) else node.name
            return {"type": "Node", "name": name, "id": canvas_id(node.id), "error_type": "Mass Balance", "magnitude": max_val}
        else:
            edge_idx = max_idx - num_internal
            edge = self.edges_list[edge_idx]
            if isinstance(edge['pipe'], (ComponentLink, BoundaryLink)):   # the link of an in-line component or a flow boundary
                owner = self._canvas_node(canvas_id(edge['id']))
                return {"type": "Node", "name": owner.name, "id": canvas_id(edge['id']), "error_type": "Pressure Balance", "magnitude": max_val}
            return {"type": "Connection", "name": edge.get('label') or edge.get('id'), "id": canvas_id(edge.get('id') or ''), "error_type": "Pressure Balance", "magnitude": max_val}

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
        return np.concatenate([np.full(num_internal, avg_p), np.full(num_edges, self._initial_flow_guess())])

    def _initial_flow_guess(self) -> float:
        for node in self.nodes_list:
            if hasattr(node, 'flow_rated') and node.flow_rated > 0:
                return node.flow_rated
        return 0.005

    @staticmethod
    def _numeric_derivative(fn, q):
        """Central difference of fn(q). The step follows |q| (1e-4 relative, at least 1e-12 m3/s), so a nearly
        closed valve at q ~ 0 does not see a step larger than its own flow."""
        h = max(1e-12, 1e-4 * abs(q))
        return (fn(q + h) - fn(q - h)) / (2.0 * h)

    def calculate_jacobian(self, x_scaled) -> np.ndarray:
        """
        Calculates the sparse Jacobian J(x_scaled) analytically.
        """
        
        num_internal = len(self.internal_node_indices)
        num_edges = len(self.edges_list)
        N = num_internal + num_edges
        
        p_scale = 100000.0
        q_scale = 0.001
        
        # Extract variables from x_scaled
        p_in_internal = x_scaled[:num_internal] * p_scale
        q_edges = x_scaled[num_internal:] * q_scale
        p_in_all = self._all_pressures(p_in_internal)

        internal_pos = self.internal_pos
        w_mass, f_comp = self._current_weights()

        # 1. Mass Balance Rows (a < num_internal): constant while the weights are, so built once per solve
        if self._mass_jacobian is None or self._mass_jacobian[0] is not w_mass:
            rows, cols, data = [], [], []
            for a, (is_flow_boundary, incoming, outgoing) in enumerate(self._mass_rows):
                # If a flow boundary is present, its derivative with respect to its own pressure is 1.0,
                # and 0 for everything else since its reference pressure is fixed to atmospheric.
                if is_flow_boundary:
                    rows.append(a)
                    cols.append(a)
                    data.append(1.0)
                    continue

                # Tiny regularization to prevent exactly singular matrix (floating nodes)
                rows.append(a)
                cols.append(a)
                data.append(1e-9)

                for j in incoming:
                    rows.append(a)
                    cols.append(num_internal + j)
                    data.append(5.0 * w_mass[j])
                for j in outgoing:
                    rows.append(a)
                    cols.append(num_internal + j)
                    data.append(-5.0 * w_mass[j])
            self._mass_jacobian = (w_mass, rows, cols, data)
        rows, cols, data = (list(v) for v in self._mass_jacobian[1:])

        # 2. Pressure Balance Rows (a_row = num_internal + j)
        for j, (src_idx, tgt_idx, src_internal_idx, tgt_internal_idx, src_node, tgt_node_obj, tcv_port, pipe, kind) \
                in enumerate(self._edge_rows):
            a_row = num_internal + j
            fj = f_comp[j]   # the source component sees its inlet volume flow fj*q_j

            if kind == "mcp":
                # Complementarity rows (check valves, closed relief devices): the node itself decides which
                # branch of its model applies at the current state, so differentiate exactly that function
                # numerically instead of an analytic form that can describe a different branch.
                pipe_density, pipe_viscosity = pipe.upstream_port().fluid()
                density, viscosity = src_node.upstream_fluid()

                def row_residual(p_src, p_tgt, q, sense=None):
                    # Same function as the objective's row for this edge
                    dp_pipe_ = pipe.stagnation_delta_p(q, pipe_density, pipe_viscosity)
                    dp_tcv_ = 0.0
                    if tcv_port is not None:
                        port = tgt_node_obj.inlets[tcv_port]
                        dp_tcv_ = tgt_node_obj.calculate_path_dp(q, port.density, tcv_port, port.viscosity)
                    dp_node_ = src_node.calculate_delta_p(fj * q, density, viscosity, p_in_pa=p_src,
                                                          p_out_pa=p_tgt + dp_pipe_ + dp_tcv_, update_state=False,
                                                          **sense or {})
                    return ((p_src - dp_node_) - p_tgt - dp_pipe_ - dp_tcv_) / p_scale

                p_src0, p_tgt0, q0 = p_in_all[src_idx], p_in_all[tgt_idx], q_edges[j]
                h_p, h_q = 1.0, 1e-9
                pilot = self._pilot_point(src_node)
                if pilot is not None:
                    # A pilot sensing a remote point: the row also depends on that point's pressure (and, at an
                    # outlet port, on the flows through its node), so differentiate over every variable involved
                    def row_full(pa, qe):
                        return row_residual(pa[src_idx], pa[tgt_idx], qe[j],
                                            {"p_sense_pa": self._pilot_sense_pa(src_node, pa, qe)})
                    p_vars = {internal_pos[k] : k for k in (src_idx, tgt_idx, pilot[0]) if k in internal_pos}
                    q_vars = {j}
                    if pilot[2] == "outlet":
                        q_vars |= set(self.node_incoming_edge_indices.get(pilot[1], []))
                        q_vars |= set(self.node_outgoing_edge_indices.get(pilot[1], []))
                    # Perturb one entry in place and restore it, so no array is copied
                    def central(arr, k, h):
                        x0 = arr[k]
                        arr[k] = x0 + h
                        f_hi = row_full(p_in_all, q_edges)
                        arr[k] = x0 - h
                        f_lo = row_full(p_in_all, q_edges)
                        arr[k] = x0
                        return (f_hi - f_lo) / (2 * h)
                    for col, k in p_vars.items():
                        rows.append(a_row)
                        cols.append(col)
                        data.append(central(p_in_all, k, h_p) * p_scale)
                    for k in sorted(q_vars):
                        rows.append(a_row)
                        cols.append(num_internal + k)
                        data.append(central(q_edges, k, h_q) * q_scale)
                    continue
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
                # PD pump: on its discharge pressure limit the outlet barely follows p_in and the flow
                pd_derivs = None
                if isinstance(src_node, VolumetricPump) and not src_locked:
                    pd_inlet = src_node.inlets[0]
                    pd_derivs = src_node.outlet_derivatives(fj * q_edges[j], p_in_all[src_idx], pd_inlet.density, pd_inlet.viscosity)
                if src_internal_idx != -1 and not src_locked:
                    rows.append(a_row)
                    cols.append(src_internal_idx)
                    data.append(pd_derivs[0] if pd_derivs else 1.0)

                if tgt_internal_idx != -1:
                    rows.append(a_row)
                    cols.append(tgt_internal_idx)
                    data.append(-1.0)

                # Term 1: d(P_src_out)/dq_j
                if pd_derivs:
                    rows.append(a_row)
                    cols.append(num_internal + j)
                    data.append((q_scale / p_scale) * pd_derivs[1] * fj)
                elif not src_locked and kind == "law":
                    density, viscosity = src_node.upstream_fluid()
                    
                    is_pump = isinstance(src_node, (CentrifugalPump, VolumetricPump))
                    if is_pump:
                        dp_deriv_src_signed = src_node.calculate_dp_derivative(fj * q_edges[j], density, viscosity)
                    elif isinstance(src_node, FlowBoundary):
                        # Outlet pressure p_in - dp of its stiff spring
                        dp_deriv_src_signed = -src_node.calculate_dp_derivative(
                            fj * q_edges[j], density, viscosity, outlet=self._outlet_of(self.edges_list[j]))
                    else:
                        # Valves, regulators, orifices, filters...: differentiate the node's own outlet
                        # pressure so viscosity corrections and branch switches are included
                        dp_deriv_src_signed = self._numeric_derivative(
                            lambda q_: self._get_node_p_out(src_node, p_in_all[src_idx], q_, q_), fj * q_edges[j])

                    rows.append(a_row)
                    cols.append(num_internal + j)
                    data.append((q_scale / p_scale) * dp_deriv_src_signed * fj)

                # Term 2: d(dp_pipe)/dq_j
                pipe_density, pipe_viscosity = pipe.upstream_port().fluid()
                dp_deriv_pipe = max(1e-3, pipe.stagnation_dp_derivative(q_edges[j], pipe_density, pipe_viscosity))
                
                # Term 3: d(dp_tcv)/dq_j
                dp_deriv_tcv = 0.0
                if tcv_port is not None:
                    tcv_density = tgt_node_obj.inlets[tcv_port].density
                    tcv_viscosity = tgt_node_obj.inlets[tcv_port].viscosity
                    dp_deriv_tcv = max(100.0, self._numeric_derivative(
                        lambda q_: tgt_node_obj.calculate_path_dp(q_, tcv_density, tcv_port, tcv_viscosity), q_edges[j]))

                rows.append(a_row)
                cols.append(num_internal + j)
                data.append((q_scale / p_scale) * (-dp_deriv_pipe - dp_deriv_tcv))

        return sp.coo_matrix((data, (rows, cols)), shape=(N, N)).tocsr()

    def _solve_sparse_newton(self, objective, x0, tol=1e-6, max_iter=100, step_tol=None):
        """
        Custom high-performance sparse Newton-Raphson solver using backtracking line search.

        Converged means the residual is below `tol` AND the next Newton step moves no flow by more than `step_tol`
        (scaled units, L/s). The step test is what keeps low-loss sections honest: a 10 Pa
        residual alone is satisfied by 150 L/min in a DN200 line between equal tank levels.
        """

        class SolResult:
            def __init__(self, success, message, x, nfev, njev):
                self.success = success
                self.message = message
                self.x = x
                self.nfev = nfev
                self.njev = njev
                self.residual = r    # objective(x): x and r are only ever updated together

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

    def _edge_weights(self) -> Tuple[np.ndarray, np.ndarray]:
        """Per edge, held fixed during a solve like the densities of the edge rows:
        - w: the edge density relative to the network mean, for the node mass rows. The density at the end where the
          flow enters the next node (flow direction of the last property pass), the density that node mixes with
          (calculate_temperature, _solve_mixing).
        - f: edge flow -> volume flow at the upstream port of the edge's source component (edge density / its
          upstream port density). Component curves take their inlet volume flow, as in the property pass and the controllers.
        Both are 1 everywhere before the first pass (ports start at the same default density)."""
        rho = np.array([e['pipe'].outlets[0].density if e['pipe'].inlets[0].flow_rate >= 0
                        else e['pipe'].inlets[0].density for e in self.edges_list], dtype=float)
        if not len(rho):
            return rho, rho
        f = np.ones(len(rho))
        for j, e in enumerate(self.edges_list):
            src = self.network.nodes[e['source']]
            if src.inlets and not isinstance(src, ThreeWayTCV):
                f[j] = rho[j] / max(1e-9, src.upstream_fluid()[0])
        return rho / float(np.mean(rho)), f

    def _current_weights(self) -> Tuple[np.ndarray, np.ndarray]:
        """The (w, f) of _edge_weights used by the current solve (computed when no solve has set them)."""
        if self._weights is None or len(self._weights[0]) != len(self.edges_list):
            return self._edge_weights()
        return self._weights

    def _solve_hydraulics_core(self, method='sparse_newton', x0_custom=None,
                               property_flows=None) -> Tuple[np.ndarray, int, int, bool, np.ndarray]:
        num_internal = len(self.internal_node_indices)
        num_edges = len(self.edges_list)
        # Node mass rows balance rho*q, component curves take their inlet volume flow f*q (the solve, calculate_jacobian
        # and the report use the same weights; a failed solve restores those of the last converged objective)
        prev_weights = self._weights
        self._weights = (w_mass, f_comp) = self._edge_weights()
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
            check_deadline()   # cooperative solve timeout
            p_in_internal = x_scaled[:num_internal] * p_scale
            q_edges = x_scaled[num_internal:] * q_scale
            p_in_all = self._all_pressures(p_in_internal)

            residuals = []
            # 1. Mass Balance
            for i, (is_flow_boundary, incoming, outgoing) in enumerate(self._mass_rows):
                # If a flow boundary is present, bypass mass balance and pin its reference pressure
                # to the ambient/atmospheric pressure instead.
                if is_flow_boundary:
                    atm_p = 101325.0
                    if self.network.global_settings:
                        atm_p = getattr(self.network.global_settings, 'atmospheric_pressure', 101325.0)
                    residuals.append((p_in_internal[i] - atm_p) / p_scale)
                    continue

                # Mass flow, as volume flow at the mean density: the row keeps the size and tolerance of a q row
                m_in = sum(w_mass[j] * q_edges[j] for j in incoming)
                m_out = sum(w_mass[j] * q_edges[j] for j in outgoing)
                residuals.append(5.0 * (m_in - m_out) / q_scale + 1e-9 * x_scaled[i])

            # 2. Pressure Balance
            part = None    # the component being evaluated: named when its equations cannot be evaluated
            try:
                for j, (src_idx, tgt_idx, _, _, src_node, tgt_node, tcv_port, pipe, kind) in enumerate(self._edge_rows):
                    if kind == "through":
                        p_src_out = p_in_all[src_idx]
                    elif getattr(src_node, 'locked_up', False):
                        p_src_out = src_node.set_pressure   # closed regulator holds its setpoint downstream
                    elif kind == "mcp":
                        part = pipe
                        dp_pipe = pipe.stagnation_delta_p(q_edges[j], *pipe.upstream_port().fluid())
                        part = tgt_node
                        p_out_est = p_in_all[tgt_idx] + dp_pipe + self._tcv_entry_dp(self.edges_list[j], tgt_node, q_edges[j])

                        part = src_node
                        density, viscosity = src_node.upstream_fluid()
                        sense = {}
                        if self._pilot_point(src_node) is not None:
                            sense = {"p_sense_pa": self._pilot_sense_pa(src_node, p_in_all, q_edges)}
                        dp_node = src_node.calculate_delta_p(f_comp[j] * q_edges[j], density, viscosity, p_in_pa=p_in_all[src_idx], p_out_pa=p_out_est, update_state=False, **sense)
                        p_src_out = p_in_all[src_idx] - dp_node
                    else:
                        # The component's curve at its inlet volume flow (f_comp: edge density / inlet density)
                        part = src_node
                        q_comp = f_comp[j] * q_edges[j]
                        p_src_out = self._get_node_p_out(src_node, p_in_all[src_idx], q_comp, q_comp,
                                                         outlet=self._outlet_of(self.edges_list[j]))

                    if tcv_port is not None:
                        part = tgt_node
                        dp_tcv = tgt_node.calculate_path_dp(q_edges[j], tgt_node.inlets[tcv_port].density, tcv_port, tgt_node.inlets[tcv_port].viscosity)
                        part = pipe
                        dp_pipe = pipe.stagnation_delta_p(q_edges[j], *pipe.upstream_port().fluid())
                        residuals.append(((p_src_out - p_in_all[tgt_idx]) - (dp_pipe + dp_tcv)) / p_scale)
                    else:
                        part = pipe
                        dp_pipe = pipe.stagnation_delta_p(q_edges[j], *pipe.upstream_port().fluid())
                        residuals.append(((p_src_out - p_in_all[tgt_idx]) - dp_pipe) / p_scale)
            except ValueError as e:
                if isinstance(e, ComponentRangeError) or part is None:
                    raise
                raise ComponentRangeError(self._component_ref(part, self.edges_list[j]), e) from e
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

        # Honour the user tolerance (scaled units: 1e-6 = 0.1 Pa); no 10 Pa floor
        residual_tolerance = max(1e-8, tol)

        def run_newton(x_init):
            return self._solve_sparse_newton(objective, x_init, tol=residual_tolerance, max_iter=inner_max_steps,
                                             step_tol=max(1e-9, tol))

        def run_lm(x_init):
            return root(objective, x_init, method='lm', jac=dense_jacobian, tol=residual_tolerance,
                        options={'maxiter': inner_max_steps, 'xtol': 1e-12, 'ftol': 1e-12})

        def residual_at(candidate):
            """objective(candidate.x): the Newton solve returns the one it evaluated there, other results are evaluated."""
            r = getattr(candidate, 'residual', None)
            return objective(candidate.x) if r is None else r

        def is_converged_solution(candidate):
            return bool(candidate.success and np.max(np.abs(residual_at(candidate))) <= residual_tolerance)

        # Whichever method is chosen, the other one is the fallback, and both are held to the same
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

        final_residuals = residual_at(sol)
        self._last_evaluated_residuals = final_residuals
        max_res = np.max(np.abs(final_residuals))

        is_converged = bool(best is not None and sol is best and max_res <= residual_tolerance)
        
        if is_converged:
            final_p = sol.x[:num_internal] * p_scale
            final_q = sol.x[num_internal:] * q_scale
            self._last_objective, self._last_x_scaled = objective, sol.x.copy()   # Jacobian checks (test_jacobian.py)
            self._update_telemetry(final_p, final_q, property_flows)
            
            converged_x = np.concatenate([final_p, final_q])
            return converged_x, num_internal, getattr(sol, 'nfev', 0), fallback_used, final_residuals
        else:
            self._weights = prev_weights
            msg = getattr(sol, 'message', 'Residuals did not converge to tolerance')
            raise SolveNotConvergedError(f"Solver failed to converge: message='{msg}', max_residual={max_res:.6f} (scaled)")


    def _pilot_point(self, node):
        """(node index, node id, port type) of a pilot PSV's remote sensing point in the solve, else None."""
        if not getattr(node, 'has_remote_pilot', False):
            return None
        config = node.remote_sensing_config
        idx = self.node_id_to_idx.get(config["node_id"])
        return None if idx is None else (idx, config["node_id"], config["port_type"])

    def _pilot_sense_pa(self, node, p_in_all, q_edges):
        """Pressure at a pilot PSV's sensing point for the current iterate."""
        idx, nid, port_type = self._pilot_point(node)
        p = p_in_all[idx]
        if port_type == "outlet":
            q_in = sum(q_edges[k] for k in self.node_incoming_edge_indices.get(nid, []))
            q_out = sum(q_edges[k] for k in self.node_outgoing_edge_indices.get(nid, []))
            p = self._get_node_p_out(self.nodes_list[idx], p, q_in, q_out)
        return p

    def _use_mcp_for_node(self, node) -> bool:
        if getattr(node, 'use_mcp_formulation', False):
            return True
        # Relief devices are always a flow equation with their open/closed state held (B1c)
        return getattr(node, 'node_type', '') in RELIEF_NODE_TYPES

    def _tcv_entry_dp(self, edge, tgt_node, q) -> float:
        """Loss of a 3-way TCV inlet path when the edge ends at one (0 for any other target)."""
        if not isinstance(tgt_node, ThreeWayTCV):
            return 0.0
        port_idx = self._parse_port_idx(edge.get('target_port', 'inlet-0'))
        port = tgt_node.inlets[port_idx]
        return tgt_node.calculate_path_dp(q, port.density, port_idx, port.viscosity)

    def _get_node_p_out(self, node, p_in, q_in, q_out, update_state: bool = False, p_in_all=None, outlet: int = 0):
        """p_in_all (indexed like all_nodes_list) supplies the solved downstream pressure for relief devices; outlet
        is the outlet (link) of a flow boundary, whose set flow can differ per outlet."""
        density, viscosity = node.upstream_fluid()

        if isinstance(node, FlowBoundary):
            return p_in - node.calculate_delta_p(q_out, density, viscosity, outlet=outlet)
        q_flow = q_in

        if getattr(node, 'locked_up', False):
            return node.set_pressure
        if isinstance(node, LinearRegulator) and not node.backpressure and                 self.node_to_key.get(id(node)) in self.pruned_node_ids:
            # A regulator without any flow path (dead end) is locked up, not wide open
            return min(p_in, node.set_pressure)
        if isinstance(node, VolumetricPump):
            return p_in + node.calculate_delta_p(q_flow, density, viscosity, p_in_pa=p_in)
        if isinstance(node, CentrifugalPump):
            return p_in + node.calculate_delta_p(q_flow, density, viscosity)
        elif hasattr(node, 'calculate_delta_p'):
            if self._use_mcp_for_node(node):
                p_out_est = p_in
                node_key = self.node_to_key.get(id(node), node.id)
                # The first active outgoing edge (the one the solve's row uses), else a pruned one
                outgoing = [e for e in self.all_edges_list if e['source'] == node_key]
                edge = next((e for e in outgoing if id(e) in self.edge_pos), outgoing[0] if outgoing else None)
                if edge is not None:
                    tgt_id = edge['target']
                    tgt_idx = self.all_node_id_to_idx[tgt_id]
                    tgt_node = self.network.nodes[tgt_id]
                    pipe = edge['pipe']
                    p_tgt = p_in_all[tgt_idx] if p_in_all is not None else self._tgt_port(edge, tgt_node).pressure
                    # The pipe carries the edge flow, not the component's inlet volume flow (as in the solve)
                    pos = self.edge_pos.get(id(edge))
                    q_edge = q_flow / self._current_weights()[1][pos] if pos is not None else q_flow
                    p_out_est = (p_tgt + pipe.stagnation_delta_p(q_edge, *pipe.upstream_port().fluid())
                                 + self._tcv_entry_dp(edge, tgt_node, q_edge))
                return p_in - node.calculate_delta_p(q_flow, density, viscosity, p_in_pa=p_in, p_out_pa=p_out_est, update_state=update_state)

            return p_in - node.calculate_delta_p(q_flow, density, viscosity)
        else:
            return p_in

    def _update_telemetry(self, p_in_internal, q_edges, property_flows=None):
        """Reported pressures and flows, after propagating the fluid properties with the solved flows. With
        property_flows (the relaxed flows of the outer loop) the properties are propagated last instead, on the
        relief states and pressures written here, and belong to the next solve."""
        if not self.properties_frozen and property_flows is None:
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
            
        # 4. Clear all flows to 0.0 initially. Until _report_static_pressures the ports hold total pressures
        for node in self.all_nodes_list:
            for port in node.inlets + node.outlets:
                port.flow_rate = 0.0
                port.total_pressure = None

        # 5. Populate active flows (the solved edge flows; components no longer overwrite them in step 6)
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

        # 6. First pass: Populate active node pressures and update active node states. Pilot PSVs come last,
        # so the port they sense already holds its solved pressure
        f_comp = self._current_weights()[1]
        for node in sorted(self.all_nodes_list, key=lambda n: getattr(n, 'has_remote_pilot', False)):
            node_key = self.node_to_key[id(node)]
            if node_key in self.active_node_ids:
                all_idx = self.all_node_id_to_idx[node_key]
                p_in = p_in_all[all_idx]
                for port in node.inlets: port.pressure = p_in
                q_in_total = sum(p.flow_rate for p in node.inlets)
                q_out_total = sum(p.flow_rate for p in node.outlets)
                # The drop at the inlet volume flow of the solve's edge row (outlet edge flow times its f): the node
                # mass rows leave up to ~1e-10 m³/s between inlet and outlet, which a stiff component
                # (1e13 Pa·s/m³) turns into Pa that the next pipe would report as its own drop
                out_edges = self.node_outgoing_edge_indices.get(node_key, ())
                q_drop = sum(f_comp[j] * q_edges[j] for j in out_edges) if node.outlets else q_in_total
                if isinstance(node, FlowBoundary):
                    # One flow spring per link: each outlet at the flow of its own link, as in the solve's edge row
                    for j in out_edges:
                        q_link = f_comp[j] * q_edges[j]
                        port = self._src_port(self.edges_list[j], node)
                        port.pressure = self._get_node_p_out(node, p_in, q_link, q_link, p_in_all=p_in_all,
                                                             outlet=self._outlet_of(self.edges_list[j]))
                    continue
                p_out = self._get_node_p_out(node, p_in, q_drop, q_out_total, update_state=True, p_in_all=p_in_all)
                for port in node.outlets: port.pressure = p_out
                if isinstance(node, ThreeWayTCV):
                    node.calculate()

        # 6b. Sides left out of the solve take their pressure from the solved sides they connect to
        self._fill_pruned_pressures(atm_p)

        # 7. Closed relief devices pass no flow
        for node in self.all_nodes_list:
            if is_closed_relief(node):
                for port in node.inlets + node.outlets: port.flow_rate = 0.0

        stagnant_ids = self._assign_stagnant_pressures(q_edges)

        # 7b. Device state (opening, status) from the final pressures of the sides set in 6b and 7
        for nid in self.pruned_node_ids | stagnant_ids:
            node = self.network.nodes[nid]
            if node.inlets and not blocks_at_rest(node):
                self._get_node_p_out(node, node.inlets[0].pressure, 0.0, 0.0, update_state=True)

        # 8. Populate all edges' pipe flows and pressures
        active_edge_pos = self.edge_pos
        heads = defaultdict(list)   # id(port) -> velocity heads of the flowing pipes on it
        still = []   # zero-flow pipes: (src node, src port, tgt node, tgt port, ((pipe end, port it copies), ...))
        for edge in self.all_edges_list:
            pipe = edge['pipe']
            src_node, src_port, tgt_node, tgt_port = self.edge_ports[id(edge)]

            active_pos = active_edge_pos.get(id(edge))
            is_active = active_pos is not None
            q = q_edges[active_pos] if is_active else 0.0
            
            src_is_closed_relief = is_closed_relief(src_node)
            tgt_is_closed_relief = is_closed_relief(tgt_node)

            if src_is_closed_relief:
                pipe_p = src_port.pressure
                pipe.inlets[0].pressure = pipe_p
                pipe.outlets[0].pressure = pipe_p
                pipe.inlets[0].flow_rate = 0.0
                pipe.outlets[0].flow_rate = 0.0
                still.append((src_node, src_port, tgt_node, tgt_port,
                              ((pipe.inlets[0], src_port), (pipe.outlets[0], src_port))))
            elif tgt_is_closed_relief:
                pipe_p = tgt_port.pressure
                pipe.inlets[0].pressure = pipe_p
                pipe.outlets[0].pressure = pipe_p
                pipe.inlets[0].flow_rate = 0.0
                pipe.outlets[0].flow_rate = 0.0
                still.append((src_node, src_port, tgt_node, tgt_port,
                              ((pipe.inlets[0], tgt_port), (pipe.outlets[0], tgt_port))))
            else:
                pipe.inlets[0].flow_rate = q
                pipe.outlets[0].flow_rate = q
                pipe.inlets[0].pressure = src_port.pressure
                pipe.outlets[0].pressure = tgt_port.pressure
                if abs(q) > Q_DEAD_LEG:   # solver noise on a dead leg carries no velocity head
                    # A pipe end on a node is at the node's total pressure minus the velocity head; an end on a
                    # reservoir reports its pressure (the pipe's drop holds the entry, pipe.md)
                    # (at the upstream end's density, as in the solve, so it does not depend on the drawn direction)
                    head_src, head_tgt = pipe.end_heads(q)
                    if not getattr(src_node, 'is_pressure_boundary', False):
                        pipe.inlets[0].pressure -= head_src
                        heads[id(src_port)].append(head_src)
                    if not getattr(tgt_node, 'is_pressure_boundary', False):
                        pipe.outlets[0].pressure -= head_tgt
                        heads[id(tgt_port)].append(head_tgt)
                else:
                    still.append((src_node, src_port, tgt_node, tgt_port,
                                  ((pipe.inlets[0], src_port), (pipe.outlets[0], tgt_port))))

        self._report_static_pressures(heads, still)
        for edge in self.all_edges_list:   # an in-line component's ports from its hidden port nodes
            if isinstance(edge['pipe'], ComponentLink):
                _, port0, _, port1 = self.edge_ports[id(edge)]
                edge['pipe'].report(port0, port1)

        if not self.properties_frozen and property_flows is not None:
            self._propagate_properties(property_flows(q_edges))

    def _report_static_pressures(self, heads, still):
        """The solve's node pressures are total pressures. A port with one flowing pipe (heads: id(port) -> the
        velocity heads of the flowing pipes on it, from step 8) reports the static pressure at that pipe's end; a
        port with several has no single velocity and reports the total. The total stays in total_pressure (relief
        devices, NPSHa).

        A port without flow on a side with flowing ports of the same total reports the lowest static pressure among
        them, as a gauge on a dead tee branch reads the run's static pressure (a junction's ports are all one side). The zero-flow section behind it, or
        behind a flowing port (still, from step 8), drops with it: its pipes and the nodes without flow, up to a
        reservoir and only between ports of the same total (within STILL_TOTAL_TOL), so not across a device holding
        a pressure difference (a closed check or relief valve, a stopped positive-displacement pump); a centrifugal
        pump passes it with its shutoff head. A section reached from several ports takes the largest drop, the
        lowest static pressure."""
        nodes = self.network.nodes.values()
        for node in nodes:
            for port in node.inlets + node.outlets:
                port.total_pressure = port.pressure
                port_heads = heads.get(id(port))
                if port_heads is not None and len(port_heads) == 1:
                    port.pressure -= port_heads[0]

        reach = defaultdict(list)   # id(port) -> (node, port) at the far end of each zero-flow pipe on it
        for src_node, src_port, tgt_node, tgt_port, _ in still:
            reach[id(src_port)].append((tgt_node, tgt_port))
            reach[id(tgt_port)].append((src_node, src_port))
        flowing = {id(node) for node in nodes if any(id(p) in heads for p in node.inlets + node.outlets)}

        def same_total(a, b):
            return abs(a.total_pressure - b.total_pressure) <= self.STILL_TOTAL_TOL

        todo = []   # heap of (-drop, order, port): the largest drop reaches a port first
        order = itertools.count()
        for node in nodes:
            sides = (node.inlets + node.outlets,) if getattr(node, 'single_side', False) else (node.inlets, node.outlets)
            for side in sides:
                run = [p for p in side if len(heads.get(id(p), ())) == 1]
                for p in side:
                    if id(p) not in heads:
                        drop = max((heads[id(f)][0] for f in run if same_total(f, p)), default=None)
                    else:
                        drop = heads[id(p)][0] if id(p) in reach and len(heads[id(p)]) == 1 else None
                    if drop is not None:
                        heapq.heappush(todo, (-drop, next(order), p))
        drops = {}   # id(port) -> the drop it took
        while todo:
            neg_drop, _, port = heapq.heappop(todo)
            if id(port) in drops:
                continue
            drops[id(port)] = -neg_drop
            if id(port) not in heads:   # a flowing port already reports its static pressure
                port.pressure += neg_drop
            for node, far in reach.get(id(port), ()):
                if id(far) in drops or id(node) in flowing or getattr(node, 'is_pressure_boundary', False):
                    continue
                for p in node.inlets + node.outlets:
                    if same_total(p, port) or isinstance(node, CentrifugalPump):
                        heapq.heappush(todo, (neg_drop, next(order), p))
        for *_, ends in still:
            for end, port in ends:
                end.pressure -= drops.get(id(port), 0.0)

    def _side_ports(self, nid, side):
        node = self.network.nodes[nid]
        return node.inlets if side == 'in' else node.outlets

    def _p_in_at_rest(self, node, p_out):
        """Inlet pressure that gives p_out at zero flow (exact for a rise or drop that does not depend on p_in)."""
        p_in = p_out
        for _ in range(3):
            p_in = p_out - (self._get_node_p_out(node, p_in, 0.0, 0.0) - p_in)
        return p_in

    def _carry_at_rest(self, seeds, todo, passes):
        """Carries the pressure of the seed sides at zero flow to the sides in `todo` they reach (removed from
        it): unchanged along a pipe, across a device with passes(nid) by its zero-flow rise or drop (pump
        shutoff head, regulator lock-up) in either direction."""
        queue = deque(seeds)

        def set_side(side, p):
            for port in self._side_ports(*side):
                port.pressure = p
            todo.discard(side)
            queue.append(side)

        while queue:
            nid, side = queue.popleft()
            for port, other in self.side_links.get((nid, side), ()):
                if other in todo:
                    set_side(other, port.pressure)
            other = (nid, 'out' if side == 'in' else 'in')
            ports = self._side_ports(nid, side)
            if other in todo and ports and passes(nid):
                node = self.network.nodes[nid]
                p = ports[0].pressure
                set_side(other, self._get_node_p_out(node, p, 0.0, 0.0) if side == 'in' else self._p_in_at_rest(node, p))

    def _fill_pruned_pressures(self, atm_p):
        """Pressure of the sides left out of the solve (dead legs, stopped PD pumps, closed relief devices).

        Each node has an inlet side and an outlet side. From the solved sides the pressure is carried at zero
        flow (_carry_at_rest). A blocking device (blocks_at_rest) passes no pressure from one side to the
        other, so each of its sides takes the pressure of its own neighbour; the outlet of a closed relief
        device takes its downstream pressure. A side no solved pressure reaches is set to atmospheric
        pressure; _assign_stagnant_pressures then gives it its leak-path pressure."""
        nodes = self.network.nodes
        seeds = []
        for nid, node in nodes.items():
            if nid not in self.pruned_node_ids:
                seeds += [(nid, 'in')] if is_closed_relief(node) else [(nid, 'in'), (nid, 'out')]
        todo = {(nid, side) for nid in nodes for side in ('in', 'out')} - set(seeds)
        self._carry_at_rest(seeds, todo, lambda nid: not blocks_at_rest(nodes[nid]))
        for side in todo:
            for port in self._side_ports(*side):
                port.pressure = atm_p

    def _clear_stagnant_flags(self):
        ports = [p for node in self.network.nodes.values() for p in node.inlets + node.outlets]
        ports += [p for edge in self.all_edges_list for p in edge['pipe'].inlets + edge['pipe'].outlets]
        for port in ports:
            port.stagnant = False

    def _assign_stagnant_pressures(self, q_edges):
        """Pressure of sections shut in by blocking devices (ROADMAP "Undefined Pressure in Stagnant Branches").

        Each node has an inlet side and an outlet side. Pipes and open devices tie sides together; a blocking
        device (stopped PD pump, check valve without flow, closed relief device) does not. A group of sides
        without a pressure boundary carries no flow and the equations leave its pressure free: it takes the
        pressure behind its strongest leak path (LEAK_*, the highest one on a tie), carried through the group
        at zero flow (an open device keeps its zero-flow rise or drop), and shifted where a check valve on its
        edge would open or a relief device would lift. Its ports and pipes are flagged stagnant.

        Relief device seat: leakage alone never lifts a closed PSV or bursts a disc. Physically a leak into a
        shut-in section would slowly bring it up to the set pressure and the device would simmer there at a
        negligible flow, so the section is held just below the set pressure and the relief passes see no
        breach (no opening at zero flow). This holds for devices in 'auto', also while the relief passes hold
        them closed (held_closed_ids), but not for the unmitigated pass or a device the user forced closed:
        there the device has failed and the leak brings the section to the full leak-path pressure.

        Returns the ids of the nodes in a stagnant group."""
        nodes = self.network.nodes
        parent = {}

        def find(k):
            parent.setdefault(k, k)
            while parent[k] != k:
                parent[k] = parent[parent[k]]
                k = parent[k]
            return k

        leak_rank = {}
        for nid, node in nodes.items():
            if is_stopped_blocking(node):
                leak_rank[nid] = LEAK_STOPPED_PUMP
            elif is_closed_relief(node):
                leak_rank[nid] = LEAK_RELIEF_SEAT
            elif node.node_type in CHECK_VALVE_TYPES and abs(node.inlets[0].flow_rate) <= Q_STAGNANT:
                leak_rank[nid] = LEAK_CHECK_VALVE
            else:
                parent[find((nid, 'in'))] = find((nid, 'out'))
        for edge in self.all_edges_list:
            parent[find((edge['source'], 'out'))] = find((edge['target'], 'in'))

        # A flow boundary at zero flow fixes nothing; one with flow is anchored by its edge flow
        anchored = set()
        for nid, node in nodes.items():
            if getattr(node, 'is_pressure_boundary', False):
                anchored |= {find((nid, 'in')), find((nid, 'out'))}
        for j, edge in enumerate(self.edges_list):
            if abs(q_edges[j]) > Q_STAGNANT:
                anchored.add(find((edge['source'], 'out')))   # flow implies a reference; never override it

        groups = {}
        for nid in nodes:
            for side in ('in', 'out'):
                root = find((nid, side))
                if root not in anchored:
                    groups.setdefault(root, []).append((nid, side))

        # solve() cleared the flags
        for edge in self.all_edges_list:
            stagnant = find((edge['source'], 'out')) in groups
            for port in edge['pipe'].inlets + edge['pipe'].outlets:
                port.stagnant = stagnant
        for members in groups.values():
            for nid, side in members:
                for port in self._side_ports(nid, side):
                    port.stagnant = True

        # A section can lean on another one shut in behind it: resolve them in turn. A section waits while a
        # leak path at least as strong leads into one still unresolved, so the result does not depend on the
        # node order. Sections that wait on each other (a ring) start from the strongest known leak path of all.
        unresolved = dict(groups)

        def evaluate(members, wait_on_outlet=True):
            """(best leak path as (rank, -pressure, side), strongest rank still waiting, [(side, lo, hi)])"""
            best, pending, bounds = None, None, []
            for nid, side in members:
                rank = leak_rank.get(nid)
                if rank is None:
                    continue
                node = nodes[nid]
                other = 'out' if side == 'in' else 'in'
                if rank == LEAK_RELIEF_SEAT and side == 'in' and \
                        (node.forced_state == 'auto' or nid in self.held_closed_ids):
                    if wait_on_outlet and getattr(node, 'opening_depends_on_outlet', False) and find((nid, other)) in unresolved:
                        # The opening pressure follows the outlet: wait until the outlet section is resolved
                        pending = -math.inf
                        continue
                    p_open = node.inlet_opening_pressure_pa()
                    if p_open is not None:
                        bounds.append(((nid, side), -math.inf, p_open - RELIEF_SEAT_MARGIN_PA))
                other_ports = self._side_ports(nid, other)
                if not other_ports:
                    continue
                if find((nid, other)) in unresolved:
                    pending = rank if pending is None else min(pending, rank)
                    continue
                p_other = other_ports[0].pressure
                if rank == LEAK_CHECK_VALVE:
                    crack = node.cracking_pressure_bar * 100000.0
                    bounds.append(((nid, side), -math.inf, p_other + crack) if side == 'in'
                                  else ((nid, side), p_other - crack, math.inf))
                if best is None or (rank, -p_other) < best[:2]:
                    best = (rank, -p_other, (nid, side))
            return best, pending, bounds

        def passes(nid):
            return nid not in leak_rank

        def settle(entry, p, members):
            for port in self._side_ports(*entry):
                port.pressure = p
            self._carry_at_rest([entry], set(members) - {entry}, passes)

        while unresolved:
            evals = {root: evaluate(members) for root, members in unresolved.items()}
            ready = [r for r, (best, pending, _) in evals.items()
                     if best is not None and (pending is None or pending > best[0])]
            if not ready:
                candidates = [r for r, e in evals.items() if e[0] is not None]
                if not candidates:
                    break   # no leak path to a known pressure: the value from _fill_pruned_pressures stays
                ready = [min(candidates, key=lambda r: evals[r][0])]
                evals[ready[0]] = evaluate(unresolved[ready[0]], wait_on_outlet=False)
            for root in ready:
                best, _, bounds = evals[root]
                members = unresolved.pop(root)
                settle(best[2], -best[1], members)
                if not bounds:
                    continue
                # Shift the section to its limits, each taken at its own port. lo above hi: a check valve pushes
                # the section above a relief set pressure. lo wins, so the breach stays visible and the relief
                # passes open the device
                at = [self._side_ports(*side)[0].pressure for side, _, _ in bounds]
                shift = max(min(0.0, min(hi - p for (_, _, hi), p in zip(bounds, at))),
                            max(lo - p for (_, lo, _), p in zip(bounds, at)))
                if shift != 0.0:
                    settle(best[2], -best[1] + shift, members)
        return {nid for members in groups.values() for nid, _ in members}

    def _outlet_of(self, edge) -> int:
        """Index of the outlet the edge leaves its source from."""
        return self._parse_port_idx(edge.get('source_port', 'outlet-0'))

    def _parse_port_idx(self, port_str: str) -> int:
        try:
            return int(port_str.split('-')[-1])
        except (ValueError, IndexError, AttributeError):
            return 0

    def _src_port(self, edge, node):
        """Outlet port of `node` that the edge leaves from (not always port 0)."""
        idx = self._parse_port_idx(edge.get('source_port', 'outlet-0'))
        return node.outlets[idx] if idx < len(node.outlets) else node.outlets[0]

    def _tgt_port(self, edge, node):
        """Inlet port of `node` that the edge arrives at (not always port 0)."""
        idx = self._parse_port_idx(edge.get('target_port', 'inlet-0'))
        return node.inlets[idx] if idx < len(node.inlets) else node.inlets[0]

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
        part, part_edge = None, None    # the component being evaluated: named when its equations fail
        try:
            for _ in range(max_iterations):
                actual_iters += 1
                max_temp_change = 0.0
                for j, edge in enumerate(self.edges_list):
                    pipe = edge['pipe']
                    part, part_edge = pipe, edge
                    q = q_edges[j]
                    pipe.inlets[0].flow_rate = q
                    pipe.outlets[0].flow_rate = q
                    _, port, _, pipe_up, _ = self._upstream_end(edge, q)
                    pipe_up.temperature = port.temperature
                    pipe_up.density = port.density
                    pipe_up.viscosity = port.viscosity
                    pipe.calculate()
                for node_id, node in self.network.nodes.items():
                    part, part_edge = node, None
                    if isinstance(node, Tank):
                        node.calculate()
                        continue
                    old_temps = [p.temperature for p in node.outlets] + [p.temperature for p in node.inlets]
                    for j, edge, port in self.edges_into.get(node_id, ()):
                        if port is not None:
                            q = q_edges[j]
                            port.flow_rate = q
                            if q >= 0:
                                pipe_end = edge['pipe'].outlets[0]
                                port.temperature = pipe_end.temperature
                                port.density = pipe_end.density
                                port.viscosity = pipe_end.viscosity
                    for j, edge, port in self.edges_out_of.get(node_id, ()):
                        if port is not None:
                            q = q_edges[j]
                            port.flow_rate = q
                            if q < 0:
                                pipe_end = edge['pipe'].inlets[0]
                                port.temperature = pipe_end.temperature
                                port.density = pipe_end.density
                                port.viscosity = pipe_end.viscosity
                    if hasattr(node, 'calculate_temperature'):
                        node.calculate_temperature()
                    node.calculate()
                    new_temps = [p.temperature for p in node.outlets] + [p.temperature for p in node.inlets]
                    for old_t, new_t in zip(old_temps, new_temps):
                        max_temp_change = max(max_temp_change, abs(new_t - old_t))
                if actual_iters >= max_iterations:
                    break
                # A pass in a loop with a small through-flow moves little even far from the steady state: a settled
                # pass ends the propagation only when the mixing solve agrees within the outer loop's tolerance
                settled = max_temp_change < 0.01
                part = None
                if self._solve_mixing(q_edges, min_change=0.05 if settled else 0.0) < 0.05 and settled:
                    break
        except ValueError as e:
            if isinstance(e, ComponentRangeError) or part is None:
                raise
            raise ComponentRangeError(self._component_ref(part, part_edge), e) from e
        self.last_prop_iters = actual_iters
        self._fill_stagnant_temperatures(q_edges)

        # Restore all port pressures
        for node, (in_pressures, out_pressures) in saved_pressures.items():
            for port, p in zip(node.inlets, in_pressures):
                port.pressure = p
            for port, p in zip(node.outlets, out_pressures):
                port.pressure = p

    def _solve_mixing(self, q_edges, min_change=0.0):
        """The junction mixing of all nodes at once. In a loop of junctions with a small through-flow, a pass moves the
        loop temperature only by that small share of the difference, so the passes stop long before it settles.
        Unknown T_e: the temperature edge e carries away from its upstream node u,
            T_e = a_u * sum(w_i * (T_i + dT_i)) / sum(w_i) + b_e     over the edges i arriving at u
        with w = |Q| rho, dT the pipe's own temperature change, a_u the node's temperature slope and b_e its own
        heating, all taken from the current pass, so the next pass only refines what is nonlinear. The arriving edges
        follow select_inward (noise below Q_DEAD_LEG excluded). A pressure reference, a node without
        arriving flow and a dead leg keep their temperature. Writes T_e into the upstream port of every other edge
        when the largest change reaches min_change, and returns that change (0 when nothing was solved). Leaves the
        ports untouched when the system is singular (a loop that only circulates: the passes are its answer, returns
        0) or the solution is not finite or moves a temperature further outside the validity range of the fluid
        (returns inf: the passes have not been confirmed and go on)."""
        n = len(self.edges_list)
        if n == 0:
            return 0.0
        upstream, arriving = [], defaultdict(list)
        dT, w, t_arr = np.zeros(n), np.zeros(n), np.zeros(n)
        for j, edge in enumerate(self.edges_list):
            u, port, d, p_up, p_dn = self._upstream_end(edge, q_edges[j])
            upstream.append((u, port))
            arriving[id(d)].append(j)
            dT[j] = p_dn.temperature - p_up.temperature
            w[j] = abs(q_edges[j]) * p_dn.density
            t_arr[j] = p_dn.temperature

        mixes = {}      # per upstream node: (arriving edges, their sum of w, slope, linear mix, mean pipe dT)
        for u, _ in upstream:
            if id(u) in mixes:
                continue
            ins = arriving.get(id(u), ())
            ins = select_inward(ins, lambda i: abs(q_edges[i]))
            w_sum = sum(w[i] for i in ins)
            if is_pressure_reference(u) or w_sum <= 0.0:
                mixes[id(u)] = None
            else:
                mixes[id(u)] = (ins, w_sum, u.temperature_slope(), sum(w[i] * t_arr[i] for i in ins) / w_sum,
                                sum(w[i] * dT[i] for i in ins) / w_sum)
        rows, cols, vals = list(range(n)), list(range(n)), [1.0] * n
        rhs = np.zeros(n)
        free = np.zeros(n, dtype=bool)
        for j, (u, port) in enumerate(upstream):
            mix = mixes[id(u)]
            if mix is None or abs(q_edges[j]) <= Q_DEAD_LEG:
                rhs[j] = port.temperature
                continue
            free[j] = True
            ins, w_sum, a, t_mix, dT_mean = mix
            rhs[j] = port.temperature - a * t_mix + a * dT_mean
            for i in ins:
                rows.append(j)
                cols.append(i)
                vals.append(-a * w[i] / w_sum)
        if not free.any():
            return 0.0
        matrix = sp.csr_matrix((vals, (rows, cols)), shape=(n, n))
        try:
            # splu raises on a singular matrix instead of warning (warning filters are process-wide, solves threaded)
            t = np.atleast_1d(spla.splu(matrix.tocsc()).solve(rhs))
        except RuntimeError:
            return 0.0
        if not np.all(np.isfinite(t)):
            return math.inf
        fluids = {j: getattr(upstream[j][0].global_settings, 'fluid_type', 'water') for j in np.flatnonzero(free)}
        ranges = {f: FluidProperties.temperature_range_c(f) for f in set(fluids.values())}
        for j in np.flatnonzero(free):
            t_min, t_max = (v + 273.15 for v in ranges[fluids[j]])
            beyond = lambda T: max(t_min - T, T - t_max, 0.0)
            if beyond(t[j]) > beyond(upstream[j][1].temperature) + 1e-9:
                return math.inf  # e.g. a nearly closed loop heated without limit: left to the passes
        moved = max((abs(upstream[j][1].temperature - t[j]) for j in np.flatnonzero(free)), default=0.0)
        if moved < min_change:
            return moved
        for j in np.flatnonzero(free):
            port = upstream[j][1]
            if abs(port.temperature - t[j]) > 1e-9:
                # The next pass takes density and viscosity into the pipe with the temperature
                port.temperature = float(t[j])
                port.density = FluidProperties.get_density(fluids[j], port.temperature)
                port.viscosity = FluidProperties.get_viscosity(fluids[j], port.temperature)
        return moved

    def _fill_stagnant_temperatures(self, q_edges):
        """A dead leg (|Q| <= Q_DEAD_LEG) carries no fluid, so the flow sign gives its ports no temperature: they
        would keep whatever they held (the Port default on a fresh network), depending on the start. Each stagnant
        port takes the temperature of the nearest seed instead, walking through stagnant ports only. Seeds are the
        ports of a pressure reference (their own temperature) and the ports of a node with flow (a stagnant one takes
        the node's leaving temperature); seeds are never overwritten. A pipe has one temperature; crossing a stagnant node is one step, so the two sides
        of a closed check valve take the temperatures of their own neighbours. Pruned sections count as stagnant."""
        port_q = {}     # id(port) -> outward flow of the node port
        adj = defaultdict(list)
        for edge in self.all_edges_list:
            j = self.edge_pos.get(id(edge))
            q = q_edges[j] if j is not None else 0.0
            _, src, _, tgt = self.edge_ports[id(edge)]
            port_q[id(src)] = port_q.get(id(src), 0.0) + q
            port_q[id(tgt)] = port_q.get(id(tgt), 0.0) - q
            if abs(q) <= Q_DEAD_LEG:
                pipe = edge['pipe']
                chain = (src, pipe.inlets[0], pipe.outlets[0], tgt)
                for a, b in zip(chain, chain[1:]):
                    adj[id(a)].append((b, 0))
                    adj[id(b)].append((a, 0))

        dist, temp = {}, {}
        seeds, boundary = set(), set()
        queue = deque()

        def seed(p, t, rank):
            seeds.add(id(p))
            dist[id(p)], temp[id(p)] = (0, rank), t
            queue.append(p)

        # Seeds keep their temperature. Equally near seeds: references (boundaries and flow boundaries, whose
        # temperature is set) before live nodes, then by name and id, so the choice does not depend on node order
        for node in self.all_nodes_list:
            ports = node.inlets + node.outlets
            if is_pressure_reference(node):
                for p in ports:
                    boundary.add(id(p))
                    seed(p, p.temperature, (0, str(node.name), str(node.id)))
                continue
            leaving = [p for p in ports if port_q.get(id(p), 0.0) > Q_DEAD_LEG]
            if leaving:
                for p in ports:
                    live = abs(port_q.get(id(p), 0.0)) > Q_DEAD_LEG
                    seed(p, p.temperature if live else leaving[0].temperature, (1, str(node.name), str(node.id)))
            else:
                for a in ports:
                    adj[id(a)].extend((b, 1) for b in ports if b is not a)

        ports_by_id = {}
        while queue:    # 0-1 breadth-first search: pipes and connections cost 0, a stagnant node's inside 1
            p = queue.popleft()
            ports_by_id[id(p)] = p
            steps, rank = dist[id(p)]
            for nb, cost in adj[id(p)]:
                d = (steps + cost, rank)
                if id(nb) not in seeds and d < dist.get(id(nb), (math.inf,)):
                    dist[id(nb)], temp[id(nb)] = d, temp[id(p)]
                    if cost == 0:
                        queue.appendleft(nb)
                    else:
                        queue.append(nb)

        gs = getattr(self.network, 'global_settings', None) or (self.nodes_list[0].global_settings if self.nodes_list else None)
        fluid_type = getattr(gs, 'fluid_type', 'water')
        for pid, p in ports_by_id.items():
            if pid in boundary or p.temperature == temp[pid]:
                continue
            p.temperature = temp[pid]
            p.density = FluidProperties.get_density(fluid_type, p.temperature)
            p.viscosity = FluidProperties.get_viscosity(fluid_type, p.temperature)

RELIEF_NODE_TYPES = ('pressure_safety_valve', 'rupture_disc')
# The check valve with orifice is no leak path: its bypass orifice always ties both sides together
CHECK_VALVE_TYPES = ('check_valve',)
# Leak paths out of a shut-in section, strongest first (ROADMAP "Undefined Pressure in Stagnant Branches")
LEAK_STOPPED_PUMP, LEAK_CHECK_VALVE, LEAK_RELIEF_SEAT = 0, 1, 2
RELIEF_SEAT_MARGIN_PA = 1.0     # a stagnant section stays this far below a closed relief device's set pressure
RELIEF_RAMP_MAX_SOLVES = 24     # bisection steps per opening (λ resolution 2⁻²⁴)
RELIEF_RAMP_TOL_PA = 100.0      # 1 mbar: inlet pressure at the opening snapshot vs set pressure
RELIEF_RAMP_TOL_LAM = 1e-4


def _telemetry_max_pressure_bara(tel) -> float:
    """Maximum pressure (bar(a)) over all node and edge ports of a telemetry dict."""
    max_pa = 0.0
    for group in ("nodes", "edges"):
        for item in (tel or {}).get(group, {}).values():
            for p in item.get("inlets", []) + item.get("outlets", []) + (item.get("ports") or []):
                p_val = (p or {}).get("pressure")
                if isinstance(p_val, (int, float)) and p_val > max_pa:
                    max_pa = p_val
    return max_pa / 100000.0 if max_pa > 0 else 1.01325


def _inlet_pressure_bara(tel, node_id):
    inlets = (tel or {}).get("nodes", {}).get(node_id, {}).get("inlets") or []
    p = inlets[0].get("pressure") if inlets else None
    return round(p / 100000.0, 3) if isinstance(p, (int, float)) else None


def _outlet_pressure_barg(tel, node_id, p_atm):
    outlets = (tel or {}).get("nodes", {}).get(node_id, {}).get("outlets") or []
    p = outlets[0].get("pressure") if outlets else None
    return (p - p_atm) / 100000.0 if isinstance(p, (int, float)) else None


# Backpressure limit (% of set) per PSV type: conventional on the built-up, balanced bellows on the total
# backpressure; a pilot valve is independent of backpressure
BACKPRESSURE_LIMITS = {"conventional": ("built_up", 10.0), "balanced_bellows": ("total", 50.0)}


def _backpressure_result(node, k, tel_relieved, tel_closed):
    """Superimposed (device closed), built-up (relieving) and total backpressure of a PSV, in barg and % of set."""
    valve_type = getattr(node, "valve_type", None)
    if valve_type is None:
        return {}
    p_atm = node.p_atm
    total = _outlet_pressure_barg(tel_relieved, k, p_atm)
    relieving = node.status not in ("closed", "intact")
    # A closed valve sees the final outlet pressure, including what other devices relieve into its header
    superimposed = _outlet_pressure_barg(tel_closed, k, p_atm) if relieving else total
    if total is None or superimposed is None:
        return {}
    built_up = max(0.0, total - superimposed) if relieving else 0.0
    basis, limit = BACKPRESSURE_LIMITS.get(valve_type, (None, None))
    pct = None
    if basis is not None:
        pct = 100.0 * (built_up if basis == "built_up" else total) / node.set_pressure_barg
    return {
        "superimposed_bp_barg": round(superimposed, 4),
        "built_up_bp_barg": round(built_up, 4),
        "total_bp_barg": round(total if relieving else superimposed, 4),
        "bp_basis": basis,
        "bp_pct_of_set": round(pct, 2) if pct is not None else None,
        "bp_limit_pct": limit,
        "bp_exceeded": bool(relieving and pct is not None and pct > limit),
    }


def _find_relief_openings(network, opening_groups, auto_ids, original_states, extract_telemetry_fn):
    """
    Steady state at the moment each relief device opens.

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
        return [], "No ramped driver: enable 'Ramp during relief analysis' on a pump or boundary."

    ramp_solver = NetworkSolver(net)
    ramp_solver.persist_warm_start = False
    ramp_solver.held_closed_ids = set(auto_ids)
    openings = []
    try:
        for g_idx, group_ids in enumerate(opening_groups):
            earlier = {k for grp in opening_groups[:g_idx] for k in grp}
            for k in auto_ids:
                net.nodes[k].forced_state = "auto" if k in earlier else "forced_closed"
            group_nodes = [(k, net.nodes[k]) for k in group_ids]

            best = None   # (|margin|, λ)

            def margin_at(lam):
                for d in drivers:
                    d.apply_relief_ramp(lam)
                for k in auto_ids:
                    net.nodes[k].reset_run_state()
                stats = ramp_solver.solve()
                if not stats.get("success"):
                    return None
                return max(node.opening_margin_pa() for _, node in group_nodes)

            # The group breached its set pressure at λ = 1 (that is why it opened); below its
            # set pressure at λ = 0 (drivers at rest).
            lo, hi = 0.0, 1.0
            for _ in range(RELIEF_RAMP_MAX_SOLVES):
                lam = 0.5 * (lo + hi)
                margin = margin_at(lam)
                if margin is None:
                    return openings, f"Relief ramp did not converge at {lam * 100:.1f} % driver load."
                if best is None or abs(margin) < best[0]:
                    best = (abs(margin), lam)
                if margin >= 0.0:
                    hi = lam
                else:
                    lo = lam
                if abs(margin) < RELIEF_RAMP_TOL_PA or hi - lo < RELIEF_RAMP_TOL_LAM:
                    break

            _, lam = best
            # Telemetry only for the chosen λ (re-solved once) instead of at every bisection step
            if margin_at(lam) is None:
                return openings, f"Relief ramp did not converge at {lam * 100:.1f} % driver load."
            tel = extract_telemetry_fn(net)
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
    """Runs the sequential relief passes and always restores the user's forced_state, even if a solve raises."""
    saved = {k: node.forced_state for k, node in network.nodes.items()
             if getattr(node, 'node_type', '') in RELIEF_NODE_TYPES}
    try:
        return _run_sequential_relief_passes(network, solver, extract_telemetry_fn)
    finally:
        for k, state in saved.items():
            network.nodes[k].forced_state = state
        solver.held_closed_ids = set()


def _run_sequential_relief_passes(network, solver, extract_telemetry_fn):
    """
    Executes sequential multi-pass relief valve popping physics.
    Pass 1: Lock all relief valves forced_closed to calculate unmitigated baseline.
    Passes 2+: Sequentially unlock relief devices starting with the lowest setpoint first.
             Only unlock higher setpoint devices if lower setpoint devices fail to suppress overpressure.
    Then the opening of each device is located on a ramp of the relief drivers.

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
    first_warm_start_status = first_stats.get("warm_start_status")   # Report the user's run, not the last pass
    telemetry_unmitigated = extract_telemetry_fn(network)

    # Devices the user forced open or closed return to that state for the relieved passes
    for k, node in psv_items:
        node.forced_state = original_states[k]

    # Initialize sequential states for Mitigated passes
    auto_psv_nodes = [node for node in psv_nodes if original_states[key_of[id(node)]] == "auto"]
    auto_ids_all = [key_of[id(node)] for node in auto_psv_nodes]

    for node in auto_psv_nodes:
        node.forced_state = "forced_closed"
        node.reset_run_state()
    solver.held_closed_ids = set(auto_ids_all)   # still 'auto' for the user: leakage alone does not lift them

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
                set_p = node.set_pressure_bara
                # The opening driver (inlet gauge, differential or pilot pressure) reaches its threshold
                if node.inlets and node.opening_margin_pa() >= 0.0:
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
    # The passes held auto devices closed by the method; the caller's network and the telemetry keep the user's state
    for k, node in psv_items:
        node.forced_state = original_states[k]
    for tel in (telemetry_mitigated, telemetry_unmitigated):
        for k in auto_ids_all:
            if k in tel.get("nodes", {}):
                tel["nodes"][k]["forced_state"] = original_states[k]
    if stats is not None and first_warm_start_status is not None:
        stats["warm_start_status"] = first_warm_start_status

    # =========================================================================
    # RELIEF CONTINGENCY PRESSURE METRICS (ALL IN BARA / BAR ABSOLUTE)
    # -------------------------------------------------------------------------
    # 1. Relieved: steady-state max pressure with the relief devices in their final state.
    # 2. Peak: highest max pressure over the opening snapshots (each device exactly at its
    #    set pressure, found on the driver ramp) and the relieved state.
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
        # Superimposed backpressure: the outlet while the device is still closed, at its opening snapshot
        backpressure = _backpressure_result(node, k, telemetry_mitigated, op["telemetry"] if op else telemetry_unmitigated)
        if backpressure and k in telemetry_mitigated.get("nodes", {}):
            telemetry_mitigated["nodes"][k]["backpressure"] = backpressure
        devices[k] = {
            "set_pressure_barg": node.set_pressure_barg,
            "set_pressure_bara": round(node.set_pressure_bara, 5),
            "forced_state": original_states[k],
            "status": node_tel.get("status"),
            "opening_order": order,
            "opening_ramp_pct": round(op["ramp"] * 100.0, 1) if op else None,
            "inlet_at_opening_bara": _inlet_pressure_bara(op["telemetry"], k) if op else None,
            "inlet_relieved_bara": _inlet_pressure_bara(telemetry_mitigated, k),
            "inlet_unmitigated_bara": _inlet_pressure_bara(telemetry_unmitigated, k),
            "relief_flow_lmin": round(abs(flow) * 60000.0, 2),
            "lift_pct": node_tel.get("lift_pct"),
            "cycle_low_barg": node_tel.get("cycle_low_barg"),
            "cycle_high_barg": node_tel.get("cycle_high_barg"),
            "valve_type": node_tel.get("valve_type"),
            **backpressure,
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
