from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
import uvicorn
import json
import traceback
import logging

from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi import _rate_limit_exceeded_handler

from auth import decode_access_token
from limiter import limiter

from simulation.solver import NetworkSolver, run_sequential_relief_simulation
from simulation.graph_parser import GraphParser
from simulation.schemas import ReactFlowGraph
from simulation.equipment.linear_control_valve import LinearControlValve

from db.database import init_db
from routers.auth import router as auth_router
from routers.diagrams import router as diagrams_router, collab_manager
from routers.projects import router as projects_router
from routers.invitations import router as invitations_router
from routers.admin import router as admin_router
from routers.simulation import router as simulation_router, calculate_case_kpis, extract_telemetry
from routers.pipe_classes import router as pipe_classes_router

from contextlib import asynccontextmanager

logger = logging.getLogger("uvicorn")

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield

app = FastAPI(title="WalFlow Engine", description="Hydraulic Simulation Backend", lifespan=lifespan)

# Attach slowapi rate limiter state & middleware (R4 / Security)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global sanitized exception handler to prevent stack trace data leakage (SEC-06)
@app.exception_handler(Exception)
async def global_unhandled_exception_handler(request: Request, exc: Exception):
    # Pass through standard HTTPExceptions and validation errors
    if isinstance(exc, (StarletteHTTPException, RequestValidationError, RateLimitExceeded)):
        raise exc
    logger.error(f"Unhandled server exception on {request.url.path}: {exc}")
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal server error occurred. Please try again later."}
    )

app.include_router(auth_router)
app.include_router(diagrams_router)
app.include_router(projects_router)
app.include_router(invitations_router)
app.include_router(admin_router)
app.include_router(simulation_router)
app.include_router(pipe_classes_router)


@app.get("/")
async def read_root():
    return {"status": "online", "message": "WalFlow Engine is ready.", "version": "0.2.0"}

@app.websocket("/ws/simulate")
async def websocket_endpoint(websocket: WebSocket):
    import os
    # Retrieve token from cookies or query parameters
    token = websocket.cookies.get("walflow_auth_token")
    if not token:
        token = websocket.query_params.get("token")
        
    # Check if authentication is required for WebSocket simulation
    # Defaults to true across all environments (SEC-02) unless explicitly disabled via WALFLOW_REQUIRE_WS_AUTH
    require_auth = os.getenv("WALFLOW_REQUIRE_WS_AUTH", "true").lower() in ("true", "1")

    if require_auth:
        if not token or not decode_access_token(token):
            # Reject connection if token is missing, expired, or revoked (SEC-03)
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Not authenticated")
            return

    network_instance = None
    solver_instance = None
    
    await websocket.accept()
    print("Frontend client connected and authenticated.")
    
    try:
        while True:
            data_str = await websocket.receive_text()
            try:
                data = json.loads(data_str)
            except (json.JSONDecodeError, TypeError) as e:
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
                if diagram_id:
                    await collab_manager.connect(websocket, diagram_id)
                    print(f"WS client joined diagram collab channel: {diagram_id}")

            elif action == "update_graph":
                graph_data = data.get("graph")
                if graph_data:
                    try:
                        # Parse the React Flow JSON into our HydraulicNetwork model
                        rf_graph = ReactFlowGraph(**graph_data)
                        network_instance = GraphParser.parse_graph(rf_graph)
                        solver_instance = NetworkSolver(network_instance)
                        print(f"Graph updated: {len(network_instance.nodes)} nodes, {len(network_instance.edges)} edges.")
                    except Exception as e:
                        print(f"Graph Parse Error: {e}")
                        traceback.print_exc()
                        # SEC-06: Sanitize error payload
                        safe_msg = "Invalid diagram graph format. Please verify component connections."
                        await websocket.send_text(json.dumps({"status": "error", "message": safe_msg}))
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
                        rf_graph = ReactFlowGraph(**graph_data)
                        network_instance = GraphParser.parse_graph(rf_graph)
                        solver_instance = NetworkSolver(network_instance)
                    except Exception as e:
                        print(f"Graph Parse Error during Simulation: {e}")
                        traceback.print_exc()
                        safe_msg = "Graph configuration error during simulation initialization."
                        await websocket.send_text(json.dumps({"status": "error", "message": safe_msg}))
                        continue

                if solver_instance:
                    try:
                        # Offload CPU-heavy matrix solver to thread pool to prevent event loop starvation
                        import asyncio
                        stats, telemetry_mitigated, telemetry_unmitigated, has_psv = await asyncio.to_thread(
                            run_sequential_relief_simulation,
                            network_instance,
                            solver_instance,
                            extract_telemetry
                        )

                        print(f"Simulation Run: success={stats.get('success')}, error={stats.get('error')}, time={stats.get('time_ms', 0):.2f}ms, fallback={stats.get('fallback_used')}")
                        if not stats.get("success"):
                            print(f"  Solver stats: {stats}")

                        kpis = calculate_case_kpis(network_instance, telemetry_mitigated, stats)

                        await websocket.send_text(json.dumps({
                            "status": "success",
                            "stats": stats,
                            "telemetry": telemetry_mitigated,
                            "telemetry_unmitigated": telemetry_unmitigated,
                            "has_psv": has_psv,
                            "kpis": kpis
                        }))
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
        collab_manager.disconnect(websocket)

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
