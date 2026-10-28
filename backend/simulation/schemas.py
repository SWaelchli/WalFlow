from pydantic import BaseModel, Field, model_validator, ConfigDict
from typing import Optional, List, Dict, Any
import uuid

class Port:
    """
    A Port represents a physical connection point on a piece of equipment.
    Solver state only, never parsed from user input: a plain slotted class, because the solver writes its
    attributes over a million times per run and a pydantic model makes every write several times slower.
    """
    __slots__ = ("id", "pressure", "total_pressure", "flow_rate", "temperature", "density", "viscosity",
                 "stagnant", "connected_to_port_id")

    def __init__(self, **values):
        self.id: str = str(uuid.uuid4())

        # State Variables (Using SI Units as standard: Pascals, m^3/s, kg/m^3)
        self.pressure: float = 101325.0  # Static pressure; default to 1 atm (atmospheric pressure)
        # Total (stagnation) pressure of the node side, set by the solver's report; None until then (base_node.total_of)
        self.total_pressure: Optional[float] = None
        self.flow_rate: float = 0.0      # Volumetric flow rate (Q)
        self.temperature: float = 293.15 # Kelvin (Default to 20°C)

        # Fluid Properties (Defaulting to water at standard conditions)
        self.density: float = 1000.0
        self.viscosity: float = 0.001

        # No flow and no pressure reference: the solver set the pressure from the section's leak path
        self.stagnant: bool = False

        # Network Tracking: Which port on another piece of equipment is this connected to?
        self.connected_to_port_id: Optional[str] = None

        for name, value in values.items():
            setattr(self, name, value)

    def fluid(self) -> tuple:
        """(density, viscosity) at the port."""
        return self.density, self.viscosity

    def model_dump(self) -> Dict[str, Any]:
        """The port state as a dict, in field order (telemetry)."""
        return {name: getattr(self, name) for name in self.__slots__}

class GlobalSettings(BaseModel):
    """Global simulation parameters."""
    fluid_type: str = "water"
    ambient_temperature: float = 293.15 # 20°C
    atmospheric_pressure: float = 101325.0
    property_iterations: int = 5
    tolerance: float = 1e-6
    inner_iterations: int = 1000 # Max steps for the hydraulic solver (HYBR/LM)
    control_iterations: int = 100 # Max steps for the regulator control loop
    solver_method: str = "sparse_newton" # "sparse_newton" or "lm"
    warm_start: bool = True
    # damping_factor (TCV loop) is no longer used; older files still carry it and it is ignored

    @model_validator(mode='before')
    @classmethod
    def populate_camel_case(cls, values: Any) -> Any:
        if isinstance(values, dict):
            mapping = {
                'fluidType': 'fluid_type',
                'ambientTemperature': 'ambient_temperature',
                'atmosphericPressure': 'atmospheric_pressure',
                'propertyIterations': 'property_iterations',
                'innerIterations': 'inner_iterations',
                'controlIterations': 'control_iterations',
                'solverMethod': 'solver_method',
                'warmStart': 'warm_start',
            }
            for camel, snake in mapping.items():
                if camel in values and snake not in values:
                    values[snake] = values.pop(camel)
        return values


class OperatingCaseOverrides(BaseModel):
    """
    Stores parameter overrides for a specific operating case.
    nodes: dictionary mapping node_id -> dict of overridden property names & values
    global_settings: dictionary mapping global property names & values
    """
    nodes: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    global_settings: Dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode='before')
    @classmethod
    def populate_camel_case(cls, values: Any) -> Any:
        if isinstance(values, dict):
            if 'globalSettings' in values and 'global_settings' not in values:
                values['global_settings'] = values.pop('globalSettings')
        return values

class OperatingCase(BaseModel):
    """
    Represents an operating case scenario (e.g. Base Case, Cold Start, Throttled).
    """
    id: str
    name: str = "Operating Case"
    description: Optional[str] = ""
    is_base: bool = False
    overrides: OperatingCaseOverrides = Field(default_factory=OperatingCaseOverrides)

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
    label: Optional[str] = None
    data: Optional[Dict[str, Any]] = Field(default_factory=dict)

class ReactFlowGraph(BaseModel):
    """Represents the full graph sent from the React frontend."""
    nodes: List[ReactFlowNode]
    edges: List[ReactFlowEdge]
    global_settings: Optional[GlobalSettings] = Field(default_factory=GlobalSettings)
    cases: Optional[List[OperatingCase]] = Field(default_factory=list)
    active_case_id: Optional[str] = None

    @model_validator(mode='before')
    @classmethod
    def populate_camel_case(cls, values: Any) -> Any:
        if isinstance(values, dict):
            if 'globalSettings' in values and 'global_settings' not in values:
                values['global_settings'] = values.pop('globalSettings')
        return values

class BatchCaseResult(BaseModel):
    case_id: str
    case_name: str
    is_base: bool
    status: str
    error_message: Optional[str] = None
    stats: Optional[Dict[str, Any]] = None
    telemetry: Optional[Dict[str, Any]] = None
    telemetry_unmitigated: Optional[Dict[str, Any]] = None
    telemetry_peak: Optional[Dict[str, Any]] = None   # steady state at the peak relief opening
    kpis: Optional[Dict[str, Any]] = None

class BatchSimulationResponse(BaseModel):
    status: str
    results: List[BatchCaseResult]

class HydraulicNetwork(BaseModel):
    """
    A full graph of equipment and their connections.
    Used by the solver to traverse and build system equations.
    """
    model_config = ConfigDict(arbitrary_types_allowed=True)

    nodes: Dict[str, Any]  # ID -> HydraulicNode
    edges: List[Dict[str, Any]]  # List of: {'source': id, 'target': id, 'pipe': Pipe | ComponentLink, 'source_port': str, 'target_port': str}
    inline_nodes: Dict[str, Any] = {}  # ID -> InlineNode: in-line components, each solved as a ComponentLink edge
    global_settings: Optional[GlobalSettings] = None
    active_case_id: Optional[str] = None

    @model_validator(mode='after')
    def _mark_reservoir_pipe_ends(self):
        # Tanks and pressure sources hold fluid at rest: a pipe end on one adds the entry velocity head
        for edge in self.edges:
            pipe = edge.get('pipe')
            if pipe is None or not hasattr(pipe, 'inlet_at_reservoir'):
                continue
            pipe.inlet_at_reservoir = getattr(self.nodes.get(edge['source']), 'is_pressure_boundary', False)
            pipe.outlet_at_reservoir = getattr(self.nodes.get(edge['target']), 'is_pressure_boundary', False)
        return self


