from fastapi import APIRouter, HTTPException, Request, status
from typing import List
import traceback

from simulation.schemas import ReactFlowGraph, BatchSimulationResponse, BatchCaseResult, OperatingCase
from simulation.graph_parser import GraphParser, ModelInputError
from simulation.solver import NetworkSolver, run_sequential_relief_simulation
from simulation.fluid_utils import FluidProperties
from limiter import limiter
from simulation.limits import SolveTimeout, solve_deadline, solve_slot, max_nodes, max_cases
from services.simulation_service import calculate_case_kpis, extract_telemetry, sanitize_result

router = APIRouter(prefix="/api/simulation", tags=["simulation"])

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
    # /batch is open to anonymous users, so bound the work one request can ask for
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

    # One deadline for the whole request and a cap on concurrent solves
    with solve_slot(), solve_deadline():
        for case in cases_to_run:
            try:
                # Parse graph layering the current case overrides
                network = GraphParser.parse_graph(graph, case_id=case.id)
                solver = NetworkSolver(network)

                stats, telemetry, telemetry_unmitigated, has_psv, telemetry_peak = run_sequential_relief_simulation(
                    network, solver, extract_telemetry
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
