"""WebSocket simulation and collaboration endpoint (/ws/simulate)."""
import os
import json
import traceback
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status

from auth import decode_access_token, get_user_from_token
from db.database import SessionLocal
from db.models import Diagram
from services.lock_service import collab_manager
from services.project_service import user_can_access_diagram
from simulation.graph_parser import ModelInputError
from simulation.solver import run_sequential_relief_simulation
from simulation.equipment.linear_control_valve import LinearControlValve
from simulation.limits import run_limited, SolveTimeout
from services.simulation_service import (
    build_network,
    extract_telemetry,
    calculate_case_kpis,
    sanitize_result,
    numpy_json_default,
)

router = APIRouter(tags=["simulation-websocket"])


@router.websocket("/ws/simulate")
async def websocket_endpoint(websocket: WebSocket):
    # Retrieve token from cookies or query parameters
    token = websocket.cookies.get("walflow_auth_token")
    if not token:
        token = websocket.query_params.get("token")

    # Anonymous users may run simulations; WALFLOW_REQUIRE_WS_AUTH=true makes the whole socket login-only.
    # Collaboration (join_diagram) always needs a login, see below.
    require_auth = os.getenv("WALFLOW_REQUIRE_WS_AUTH", "false").lower() in ("true", "1")

    if require_auth:
        if not token or not decode_access_token(token):
            # Reject connection if token is missing, expired, or revoked (SEC-03)
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Not authenticated")
            return

    network_instance = None
    solver_instance = None

    await websocket.accept()
    print("Frontend client connected.")

    try:
        while True:
            data_str = await websocket.receive_text()
            try:
                data = json.loads(data_str)
            except (json.JSONDecodeError, TypeError):
                await websocket.send_text(json.dumps({
                    "status": "error",
                    "message": "Invalid JSON frame received."
                }))
                continue

            if not isinstance(data, dict):
                await websocket.send_text(json.dumps({
                    "status": "error",
                    "message": "WebSocket payload must be a JSON object."
                }))
                continue

            action = data.get("action")

            if action == "join_diagram":
                diagram_id = data.get("diagram_id")
                if not isinstance(diagram_id, str) or not diagram_id.strip():
                    await websocket.send_text(json.dumps({
                        "status": "error", "context": "join_diagram",
                        "message": "diagram_id must be a non-empty string."
                    }))
                    continue

                # Lock and update events carry user names, so joining needs a login and project/owner access
                allowed = False
                user_id = None
                db = SessionLocal()
                try:
                    user = get_user_from_token(token, db)
                    diagram = db.query(Diagram).filter(Diagram.id == diagram_id).first() if user else None
                    allowed = bool(user and diagram and user_can_access_diagram(db, diagram, user))
                    user_id = user.id if allowed else None
                except Exception as e:
                    print(f"Error resolving diagram access: {e}")
                    traceback.print_exc()
                    await websocket.send_text(json.dumps({
                        "status": "error", "context": "join_diagram",
                        "message": "Could not check access to this diagram. Please try again."
                    }))
                    continue
                finally:
                    db.close()

                if not allowed:
                    await websocket.send_text(json.dumps({
                        "status": "error", "context": "join_diagram",
                        "message": "Sign in with access to this diagram to receive collaboration updates."
                    }))
                    continue
                session_id = data.get("session_id")
                await collab_manager.connect(websocket, diagram_id, user_id, str(session_id)[:100] if session_id else None)
                print(f"WS client joined diagram collab channel: {diagram_id}")

            elif action == "update_graph":
                graph_data = data.get("graph")
                if graph_data:
                    try:
                        # Parse the React Flow JSON into our HydraulicNetwork model
                        network_instance, solver_instance = build_network(graph_data)
                        print(f"Graph updated: {len(network_instance.nodes)} nodes, {len(network_instance.edges)} edges.")
                        await websocket.send_text(json.dumps({"status": "graph_accepted"}))
                    except ModelInputError:
                        # User input problem (e.g. missing pump head). Sent 250 ms after every edit,
                        # so stay silent here; the message is shown when the user runs a simulation.
                        network_instance, solver_instance = None, None
                        continue
                    except Exception as e:
                        print(f"Graph Parse Error: {e}")
                        traceback.print_exc()
                        network_instance, solver_instance = None, None
                        # SEC-06: Sanitize error payload
                        safe_msg = "Invalid diagram graph format. Please verify component connections."
                        # context lets the client show this inline instead of as a popup
                        await websocket.send_text(json.dumps({"status": "error", "context": "update_graph", "message": safe_msg}))
                        continue

            elif action == "update_valve":
                if network_instance:
                    valve_id = data.get("node_id")
                    try:
                        new_pct = float(data.get("value", 50.0))
                    except (ValueError, TypeError):
                        new_pct = 50.0

                    # Update specific valve if ID provided, else update all (for legacy support)
                    for node_id, node in network_instance.nodes.items():
                        if isinstance(node, LinearControlValve):
                            if valve_id is None or node_id == valve_id:
                                node.opening_pct = max(0.0, min(100.0, new_pct))

            elif action == "run_simulation":
                # OPTIONAL: Allow updating the graph immediately before simulation 
                # to prevent race conditions with debounced updates.
                graph_data = data.get("graph")
                if graph_data:
                    try:
                        network_instance, solver_instance = build_network(graph_data)
                    except ModelInputError as e:
                        network_instance, solver_instance = None, None
                        await websocket.send_text(json.dumps({"status": "error", "message": str(e)}))
                        continue
                    except Exception as e:
                        print(f"Graph Parse Error during Simulation: {e}")
                        traceback.print_exc()
                        network_instance, solver_instance = None, None
                        safe_msg = "Graph configuration error during simulation initialization."
                        await websocket.send_text(json.dumps({"status": "error", "message": safe_msg}))
                        continue

                if solver_instance:
                    try:
                        # Offload CPU-heavy matrix solver to thread pool to prevent event loop starvation
                        # Bounded by the solve timeout and the concurrent-solve cap
                        stats, telemetry_mitigated, telemetry_unmitigated, has_psv, telemetry_peak = await asyncio.to_thread(
                            run_limited,
                            run_sequential_relief_simulation,
                            network_instance,
                            solver_instance,
                            extract_telemetry
                        )

                        if stats.get("error_kind"):
                            # No result (a circuit without a tank, a component out of range, no convergence): show
                            # the message, the component to select and the raw solver text, not stale results
                            print(f"Simulation not solved: {stats['error_kind']}: {stats.get('error_detail') or stats['error']}")
                            await websocket.send_text(json.dumps({
                                "status": "error", "message": stats["error"], "kind": stats["error_kind"],
                                "target": stats.get("error_target"), "detail": stats.get("error_detail"),
                            }))
                            continue

                        print(f"Simulation Run: success={stats.get('success')}, error={stats.get('error')}, time={stats.get('time_ms', 0):.2f}ms, fallback={stats.get('fallback_used')}")
                        if not stats.get("success"):
                            print(f"  Solver stats: {stats}")

                        kpis = calculate_case_kpis(network_instance, telemetry_mitigated, stats)
                        # NaN/Infinity would make the frame invalid JSON; send null and report the fields
                        stats, clean = sanitize_result(stats, telemetry=telemetry_mitigated, telemetry_unmitigated=telemetry_unmitigated,
                                                       telemetry_peak=telemetry_peak, kpis=kpis)
                        telemetry_mitigated, telemetry_unmitigated = clean["telemetry"], clean["telemetry_unmitigated"]
                        telemetry_peak, kpis = clean["telemetry_peak"], clean["kpis"]

                        await websocket.send_text(json.dumps({
                            "status": "success",
                            "stats": stats,
                            "telemetry": telemetry_mitigated,
                            "telemetry_unmitigated": telemetry_unmitigated,
                            "telemetry_peak": telemetry_peak,
                            "has_psv": has_psv,
                            "kpis": kpis
                        }, default=numpy_json_default))
                    except SolveTimeout as e:
                        await websocket.send_text(json.dumps({"status": "error", "message": str(e)}))
                    except Exception as e:
                        print(f"Solver Error: {e}")
                        traceback.print_exc()
                        # SEC-06: Sanitize error payload
                        safe_msg = "Hydraulic network solver calculation error. Please check boundary conditions."
                        await websocket.send_text(json.dumps({"status": "error", "message": safe_msg}))
                else:
                    await websocket.send_text(json.dumps({"status": "waiting", "message": "Graph required before simulation."}))

    except WebSocketDisconnect:
        print("Frontend client disconnected.")
    finally:
        # A closed tab gives its edit lock back after a short grace; a tab that reconnects in time keeps it
        collab_manager.schedule_disconnect_release(collab_manager.disconnect(websocket))

