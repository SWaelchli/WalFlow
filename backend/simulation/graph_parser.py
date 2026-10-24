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
from simulation.equipment.measure_point import MeasurePoint
from simulation.equipment.heat_exchanger import HeatExchanger
from simulation.equipment.filter import Filter
from simulation.equipment.remote_control_valve import RemoteControlValve
from simulation.equipment.three_way_tcv import ThreeWayTCV
from simulation.equipment.check_valve import CheckValve
from simulation.equipment.check_valve_orifice import CheckValveOrifice
from simulation.equipment.pressure_safety_valve import PressureSafetyValve
from simulation.equipment.rupture_disc import RuptureDisc
from simulation.equipment.calibrated_restriction import CalibratedRestriction
from simulation.equipment.reducer import Reducer
from simulation.equipment.pressure_source import PressureSource

from simulation.equipment.flow_source import FlowSource
from simulation.equipment.base_node import HydraulicNode, MIN_PUMP_EFFICIENCY
from simulation.fluid_utils import FluidProperties


class ModelInputError(ValueError):
    """Invalid or missing user input in the diagram. The message names the component and is
    safe to show to the user unchanged."""


def _relief_pressure_barg(d: dict, key: str, name: str, what: str) -> float:
    """Relief set / burst pressure in barg. Files from before the switch store bar(a) under
    another key and are not converted: the device must be re-entered from its datasheet."""
    value = d.get(key)
    if value is None or value == '':
        raise ModelInputError(f"'{name}': {what} (barg) missing. Enter the {what} from the datasheet as gauge pressure.")
    value = float(value)
    if value <= 0.0:
        raise ModelInputError(f"'{name}': {what} must be above 0 barg.")
    return value

def _parse_signal_handle(handle) -> tuple:
    """(port type, port index) of a signal line's source handle, e.g. "signal-inlet-0" or "inlet-0";
    anything else senses outlet 0 (legacy node-level sensing)."""
    parts = str(handle or "").split('-')
    if len(parts) >= 2 and parts[-1].isdigit() and parts[-2] in ("inlet", "outlet"):
        return parts[-2], int(parts[-1])
    return "outlet", 0


class GraphParser:
    @staticmethod
    def _npsh_value(d: dict, key: str, default: float, name: str) -> float:
        """NPSHr / NPSH margin in m; empty = default, negative is an input error."""
        v = d.get(key)
        v = default if v in (None, '') else float(v)
        if v < 0.0:
            raise ModelInputError(f"'{name}': {key.replace('_m', '').upper().replace('_', ' ')} must not be negative.")
        return v

    @staticmethod
    def _max_discharge_pa(d: dict, name: str) -> float:
        """Outlet pressure limit of a PD pump / flow source: bar(a) in the file, Pa(a) in the model (50 bar(a) default)."""
        bara = d.get('max_discharge_pressure_bara')
        bara = 50.0 if bara is None else float(bara)
        if bara <= 1.0:
            raise ModelInputError(f"'{name}': max. discharge pressure must be above 1 bar(a).")
        return bara * 100000.0

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
        resolved_global_settings = graph.global_settings.model_copy() if graph.global_settings else None
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
    def _validate_fluids(graph: ReactFlowGraph) -> None:
        """A fluid id that is not in the catalog is an input error (no silent water default)."""
        gs_fluid = getattr(graph.global_settings, 'fluid_type', None) if graph.global_settings else None
        ids = [("System fluid", gs_fluid or 'water')]
        for node in graph.nodes:
            if node.type == 'tank':
                continue  # tank fluid_type is ignored
            f = (node.data or {}).get('fluid_type')
            if f and f != 'system':
                ids.append((f"'{(node.data or {}).get('label') or node.id}': fluid", f))
        for what, fid in ids:
            if fid not in FluidProperties.FLUIDS:
                raise ModelInputError(f"{what} '{fid}' is not in the fluid catalog. Select a fluid from the list.")

    @staticmethod
    def parse_graph(graph: ReactFlowGraph, case_id: Optional[str] = None) -> HydraulicNetwork:
        """
        Converts a React Flow graph into a HydraulicNetwork, layering operating case overrides if specified.
        """
        resolved_graph = GraphParser.resolve_graph_for_case(graph, case_id)
        GraphParser._validate_fluids(resolved_graph)

        # 1. Instantiate Equipment Nodes (ignoring non-hydraulic visual annotations and instrument bubbles;
        #    signal edges into an instrument are then dropped below because their target is not a node)
        nodes_dict: Dict[str, HydraulicNode] = {}
        for node_data in resolved_graph.nodes:
            if node_data.type in ['text_bubble', 'note', 'annotation', 'instrument']:
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
                if isinstance(target_node, PressureSafetyValve):
                    # Pilot sensing line
                    # (only a pilot-operated valve reads it; the first line wins, as the setup panel shows it)
                    if target_node.valve_type == 'pilot' and source_node is not None and target_node.pilot_source is None:
                        port_type, port_idx = _parse_signal_handle(edge.sourceHandle)
                        ports = source_node.inlets if port_type == "inlet" else source_node.outlets
                        if port_idx < len(ports) and source_node is not target_node:
                            target_node.remote_sensing_config = {"node_id": edge.source, "port_type": port_type, "port_idx": port_idx}
                            target_node.pilot_source = (source_node, port_type, port_idx)
                elif isinstance(target_node, RemoteControlValve):
                    port_type, port_idx = _parse_signal_handle(edge.sourceHandle)
                    target_node.remote_sensing_config = {
                        "node_id": edge.source,
                        "port_type": port_type,
                        "port_idx": port_idx
                    }
                continue # Do not create a Pipe for signal edges

            # Create a Pipe node for this hydraulic edge
            pipe_name = edge.label or edge_data.get('label') or f"Pipe {edge.id}"
            
            # Pipe data in the file: length_m (m), diameter_m (m), roughness_mm (mm; default 0.045)
            try:
                roughness_m = 0.000045
                if edge_data.get('roughness_mm') is not None:
                    roughness_m = float(edge_data['roughness_mm']) / 1000.0
                length = float(edge_data.get('length_m', 25.0))
                diameter = float(edge_data.get('diameter_m', 0.1))
            except (ValueError, TypeError) as e:
                raise ModelInputError(f"Pipe '{pipe_name}': length, diameter or roughness is empty or not a number ({e}).") from e
            if diameter <= 0.0:
                raise ModelInputError(f"Pipe '{pipe_name}': diameter must be above 0.")
            if length < 0.0 or roughness_m < 0.0:
                raise ModelInputError(f"Pipe '{pipe_name}': length and roughness must not be negative.")

            pipe = Pipe(
                name=pipe_name,
                length=length,
                diameter=diameter,
                roughness=roughness_m
            )
            pipe.global_settings = resolved_graph.global_settings

            
            source_node = nodes_dict.get(edge.source)
            target_node = nodes_dict.get(edge.target)
            
            if source_node and target_node:
                parsed_edges.append({
                    "id": edge.id,
                    "label": pipe_name,
                    "source": edge.source,
                    "target": edge.target,
                    "source_port": edge.sourceHandle,
                    "target_port": edge.targetHandle,
                    "pipe": pipe
                })

        # Auto-detect connected pipe diameter for Orifice, CheckValveOrifice, and RuptureDisc nodes
        for node_id, node in nodes_dict.items():
            if (hasattr(node, 'orifice_diameter') or node.node_type == 'calibrated_restriction'
                    or getattr(node, 'bore_type', '') == 'reduced_bore'
                    # IEC 60534-2-1 Annex A F_R takes the valve size from the line
                    or node.node_type in ('linear_control_valve', 'remote_control_valve', 'three_way_tcv')):
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
        """Builds one equipment node; unreadable numeric fields become a ModelInputError naming the component."""
        try:
            node = GraphParser._build_node(node_data, global_settings)
        except ModelInputError:
            raise
        except (ValueError, TypeError) as e:
            name = (node_data.data or {}).get('label') or f"{node_data.type}_{node_data.id}"
            raise ModelInputError(f"'{name}': a numeric field is empty or not a number ({e}).") from e
        GraphParser._check_node_geometry(node, node_data)
        return node

    @staticmethod
    def _check_node_geometry(node: HydraulicNode, node_data: ReactFlowNode) -> None:
        """Rated values used as divisors must be above zero."""
        name = (node_data.data or {}).get('label') or f"{node_data.type}_{node_data.id}"
        if node_data.type == 'heat_exchanger' and node.rated_flow_lmin <= 0.0:
            raise ModelInputError(f"'{name}': rated flow must be above 0 L/min.")
        if node_data.type in ('linear_control_valve', 'remote_control_valve', 'three_way_tcv'):
            # IEC 60534-2-1 style factors divide and take roots in F_R
            if not 0.0 < node.fl <= 1.0:
                raise ModelInputError(f"'{name}': F_L must be above 0 and at most 1.")
            if node.fd <= 0.0:
                raise ModelInputError(f"'{name}': F_d must be above 0.")

    @staticmethod
    def _check_calibration_point(node: CalibratedRestriction, name: str) -> None:
        """A calibrated restriction needs a positive flow and a positive pressure drop at the calibration point."""
        if node.flow_base_lmin <= 0:
            raise ModelInputError(f"'{name}': calibration flow must be above 0 L/min.")
        if node.outlet_pressure_base_bar <= 0:
            raise ModelInputError(f"'{name}': calibration outlet pressure must be above 0 bar(a).")
        if node.inlet_pressure_base_bar <= node.outlet_pressure_base_bar:
            raise ModelInputError(f"'{name}': calibration inlet pressure must be above the outlet pressure.")
        if node.temp_base_c <= -273.15:
            raise ModelInputError(f"'{name}': calibration temperature must be above absolute zero.")

    @staticmethod
    def _build_node(node_data: ReactFlowNode, global_settings: Any = None) -> HydraulicNode:
        t = node_data.type
        d = node_data.data
        name = d.get('label', f"{t}_{node_data.id}")
        
        node = None
        if t == 'tank':
            # A tank always uses the system fluid (a stale per-tank fluid_type in old files is ignored)
            fluid_type = getattr(global_settings, 'fluid_type', None) or 'water'

            node = Tank(
                name=name,
                elevation=float(d.get('elevation_m', 0.0)),
                fluid_level=float(d.get('level_m', 1.0)),
                temperature=float(d.get('temperature_k', 293.15)),
                fluid_type=fluid_type
            )
        elif t == 'centrifugal_pump' or t == 'pump':
            flow_rated_lmin = float(d.get('flow_rated_lmin', 100.0))
            rise_pct = float(d.get('rise_to_shutoff_pct', 20.0))
            # D1 (B1a): pumps are rated in head. Older files only have pressure_rated_bar and
            # are deliberately not converted; the user enters the head once.
            head_m = d.get('head_rated_m')
            if head_m is None or float(head_m) <= 0:
                raise ModelInputError(f"Pump '{name}': rated head missing. Enter the rated head (m) in the pump inspector.")
            eff_pct = float(d.get('efficiency_pct', 75.0))
            if not 100.0 * MIN_PUMP_EFFICIENCY <= eff_pct <= 100.0:
                raise ModelInputError(f"Pump '{name}': efficiency must be between {100.0 * MIN_PUMP_EFFICIENCY:g} and 100 %.")

            node = CentrifugalPump(
                name=name,
                flow_rated=flow_rated_lmin / 60000.0,
                head_rated=float(head_m),
                rise_to_shutoff_pct=rise_pct,
                efficiency=eff_pct / 100.0,
                npshr_m=GraphParser._npsh_value(d, 'npshr_m', 0.0, name),
                npsh_margin_m=GraphParser._npsh_value(d, 'npsh_margin_m', 0.5, name)
            )
        elif t == 'volumetric_pump':
            # flow_rated_lmin in L/min -> convert to m3/s
            flow_lmin = float(d.get('flow_rated_lmin', 100.0))
            flow_m3s = flow_lmin / 60000.0
            
            # motor_power_kw in kW -> convert to W
            power_kw = float(d.get('motor_power_kw', 5.0))
            power_w = power_kw * 1000.0
            
            # efficiency_pct in % -> convert to decimal
            eff_pct = float(d.get('efficiency_pct', 85.0))
            if not 100.0 * MIN_PUMP_EFFICIENCY <= eff_pct <= 100.0:
                raise ModelInputError(f"Pump '{name}': efficiency must be between {100.0 * MIN_PUMP_EFFICIENCY:g} and 100 %.")
            eff_dec = eff_pct / 100.0

            node = VolumetricPump(
                name=name,
                flow_rated=flow_m3s,
                motor_power=power_w,
                efficiency=eff_dec,
                drive_type=str(d.get('drive_type', 'fixed_speed')),
                max_discharge_pressure=GraphParser._max_discharge_pa(d, name),
                npshr_m=GraphParser._npsh_value(d, 'npshr_m', 0.0, name),
                npsh_margin_m=GraphParser._npsh_value(d, 'npsh_margin_m', 0.5, name)
            )
        elif t == 'linear_control_valve':
            node = LinearControlValve(
                name=name,
                max_cv=float(d.get('max_cv', 0.05)),
                opening_pct=float(d.get('opening_pct', 50.0)),
                fl=float(d.get('fl', 0.9)),
                fd=float(d.get('fd', 0.46))
            )
        elif t == 'remote_control_valve':
            node = RemoteControlValve(
                name=name,
                max_cv=float(d.get('max_cv', 0.05)),
                set_pressure=float(d.get('set_pressure_pa', 500000.0)),
                backpressure=bool(d.get('backpressure', False)),
                fl=float(d.get('fl', 0.9)),
                fd=float(d.get('fd', 0.46))
            )
        elif t == 'linear_regulator':
            node = LinearRegulator(
                name=name,
                max_cv=float(d.get('max_cv', 0.05)),
                set_pressure=float(d.get('set_pressure_pa', 500000.0)),
                backpressure=bool(d.get('backpressure', False))
            )
        elif t == 'orifice':
            node = Orifice(
                name=name,
                pipe_diameter=float(d.get('pipe_diameter_m', 0.1)),
                orifice_diameter=float(d.get('orifice_diameter_m', 0.07)),
                standard=str(d.get('standard', 'iso_5167'))
            )
        elif t == 'calibrated_restriction':
            node = CalibratedRestriction(
                name=name,
                flow_base_lmin=float(d.get('flow_base_lmin', 10.0)),
                inlet_pressure_base_bar=float(d.get('inlet_pressure_base_bara', 3.5)),
                outlet_pressure_base_bar=float(d.get('outlet_pressure_base_bara', 1.0)),
                temp_base_c=float(d.get('temp_base_c', 45.0)),
                restriction_model=str(d.get('restriction_model', 'orifice')),
                fluid_type=str(d.get('fluid_type', 'system'))
            )
            GraphParser._check_calibration_point(node, name)
        elif t == 'reducer' or t == 'expander':
            # Diameters / length in meters. Missing or null values fall back to the
            # Reducer defaults (DN80 x DN50 STD), which coerces each field itself; 0 or below is an input error.
            for field in ('diameter_in_m', 'diameter_out_m', 'length_m'):
                if d.get(field) is not None and float(d[field]) <= 0.0:
                    raise ModelInputError(f"Reducer '{name}': {field} must be above 0.")
            roughness_mm = d.get('roughness_mm')
            if roughness_mm is not None and float(roughness_mm) < 0.0:
                raise ModelInputError(f"Reducer '{name}': roughness_mm must not be negative.")
            node = Reducer(
                name=name,
                diameter_in=d.get('diameter_in_m'),
                diameter_out=d.get('diameter_out_m'),
                length=d.get('length_m'),
                cone_angle_deg=d.get('cone_angle_deg'),
                reducer_type=d.get('reducer_type'),
                standard=d.get('standard'),
                dn_large=d.get('dn_large'),
                dn_small=d.get('dn_small'),
                sch_large=d.get('sch_large'),
                sch_small=d.get('sch_small'),
                roughness=float(roughness_mm) / 1000.0 if roughness_mm is not None else None
            )
        elif t == 'heat_exchanger':
            # A missing rated pressure drop means the inspector default (0.5 bar), not "no drop"
            rated_flow = float(d.get('rated_flow_lmin', 500.0))
            rated_dp = float(d.get('rated_dp_bar', 0.5))

            node = HeatExchanger(
                name=name,
                rated_cooling_kw=float(d.get('rated_cooling_kw', 300.0)),
                rated_flow_lmin=rated_flow,
                design_inlet_temp_c=float(d.get('design_inlet_temp_c', 50.0)),
                medium_temp_c=float(d.get('medium_temp_c', 10.0)),
                rated_dp_bar=rated_dp,
                cooler_type=str(d.get('cooler_type', 'water_cooled')),
                rating_method=str(d.get('rating_method', 'rated_duty')),
                design_outlet_temp_c=float(d.get('design_outlet_temp_c', 40.0)),
                ua_direct_w_k=float(d.get('ua_direct_w_k', 1000.0))
            )
        elif t == 'filter':
            node = Filter(
                name=name,
                dp_clean_bar=float(d.get('dp_clean_bar', 0.2)),
                dp_terminal_bar=float(d.get('dp_terminal_bar', 1.0)),
                flow_ref_lmin=float(d.get('flow_ref_lmin', 100.0)),
                clogging_pct=float(d.get('clogging_pct', 0.0)),
                ref_viscosity_mpas=(float(d['ref_viscosity_mpas']) if d.get('ref_viscosity_mpas') not in (None, '') else None)
            )
        elif t == 'splitter':
            # 1 inlet, 2 outlets
            node = Splitter(name=name, num_outlets=2)
        elif t == 'mixer':
            # 2 inlets, 1 outlet
            node = Mixer(name=name, num_inlets=2)
        elif t == 'measure_point':
            # In-line tap: zero pressure drop, sensed through its pin (signal-inlet-0)
            node = MeasurePoint(name=name)
        elif t == 'three_way_tcv':
            node = ThreeWayTCV(
                name=name,
                max_cv=float(d.get('max_cv', 0.1)),
                set_temperature=float(d.get('set_temperature_c', 40.0)) + 273.15,
                hot_port_idx=int(d.get('hot_port_idx', 0)),
                fl=float(d.get('fl', 0.9)),
                fd=float(d.get('fd', 0.46))
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
                pipe_diameter=float(d.get('pipe_diameter_m', 0.1)),
                orifice_diameter=float(d.get('orifice_diameter_m', 0.01))
            )
        elif t == 'pressure_safety_valve' or t == 'psv':
            node = PressureSafetyValve(
                name=name,
                set_pressure_barg=_relief_pressure_barg(d, 'set_pressure_barg', name, "set pressure"),
                cv=float(d.get('cv', 10.0)),
                action_mode=str(d.get('action_mode', 'pop_action')),
                blowdown_pct=float(d.get('blowdown_pct', 7.0)),
                forced_state=str(d.get('forced_state', 'auto')),
                valve_type=str(d.get('valve_type', 'conventional')),
                design_superimposed_bp_barg=float(d.get('design_superimposed_bp_barg') or 0.0)
            )
        elif t == 'rupture_disc':
            node = RuptureDisc(
                name=name,
                burst_pressure_barg=_relief_pressure_barg(d, 'burst_pressure_barg', name, "burst pressure"),
                bore_type=str(d.get('bore_type', 'full_bore')),
                cv=float(d.get('cv', 10.0)),
                pipe_diameter=float(d.get('pipe_diameter_m', 0.05248)),
                orifice_diameter=float(d.get('orifice_diameter_m', 0.01)),
                forced_state=str(d.get('forced_state', 'auto'))
            )
        elif t == 'pressure_source':
            source_pressure_pa = float(d.get('source_pressure_bara', 6.0)) * 100_000.0
            temperature_k = float(d.get('temperature_k', 293.15))
            node = PressureSource(
                name=name,
                source_pressure=source_pressure_pa,
                temperature=temperature_k,
            )
        elif t == 'flow_source':
            source_flow_m3s = float(d.get('source_flow_lmin', 50.0)) / 60_000.0
            temperature_k = float(d.get('temperature_k', 293.15))
            node = FlowSource(
                name=name,
                source_flow=source_flow_m3s,
                temperature=temperature_k,
                max_discharge_pressure=GraphParser._max_discharge_pa(d, name),
            )
        else:
            node = HydraulicNode(name=name, node_type=t)
        
        if node:
            node.global_settings = global_settings
            if 'active' in d:
                node.active = bool(d['active'])
            if 'relief_ramp_enabled' in d:
                node.relief_ramp_enabled = bool(d['relief_ramp_enabled'])
        return node
