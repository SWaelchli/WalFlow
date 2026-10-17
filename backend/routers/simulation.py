from fastapi import APIRouter, HTTPException, Request, status
from typing import List, Dict, Any
import math
import traceback

import numpy as np

from simulation.schemas import ReactFlowGraph, BatchSimulationResponse, BatchCaseResult, OperatingCase
from simulation.graph_parser import GraphParser, ModelInputError
from simulation.solver import NetworkSolver, run_sequential_relief_simulation
from simulation.equipment.volumetric_pump import VolumetricPump
from simulation.equipment.centrifugal_pump import CentrifugalPump
from simulation.fluid_utils import FluidProperties
from limiter import limiter
from simulation.limits import SolveTimeout, solve_deadline, solve_slot, max_nodes, max_cases

router = APIRouter(prefix="/api/simulation", tags=["simulation"])

def numpy_json_default(obj):
    """json.dumps fallback: converts numpy scalars/arrays so a stray numpy value can't fail the response."""
    if isinstance(obj, np.generic):
        return obj.item()
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    raise TypeError(f"Object of type {obj.__class__.__name__} is not JSON serializable")

def sanitize_non_finite(obj, _path="", _found=None):
    """F2-15: replace NaN/Infinity with None so the reply is valid JSON.

    Returns (clean_copy, paths) where paths lists the first few fields that were not finite,
    e.g. "telemetry.HX-1.temperature_out". The caller reports them as a solver warning.
    """
    top = _found is None
    if top:
        _found = []
    if isinstance(obj, np.generic):
        obj = obj.item()
    if isinstance(obj, dict):
        out = {k: sanitize_non_finite(v, f"{_path}.{k}" if _path else str(k), _found)[0] for k, v in obj.items()}
    elif isinstance(obj, (list, tuple)):
        out = [sanitize_non_finite(v, f"{_path}[{i}]", _found)[0] for i, v in enumerate(obj)]
    elif isinstance(obj, np.ndarray):
        out = sanitize_non_finite(obj.tolist(), _path, _found)[0]
    elif isinstance(obj, float) and not math.isfinite(obj):
        _found.append(_path)
        out = None
    else:
        out = obj
    return out, _found


def sanitize_result(stats, **sections):
    """Sanitise stats and result sections; non-finite fields are listed in stats['non_finite_fields']."""
    clean_stats, found = sanitize_non_finite(stats, "stats")
    clean = {}
    for name, value in sections.items():
        clean[name], f = sanitize_non_finite(value, name)
        found += f
    if found:
        clean_stats = dict(clean_stats)
        clean_stats["non_finite_fields"] = found[:20]
        clean_stats["non_finite_count"] = len(found)
    return clean_stats, clean


THROTTLING_TYPES = {"linear_control_valve", "linear_regulator", "remote_control_valve", "orifice", "calibrated_restriction",
                    "check_valve", "check_valve_orifice", "three_way_tcv"}


def _outlet_below_vapor_pressure(network, node) -> bool:
    """F1-28: a throttling device whose downstream pressure is below the vapour pressure flashes / cavitates."""
    fluid = getattr(getattr(network, 'global_settings', None), 'fluid_type', 'water')
    for port in node.outlets:
        if port.flow_rate > 0.0 and port.pressure < FluidProperties.get_vapor_pressure(fluid, port.temperature):
            return True
    return False


def calculate_case_kpis(network, telemetry: Dict[str, Any], stats: Dict[str, Any]) -> Dict[str, Any]:
    """
    Computes key performance indicators (KPIs) for an operating case simulation run.
    """
    max_p_pa = 0.0
    min_p_pa = 1e12
    total_pump_power_w = 0.0
    total_flow_m3s = 0.0
    has_cavitation = False
    
    node_telemetry = telemetry.get("nodes", {})
    
    # Iterate nodes to aggregate system parameters
    for node_id, node in network.nodes.items():
        node_tel = node_telemetry.get(node_id, {})
        
        # Check inlet/outlet pressures
        for inlet in node_tel.get("inlets", []):
            p = inlet.get("pressure", 101325.0)
            if p > max_p_pa: max_p_pa = p
            if p < min_p_pa: min_p_pa = p
        for outlet in node_tel.get("outlets", []):
            p = outlet.get("pressure", 101325.0)
            if p > max_p_pa: max_p_pa = p
            if p < min_p_pa: min_p_pa = p
            
        if node_tel.get("cavitation_warning", False) or node_tel.get("flashing_warning", False):
            has_cavitation = True

        # Aggregate pump power & flow: shaft power QÂ·Î”P/Î· at the actual operating point,
        # stopped pumps count 0 (F1-36)
        if isinstance(node, (VolumetricPump, CentrifugalPump)):
            total_pump_power_w += node.shaft_power()
            for outlet in node.outlets:
                total_flow_m3s += abs(outlet.flow_rate)

    if min_p_pa > 1e11:
        min_p_pa = 101325.0

    kpi_res = {
        "max_pressure_bar": round(max_p_pa / 100000.0, 2),
        "min_pressure_bar": round(min_p_pa / 100000.0, 2),
        "total_flow_lmin": round(total_flow_m3s * 60000.0, 2),
        "total_pump_power_kw": round(total_pump_power_w / 1000.0, 2),
        "has_cavitation_warning": has_cavitation,
        "iterations": stats.get("outer_iterations", stats.get("iterations", 0)),
        "residual": stats.get("bottleneck", {}).get("magnitude", 0.0) if stats.get("bottleneck") else stats.get("residual", 0.0)
    }

    # Preserve relief contingency pressure metrics calculated by the solver in telemetry
    if telemetry and "kpis" in telemetry:
        for k in ["relieved_pressure_bara", "peak_pressure_bara", "unmitigated_peak_pressure_bara"]:
            if k in telemetry["kpis"]:
                kpi_res[k] = telemetry["kpis"][k]

    return kpi_res

def extract_telemetry(network) -> Dict[str, Any]:
    """Canonical telemetry extraction function for both REST and WebSocket simulation runs."""
    telemetry = {"nodes": {}, "edges": {}}
    for node_id, node in network.nodes.items():
        node_tel = {
            "inlets": [p.model_dump() for p in node.inlets],
            "outlets": [p.model_dump() for p in node.outlets]
        }
        if hasattr(node, 'opening_pct'):
            node_tel["opening_pct"] = node.opening_pct
        if hasattr(node, 'sensed_pressure'):
            node_tel["sensed_pressure"] = node.sensed_pressure
        if hasattr(node, 'cavitation_warning'):
            node_tel["cavitation_warning"] = node.cavitation_warning
        if isinstance(node, (VolumetricPump, CentrifugalPump)):
            node_tel["shaft_power_kw"] = node.shaft_power() / 1000.0
            node_tel["npsha_m"] = node.npsha_m
            node_tel["npshr_m"] = node.npshr_m
            node_tel["npsh_margin_m"] = node.npsh_margin_m
        if node.node_type == "orifice" and getattr(node, 'standard', None) == 'iso_5167':
            inlet = node.inlets[0]
            re_pipe = node._pipe_reynolds(inlet.flow_rate, inlet.density, inlet.viscosity, node.pipe_diameter)
            issues = node.iso_validity_issues(re_pipe if abs(inlet.flow_rate) > 0 else None)
            node_tel["iso_validity"] = {"valid": not issues, "issues": issues}
        if node.node_type in THROTTLING_TYPES and not isinstance(node, (VolumetricPump, CentrifugalPump)):
            node_tel["flashing_warning"] = _outlet_below_vapor_pressure(network, node)
        if isinstance(node, VolumetricPump):
            node.refresh_warnings()
            node_tel["drive_type"] = node.drive_type
            node_tel["motor_load_pct"] = node.motor_load_pct
            node_tel["motor_overload"] = node.motor_overload
            node_tel["power_limited"] = node.power_limited
            node_tel["pressure_cap_reached"] = node.pressure_cap_reached
        if node.node_type == "flow_source":
            node.refresh_warnings()
            node_tel["pressure_cap_reached"] = node.pressure_cap_reached
            node_tel["max_discharge_pressure_bara"] = node.max_discharge_pressure / 100000.0
        if node.node_type == "heat_exchanger":
            node_tel["rating_status"] = node.rating_status
            node_tel["design_effectiveness"] = node.design_effectiveness
        if hasattr(node, 'actual_duty_kw'):
            node_tel["actual_duty_kw"] = node.actual_duty_kw
        if hasattr(node, 'status'):
            node_tel["status"] = node.status
        if hasattr(node, 'capacity_utilization_pct'):
            node_tel["capacity_utilization_pct"] = node.capacity_utilization_pct
        if hasattr(node, 'action_mode'):
            node_tel["action_mode"] = node.action_mode
        if hasattr(node, 'set_pressure_barg'):
            # Relief devices (F1-09, F1-04, F1-38): set pressure in barg, plus bar(a) to compare with port pressures
            node_tel["set_pressure_barg"] = node.set_pressure_barg
            node_tel["set_pressure_bara"] = node.set_pressure_bara
            node_tel["rated_flow_lmin"] = node.rated_flow_lmin
            node_tel["lift_pct"] = node.lift_pct
            if hasattr(node, 'reseat_pressure_barg'):
                node_tel["reseat_pressure_barg"] = node.reseat_pressure_barg
        if hasattr(node, 'forced_state'):
            node_tel["forced_state"] = node.forced_state
        if hasattr(node, 'cv'):
            node_tel["cv"] = node.cv
        # Effective geometry as used by the solver (graph_parser overrides pipe_diameter
        # from the connected pipe), so the frontend chart uses the same values as the solve.
        if hasattr(node, 'pipe_diameter'):
            node_tel["pipe_diameter"] = node.pipe_diameter
        if hasattr(node, 'standard'):
            node_tel["standard"] = node.standard
        telemetry["nodes"][node_id] = node_tel

    for edge in network.edges:
        edge_id = edge["id"]
        pipe = edge["pipe"]
        telemetry["edges"][edge_id] = {
            "inlets": [p.model_dump() for p in pipe.inlets],
            "outlets": [p.model_dump() for p in pipe.outlets]
        }
    return telemetry

# Backward-compatibility alias
extract_telemetry_dict = extract_telemetry

def sanitize_error_message(e: Exception) -> str:
    """Sanitizes exception messages to prevent stack trace and file path leakage (SEC-06)."""
    msg = str(e)
    sensitive_markers = ["traceback", "file \"", "c:\\", "/home/", "line ", "sqlite3", "syntax error in"]
    lower_msg = msg.lower()
    if any(marker in lower_msg for marker in sensitive_markers):
        return "Simulation calculation error. Please verify diagram parameters and connectivity."
    return msg if len(msg) < 150 else "Simulation failed due to numerical instability or invalid parameters."

@router.get("/fluids")
def list_fluids():
    """
    Returns the catalog of supported fluids (id, name, category)
    used to populate the System Fluid and Calibration Fluid dropdowns.
    """
    return FluidProperties.get_fluid_catalog()

@router.post("/batch", response_model=BatchSimulationResponse)
@limiter.limit("30/minute")
def run_batch_simulation(request: Request, graph: ReactFlowGraph):
    """
    Executes hydraulic simulations for all operating cases in the diagram graph.
    Returns side-by-side telemetry and KPI comparisons for the matrix dashboard.
    """
    # F2-13: /batch is open to anonymous users, so bound the work one request can ask for
    if len(graph.nodes) > max_nodes():
        raise HTTPException(status_code=413,
                            detail=f"Diagram too large: {len(graph.nodes)} components (limit {max_nodes()}).")
    if len(graph.cases or []) > max_cases():
        raise HTTPException(status_code=413,
                            detail=f"Too many operating cases: {len(graph.cases)} (limit {max_cases()}).")

    cases_to_run = graph.cases or []
    if not cases_to_run:
        # Fallback to single base case if no cases defined
        cases_to_run = [
            OperatingCase(id="case_base", name="Base Case (Normal Operation)", is_base=True)
        ]

    results: List[BatchCaseResult] = []

    # One deadline for the whole request and a cap on concurrent solves (F2-13)
    with solve_slot(), solve_deadline():
        for case in cases_to_run:
            try:
                # Parse graph layering the current case overrides
                network = GraphParser.parse_graph(graph, case_id=case.id)
                solver = NetworkSolver(network)

                stats, telemetry, telemetry_unmitigated, has_psv, telemetry_peak = run_sequential_relief_simulation(
                    network, solver, extract_telemetry_dict
                )

                print(f"Batch Case '{case.name}': success={stats.get('success')}, error={stats.get('error')}, time={stats.get('time_ms', 0):.2f}ms, fallback={stats.get('fallback_used')}")

                if stats.get("error_kind"):
                    results.append(BatchCaseResult(case_id=case.id, case_name=case.name, is_base=case.is_base,
                                                   status="error", error_message=stats["error"]))
                    continue

                kpis = calculate_case_kpis(network, telemetry, stats)
                stats, clean = sanitize_result(stats, telemetry=telemetry, telemetry_unmitigated=telemetry_unmitigated,
                                               telemetry_peak=telemetry_peak, kpis=kpis)
                telemetry, telemetry_unmitigated = clean["telemetry"], clean["telemetry_unmitigated"]
                telemetry_peak, kpis = clean["telemetry_peak"], clean["kpis"]

                results.append(BatchCaseResult(
                    case_id=case.id,
                    case_name=case.name,
                    is_base=case.is_base,
                    status="success",
                    stats=stats,
                    telemetry=telemetry,
                    telemetry_unmitigated=telemetry_unmitigated,
                    telemetry_peak=telemetry_peak,
                    kpis=kpis
                ))
            except (SolveTimeout, ModelInputError) as e:
                results.append(BatchCaseResult(
                    case_id=case.id, case_name=case.name, is_base=case.is_base,
                    status="error", error_message=str(e)
                ))
            except Exception as e:
                traceback.print_exc()
                results.append(BatchCaseResult(
                    case_id=case.id,
                    case_name=case.name,
                    is_base=case.is_base,
                    status="error",
                    error_message=sanitize_error_message(e)
                ))

    return BatchSimulationResponse(status="success", results=results)
