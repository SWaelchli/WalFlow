from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import json

# Import the simulation components
from simulation.equipment.tank import Tank
from simulation.equipment.pipe import Pipe
from simulation.equipment.orifice import Orifice
from simulation.equipment.valve import Valve
from simulation.equipment.pump import Pump
from simulation.solver import NetworkSolver
from simulation.schemas import ReactFlowGraph
from simulation.graph_parser import GraphParser

# 1. Initialize the FastAPI application
app = FastAPI(title="WalFlow Engine", description="Hydraulic Simulation Backend")

# 2. Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 3. Global Network State
solver = None
current_nodes = []

def get_valve_from_nodes(nodes, name=None):
    """Helper to find a valve node by name or just return the first one."""
    for n in nodes:
        if isinstance(n, Valve):
            if name is None or n.name == name:
                return n
    return None

# 4. Standard REST API Route
@app.get("/")
async def read_root():
    return {"status": "online", "message": "WalFlow Engine is ready for connections."}

# 5. WebSocket Route
@app.websocket("/ws/simulate")
async def websocket_endpoint(websocket: WebSocket):
    global solver, current_nodes
    
    await websocket.accept()
    print("Frontend client connected to simulation stream.")
    
    try:
        while True:
            data_str = await websocket.receive_text()
            data = json.loads(data_str)
            
            action = data.get("action")
            
            if action == "update_graph":
                graph_data = data.get("graph")
                if graph_data:
                    try:
                        graph = ReactFlowGraph(**graph_data)
                        current_nodes = GraphParser.parse_graph(graph)
                        solver = NetworkSolver(nodes=current_nodes)
                        print(f"Server: Graph updated with {len(current_nodes)} nodes.")
                    except Exception as e:
                        print(f"Error parsing graph: {e}")
                        await websocket.send_text(json.dumps({"status": "error", "message": f"Graph Parse Error: {str(e)}"}))
                        continue

            elif action == "update_valve":
                if solver:
                    new_pct = float(data.get("value", 50.0))
                    new_pct = max(0.1, min(100.0, new_pct)) 
                    valve = get_valve_from_nodes(current_nodes)
                    if valve:
                        valve.opening_pct = new_pct
            
            if solver:
                try:
                    flow_rate = solver.solve()
                    results = {
                        "status": "success",
                        "flow_rate_m3s": round(flow_rate, 5),
                    }
                    
                    pump = next((n for n in current_nodes if isinstance(n, Pump)), None)
                    valve = get_valve_from_nodes(current_nodes)
                    
                    if pump:
                        results["pump_added_pa"] = round(pump.calculate_delta_p(flow_rate, 1000.0), 2)
                    if valve:
                        results["valve_drop_pa"] = round(valve.calculate_delta_p(flow_rate, 1000.0), 2)
                        results["current_valve_pct"] = valve.opening_pct

                    await websocket.send_text(json.dumps(results))
                except Exception as e:
                    await websocket.send_text(json.dumps({"status": "error", "message": str(e)}))
            else:
                await websocket.send_text(json.dumps({"status": "waiting", "message": "Send graph to start simulation."}))
            
    except WebSocketDisconnect:
        print("Frontend client disconnected.")

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
