from typing import List
import uuid

# Import the Port schema from our sibling file
from simulation.schemas import Port

class HydraulicNode:
    """
    This is the parent class for ALL equipment in WalFlow. 
    Pumps, Valves, Tanks, and Pipes will all inherit from this.
    It ensures every piece of equipment has standard inlets, outlets, and a calculate method.
    """
    def __init__(self, name: str, node_type: str):
        self.id = str(uuid.uuid4())  # Unique ID for the React Flow canvas to track
        self.name = name
        self.node_type = node_type   # e.g., "centrifugal_pump", "gate_valve"
        
        # Every node can have multiple inlets and outlets
        self.inlets: List[Port] = []
        self.outlets: List[Port] = []

    def add_inlet(self) -> Port:
        new_port = Port()
        self.inlets.append(new_port)
        return new_port

    def add_outlet(self) -> Port:
        new_port = Port()
        self.outlets.append(new_port)
        return new_port

    def calculate(self):
        """
        The simulation engine will call this method iteratively.
        This is just a placeholder. When we create the specific Pump or Valve classes,
        we will override this method with the actual mathematical logic (like the pump curve).
        """
        raise NotImplementedError("This method must be overridden by the specific equipment class.")