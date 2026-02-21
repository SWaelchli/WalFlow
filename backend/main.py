from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import json
import traceback

from simulation.solver import NetworkSolver
from simulation.graph_parser import GraphParser
from simulation.schemas import ReactFlowGraph
from simulation.equipment.valve import Valve

app = FastAPI(title="WalFlow Engine", description="Hydraulic Simulation Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global simulation state
network_instance = None
solver_instance = None

@app.get("/")
async def read_root():
    return {"status": "online", "message": "WalFlow Engine is ready."}

@app.websocket("/ws/simulate")
async def websocket_endpoint(websocket: WebSocket):
    global network_instance, solver_instance
    
    await websocket.accept()
    print("Frontend client connected.")
    
    try:
        while True:
            data_str = await websocket.receive_text()
            data = json.loads(data_str)
            
            action = data.get("action")
            
            if action == "update_graph":
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
                        await websocket.send_text(json.dumps({"status": "error", "message": str(e)}))
                        continue

            elif action == "update_valve":
                if network_instance:
                    valve_id = data.get("node_id")
                    new_pct = float(data.get("value", 50.0))
                    
                    # Update specific valve if ID provided, else update all (for legacy support)
                    for node_id, node in network_instance.nodes.items():
                        if isinstance(node, Valve):
                            if valve_id is None or node_id == valve_id:
                                node.opening_pct = max(0.1, min(100.0, new_pct))

            if solver_instance:
                try:
                    # Run the physics engine
                    main_flow = solver_instance.solve()
                    
                    # Package telemetry for all nodes and edges
                    telemetry = {
                        "nodes": {},
                        "edges": {}
                    }
                    
                    for node_id, node in network_instance.nodes.items():
                        telemetry["nodes"][node_id] = {
                            "inlets": [p.dict() for p in node.inlets],
                            "outlets": [p.dict() for p in node.outlets]
                        }
                    
                    for i, edge in enumerate(network_instance.edges):
                        # Use the index or a unique ID if available
                        edge_id = f"edge_{i}" 
                        pipe = edge["pipe"]
                        telemetry["edges"][edge_id] = {
                            "inlets": [p.dict() for p in pipe.inlets],
                            "outlets": [p.dict() for p in pipe.outlets]
                        }

                    await websocket.send_text(json.dumps({
                        "status": "success",
                        "flow_rate_m3s": main_flow,
                        "telemetry": telemetry
                    }))
                except Exception as e:
                    print(f"Solver Error: {e}")
                    await websocket.send_text(json.dumps({"status": "error", "message": str(e)}))
            else:
                await websocket.send_text(json.dumps({"status": "waiting", "message": "Graph required."}))
            
    except WebSocketDisconnect:
        print("Frontend client disconnected.")

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
