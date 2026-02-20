import asyncio
import websockets
import json

async def test_simulation():
    uri = "ws://localhost:8000/ws/simulate"
    
    # 1. Open the connection to the FastAPI server
    async with websockets.connect(uri) as websocket:
        print("Connected to WalFlow Engine!")
        
        # 2. Package our command just like a React frontend would
        command = {"action": "update_valve", "value": 30.0}
        print(f"Sending command: {command}")
        
        # 3. Fire it off
        await websocket.send(json.dumps(command))
        
        # 4. Wait for the server to solve the math and send the results back
        response = await websocket.recv()
        
        # Print it nicely formatted
        parsed_response = json.loads(response)
        print(f"Received from server:\n{json.dumps(parsed_response, indent=4)}")

if __name__ == "__main__":
    asyncio.run(test_simulation())