from fastapi import APIRouter, HTTPException, status
from typing import List, Dict, Any
import traceback

from simulation.schemas import ReactFlowGraph, BatchSimulationResponse, BatchCaseResult, OperatingCase
from simulation.graph_parser import GraphParser
from simulation.solver import NetworkSolver, run_sequential_relief_simulation
from simulation.equipment.volumetric_pump import VolumetricPump
from simulation.equipment.centrifugal_pump import CentrifugalPump

router = APIRouter(prefix="/api/simulation", tags=["simulation"])

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
            
        if node_tel.get("cavitation_warning", False):
            has_cavitation = True

        # Aggregate pump power & flow
        if isinstance(node, (VolumetricPump, CentrifugalPump)):
            if isinstance(node, CentrifugalPump):
                inlet_flow = node.inlets[0].flow_rate if node.inlets else 0.0
                inlet_p = node.inlets[0].pressure if node.inlets else 101325.0
                outlet_p = node.outlets[0].pressure if node.outlets else 101325.0
                dp = max(0.0, outlet_p - inlet_p)
                eta = getattr(node, 'efficiency', 0.75)
                eta = max(0.05, eta)
                total_pump_power_w += abs(inlet_flow * dp) / eta
            else:
                total_pump_power_w += getattr(node, 'motor_power', 0.0)
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

def extract_telemetry_dict(network) -> Dict[str, Any]:
    telemetry = {"nodes": {}, "edges": {}}
    for node_id, node in network.nodes.items():
        node_tel = {
            "inlets": [p.dict() for p in node.inlets],
            "outlets": [p.dict() for p in node.outlets]
        }
        if hasattr(node, 'opening_pct'): node_tel["opening_pct"] = node.opening_pct
        if hasattr(node, 'sensed_pressure'): node_tel["sensed_pressure"] = node.sensed_pressure
        if hasattr(node, 'cavitation_warning'): node_tel["cavitation_warning"] = node.cavitation_warning
        if hasattr(node, 'actual_duty_kw'): node_tel["actual_duty_kw"] = node.actual_duty_kw
        if hasattr(node, 'status'): node_tel["status"] = node.status
        telemetry["nodes"][node_id] = node_tel

    for edge in network.edges:
        edge_id = edge["id"]
        pipe = edge["pipe"]
        telemetry["edges"][edge_id] = {
            "inlets": [p.dict() for p in pipe.inlets],
            "outlets": [p.dict() for p in pipe.outlets]
        }
    return telemetry

@router.post("/batch", response_model=BatchSimulationResponse)
def run_batch_simulation(graph: ReactFlowGraph):
    """
    Executes hydraulic simulations for all operating cases in the diagram graph.
    Returns side-by-side telemetry and KPI comparisons for the matrix dashboard.
    """
    cases_to_run = graph.cases or []
    if not cases_to_run:
        # Fallback to single base case if no cases defined
        cases_to_run = [
            OperatingCase(id="case_base", name="Base Case (Normal Operation)", is_base=True)
        ]

    results: List[BatchCaseResult] = []

    for case in cases_to_run:
        try:
            # Parse graph layering the current case overrides
            network = GraphParser.parse_graph(graph, case_id=case.id)
            solver = NetworkSolver(network)

            stats, telemetry, telemetry_unmitigated, has_psv = run_sequential_relief_simulation(
                network, solver, extract_telemetry_dict
            )

            kpis = calculate_case_kpis(network, telemetry, stats)

            results.append(BatchCaseResult(
                case_id=case.id,
                case_name=case.name,
                is_base=case.is_base,
                status="success",
                stats=stats,
                telemetry=telemetry,
                telemetry_unmitigated=telemetry_unmitigated,
                kpis=kpis
            ))
        except Exception as e:
            traceback.print_exc()
            results.append(BatchCaseResult(
                case_id=case.id,
                case_name=case.name,
                is_base=case.is_base,
                status="error",
                error_message=str(e)
            ))

    return BatchSimulationResponse(status="success", results=results)
