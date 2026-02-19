from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

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

# 3. Standard REST API Route (The "Health Check")
@app.get("/")
async def read_root():
    """
    A simple endpoint to verify the server is running.
    When you visit http://localhost:8000/ in your browser, you will see this JSON response.
    """
    return {"status": "online", "message": "WalFlow Simulation Engine is running."}

# 4. WebSocket Route (For real-time simulation data)
@app.websocket("/ws/simulate")
async def websocket_endpoint(websocket: WebSocket):
    """
    This endpoint establishes a persistent, two-way connection with the frontend.
    Instead of asking for data and getting one response (like a standard webpage), 
    the connection stays open indefinitely.
    """
    await websocket.accept()
    try:
        while True:
            # Wait for the frontend to send a message (e.g., a user opening a valve)
            data = await websocket.receive_text()
            
            # TODO in Phase 6: Run the hydraulic solver here.
            
            # For now, we just echo the message back to prove the connection works.
            await websocket.send_text(f"WalFlow Server received: {data}")
            
    except WebSocketDisconnect:
        print("Client disconnected from the simulation stream.")

# 5. The Execution Block
if __name__ == "__main__":
    # This tells uvicorn (our ASGI web server) to run this application.
    # reload=True means the server will automatically restart whenever you save code changes.
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)