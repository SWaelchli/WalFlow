from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import uuid

class Port(BaseModel):
    """
    A Port represents a physical connection point on a piece of equipment.
    We use Pydantic (BaseModel) here because it automatically validates data types,
    which will prevent crashes when the React frontend sends us text instead of numbers.
    """
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))

    # State Variables (Using SI Units as standard: Pascals, m^3/s, kg/m^3)
    pressure: float = 101325.0  # Default to 1 atm (atmospheric pressure)
    flow_rate: float = 0.0      # Volumetric flow rate (Q)
    temperature: float = 293.15 # Kelvin (Default to 20°C)

    # Fluid Properties (Defaulting to water at standard conditions)
    density: float = 1000.0     
    viscosity: float = 0.001    

    # Network Tracking: Which port on another piece of equipment is this connected to?
    connected_to_port_id: Optional[str] = None

class GlobalSettings(BaseModel):
    """Global simulation parameters."""
    fluid_type: str = "water"
    ambient_temperature: float = 293.15 # 20°C
    atmospheric_pressure: float = 101325.0
    global_roughness: float = 0.000045 # 0.045mm (Standard Steel)
    property_iterations: int = 5
    tolerance: float = 1e-6
    max_iterations: int = 1000

class ReactFlowNode(BaseModel):
    """Represents a node from React Flow."""
    id: str
    type: str
    position: Dict[str, float]
    data: Dict[str, Any]

class ReactFlowEdge(BaseModel):
    """Represents an edge from React Flow."""
    id: str
    source: str
    target: str
    sourceHandle: Optional[str] = None
    targetHandle: Optional[str] = None
    data: Optional[Dict[str, Any]] = Field(default_factory=dict)

class ReactFlowGraph(BaseModel):
    """Represents the full graph sent from the React frontend."""
    nodes: List[ReactFlowNode]
    edges: List[ReactFlowEdge]
    global_settings: Optional[GlobalSettings] = Field(default_factory=GlobalSettings)

class HydraulicNetwork(BaseModel):
    """
    A full graph of equipment and their connections.
    Used by the solver to traverse and build system equations.
    """
    class Config:
        arbitrary_types_allowed = True

    nodes: Dict[str, Any]  # ID -> HydraulicNode
    edges: List[Dict[str, Any]]  # List of: {'source': id, 'target': id, 'pipe': Pipe, 'source_port': str, 'target_port': str}
