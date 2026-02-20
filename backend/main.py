from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import json

# Import the simulation components we built in Phases 1-3
from simulation.equipment.tank import Tank
from simulation.equipment.pipe import Pipe
from simulation.equipment.orifice import Orifice
from simulation.equipment.valve import Valve
from simulation.equipment.pump import Pump
from simulation.solver import NetworkSolver

# 1. Initialize the FastAPI application
app = FastAPI(title="WalFlow Engine", description="Hydraulic Simulation Backend")

# 2. Configure CORS (Cross-Origin Resource Sharing)
# Your React frontend will run on a different port (e.g., localhost:3000) 
# than this backend (localhost:8000). Without this middleware, modern web browsers 
# will block the frontend from talking to the backend for security reasons.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins. In production, we will restrict this.
    allow_credentials=True,
    allow_methods=["*"],  # Allows all HTTP methods (GET, POST, etc.)
    allow_headers=["*"],  # Allows all headers
)

# 3. Build the Global Network Test Stand
# We define this OUTSIDE the websocket function so the simulation 
# state (like tank levels or valve positions) persists while the server is running.
tank_a = Tank(name="Source Tank", elevation=0.0, fluid_level=2.0)
pump = Pump(name="Main Booster Pump", A=80.0, B=0.0, C=-2000.0)
pipe = Pipe(name="Main Line", length=100.0, diameter=0.1, friction_factor=0.02)
orifice = Orifice(name="Flow Metering", pipe_diameter=0.1, orifice_diameter=0.07)
valve = Valve(name="Control Valve", max_cv=0.05, opening_pct=50.0)
tank_b = Tank(name="Destination Tank", elevation=20.0, fluid_level=2.0)

solver = NetworkSolver(nodes=[tank_a, pump, pipe, orifice, valve, tank_b])


# 4. Standard REST API Route (The "Health Check")
@app.get("/")
async def read_root():
    """
    A simple endpoint to verify the server is running.
    When you visit http://localhost:8000/ in your browser, you will see this JSON response.
    """
    return {"status": "online", "message": "WalFlow Engine is ready for connections."}

# 5. WebSocket Route (For real-time simulation data)
@app.websocket("/ws/simulate")
async def websocket_endpoint(websocket: WebSocket):
    """
    This endpoint establishes a persistent, two-way connection with the frontend.
    Instead of asking for data and getting one response (like a standard webpage), 
    the connection stays open indefinitely.
    """
    await websocket.accept()
    print("Frontend client connected to simulation stream.")
    
    try:
        while True:
            # Wait for the frontend to send a JSON command
            data_str = await websocket.receive_text()
            data = json.loads(data_str)
            
            # Check if the frontend wants to adjust the control valve
            if data.get("action") == "update_valve":
                new_pct = float(data.get("value", 50.0))
                # Bound the input to prevent crashing the math
                new_pct = max(0.1, min(100.0, new_pct)) 
                valve.opening_pct = new_pct
                print(f"Server: Adjusting valve to {new_pct}%")
            
            # Run the mathematical solver
            try:
                flow_rate = solver.solve()
                
                # Package the results into a JSON dictionary
                results = {
                    "status": "success",
                    "flow_rate_m3s": round(flow_rate, 5),
                    "pump_added_pa": round(pump.calculate(), 2),
                    "valve_drop_pa": round(valve.calculate(), 2),
                    "current_valve_pct": valve.opening_pct
                }
            except Exception as e:
                # If the solver fails (e.g., zero-flow singularity), send the error to the UI
                results = {
                    "status": "error",
                    "message": str(e)
                }

            # Send the calculated states back to the frontend
            await websocket.send_text(json.dumps(results))
            
    except WebSocketDisconnect:
        print("Frontend client disconnected.")

# 5. The Execution Block
if __name__ == "__main__":
    # This tells uvicorn (our ASGI web server) to run this application.
    # reload=True means the server will automatically restart whenever you save code changes.
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)