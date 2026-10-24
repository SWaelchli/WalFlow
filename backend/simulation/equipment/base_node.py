from typing import List
import uuid

# Import the Port schema from our sibling file
from simulation.schemas import Port
from simulation.fluid_utils import FluidProperties

# Lowest pump efficiency the parser accepts (1 %); guards shaft power and heat against division by zero
MIN_PUMP_EFFICIENCY = 0.01


def pump_shaft_power(flow_rate: float, dp_rise: float, efficiency: float, active: bool = True) -> float:
    """Shaft power (W) of a pump: |Q|·dP/eta while it raises the pressure (dP > 0), in reverse flow too,
    where the motor still drives the impeller; 0 when it is stopped or braking (dP <= 0)."""
    if not active or dp_rise <= 0:
        return 0.0
    return abs(flow_rate) * dp_rise / max(MIN_PUMP_EFFICIENCY, efficiency)


def pump_heat_factor(dp_rise: float, efficiency: float, active: bool = True) -> float:
    """Share of the pump |dP| that heats the fluid: (1 - eta)/eta while it raises the pressure, so the heat
    is P_shaft - |Q|·dP; 1 when it is stopped or braking (dP < 0), as in a throttle. Depends on the sign of dP
    only, so the heat does not jump when a dead-headed pump's flow changes sign."""
    if not active or dp_rise < 0:
        return 1.0
    eta = max(MIN_PUMP_EFFICIENCY, efficiency)
    return (1.0 - eta) / eta

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
        self.active = True          # Component active status (can be overridden per case)
        
        # Solver categorization properties (overridden by subclasses to support solver dynamic pruning and MCP)
        self.is_pressure_boundary = False
        self.blocks_flow_on_shutdown = False
        self.use_mcp_formulation = False

        # Relief analysis: drivers (pumps, sources) scale with a ramp factor to find the
        # steady state at which a relief device reaches its set pressure. Subclasses that drive
        # the system set is_relief_driver and override apply_relief_ramp / reset_relief_ramp.
        self.is_relief_driver = False
        self.relief_ramp_enabled = True  # user switch "Ramp during relief analysis"

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
        
        # Enthalpy balance: sum(m_i * h_i) = m_total * h_mix, with h = integral of cp dT
        fluid_type = getattr(self.global_settings, 'fluid_type', 'water')
        weighted_temp_sum = 0.0
        enthalpy_sum = 0.0
        for port in inward_ports:
            m_dot = abs(port.flow_rate) * port.density
            total_mass_flow += m_dot
            weighted_temp_sum += m_dot * port.temperature
            enthalpy_sum += m_dot * FluidProperties.get_enthalpy(fluid_type, port.temperature)

        if total_mass_flow > 0:
            mix_temp = FluidProperties.get_temperature_from_enthalpy(
                fluid_type, enthalpy_sum / total_mass_flow, weighted_temp_sum / total_mass_flow)
        else:
            mix_temp = inward_ports[0].temperature
        
        for port in outward_ports:
            port.temperature = mix_temp

    def has_inflow(self) -> bool:
        """True when any port has flow into the node (the sources of calculate_temperature)."""
        return any(p.flow_rate > 0 for p in self.inlets) or any(p.flow_rate < 0 for p in self.outlets)

    def update_outward_properties(self) -> None:
        """Density and viscosity of the ports with outward flow at their own temperature (junctions)."""
        if not self.global_settings:
            return
        fluid_type = self.global_settings.fluid_type
        outward = [p for p in self.inlets if p.flow_rate <= 0] + [p for p in self.outlets if p.flow_rate >= 0]
        for port in outward:
            port.density = FluidProperties.get_density(fluid_type, port.temperature)
            port.viscosity = FluidProperties.get_viscosity(fluid_type, port.temperature)

    def update_npsh(self, inlet) -> None:
        """NPSHa = (P_in - Pv)/(rho g) at a pump suction, always reported. The cavitation warning is
        raised when NPSHa < NPSHr + margin (NPSHr 0 when no datasheet value is entered)."""
        fluid_type = getattr(self.global_settings, 'fluid_type', 'water')
        pv = FluidProperties.get_vapor_pressure(fluid_type, inlet.temperature)
        self.npsha_m = (inlet.pressure - pv) / (max(1.0, inlet.density) * 9.81)
        required = (self.npshr_m or 0.0) + self.npsh_margin_m
        self.cavitation_warning = bool(getattr(self, 'active', True) and self.npsha_m < required)

    def apply_relief_ramp(self, lam: float) -> None:
        """Scales the driving parameters to the fraction lam (0..1) of their case value.
        Overridden by relief drivers; reset_relief_ramp() restores the case value."""
        pass

    def reset_relief_ramp(self) -> None:
        """Restores the case values changed by apply_relief_ramp()."""
        pass

    def calculate(self):
        """
        The simulation engine will call this method iteratively.
        This is just a placeholder. When we create the specific Pump or Valve classes,
        we will override this method with the actual mathematical logic (like the pump curve).
        """
        raise NotImplementedError("This method must be overridden by the specific equipment class.")

    def calculate_dp_derivative(self, flow_rate: float, density: float, viscosity: float = 0.001) -> float:
        """
        Numerical derivative fallback of pressure drop with respect to flow rate.
        Can be overridden by subclasses for analytical derivatives.
        """
        dq = 1e-6
        has_update_state = getattr(self, 'has_update_state_param', False) or (self.node_type in ['pressure_safety_valve', 'rupture_disc', 'check_valve'])

        if has_update_state:
            dp_plus = self.calculate_delta_p(flow_rate + dq, density, viscosity, update_state=False)
            dp_minus = self.calculate_delta_p(flow_rate - dq, density, viscosity, update_state=False)
        else:
            dp_plus = self.calculate_delta_p(flow_rate + dq, density, viscosity)
            dp_minus = self.calculate_delta_p(flow_rate - dq, density, viscosity)

        return (dp_plus - dp_minus) / (2.0 * dq)
