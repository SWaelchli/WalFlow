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
        self.global_settings = None # To be injected by GraphParser
        
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

    def calculate_temperature(self):
        """
        Default temperature calculation: Energy balance for mixing.
        Direction-aware: Uses ports with INWARD flow as sources.
        """
        total_mass_flow = 0.0
        weighted_temp_sum = 0.0
        
        # Check all ports (inlets and outlets) for inward flow
        inward_ports = []
        outward_ports = []
        
        for port in self.inlets:
            if port.flow_rate > 0: inward_ports.append(port)
            else: outward_ports.append(port)
            
        for port in self.outlets:
            if port.flow_rate < 0: inward_ports.append(port)
            else: outward_ports.append(port)

        if not inward_ports:
            return
            
        # If we only have ONE inward port and NO specialized delta-T logic has been applied
        # to the outward ports yet, we just propagate the inward temperature.
        # Specialized nodes (HX, Orifice) set their outlet temp BEFORE calling this.
        
        for port in inward_ports:
            m_dot = abs(port.flow_rate) * port.density
            total_mass_flow += m_dot
            weighted_temp_sum += m_dot * port.temperature
            
        mix_temp = weighted_temp_sum / total_mass_flow if total_mass_flow > 0 else inward_ports[0].temperature
        
        # Only propagate mix_temp if there's actual mixing (multiple sources)
        # OR if it's a simple pass-through and we haven't touched the temperature.
        is_mixing = len(inward_ports) > 1
        
        for port in outward_ports:
            # If mixing, we MUST use the energy balance.
            # If not mixing, only apply if the temperature is 'default' (meaning child class didn't set it)
            if is_mixing:
                port.temperature = mix_temp
            elif port.temperature <= 0.1 or abs(port.temperature - inward_ports[0].temperature) < 1e-6:
                port.temperature = mix_temp

    def calculate(self):
        """
        The simulation engine will call this method iteratively.
        This is just a placeholder. When we create the specific Pump or Valve classes,
        we will override this method with the actual mathematical logic (like the pump curve).
        """
        raise NotImplementedError("This method must be overridden by the specific equipment class.")