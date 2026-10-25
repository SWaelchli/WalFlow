from simulation.equipment.base_node import HydraulicNode
from simulation.fluid_utils import FluidProperties

class ThreeWayTCV(HydraulicNode):
    """
    A 3-Way Temperature Control Valve (Mixing Valve).
    
    Logic follows Physical Design:
    - mix_ratio (0.0 to 1.0) is strictly the opening of the user-designated HOT port.
    - 1.0 - mix_ratio is strictly the opening of the COLD port.
    """
    def __init__(self, name: str, max_cv: float, set_temperature: float, hot_port_idx: int = 0,
                 fl: float = 0.9, fd: float = 0.46):
        super().__init__(name, node_type="three_way_tcv")
        self.max_cv = max_cv
        # IEC 60534-2-1 Table D.2 style factors per path (the table has no 3-way row);
        # default globe single port, contoured plug, flow to open
        self.fl = fl
        self.fd = fd
        # Valve size for F_R, set by the graph parser from the connected pipe; default DN50
        self.pipe_diameter = 0.05248
        self.set_temperature = set_temperature 
        self.hot_port_idx = hot_port_idx       # 0 or 1
        self.mix_ratio = 0.5                   
        self.cavitation_warning = False
        
        self.add_inlet() # Port 0
        self.add_inlet() # Port 1
        self.add_outlet() # Port 0 (Mixed Outlet)

    def calculate_path_dp(self, flow: float, density: float, port_idx: int, viscosity: float = 0.001) -> float:
        """
        Calculates pressure drop based on the PHYSICAL role of the port and viscosity.
        """
        is_hot_path = (port_idx == self.hot_port_idx)
        
        # Opening is tied to role:
        opening = self.mix_ratio if is_hot_path else (1.0 - self.mix_ratio)
        eff_cv = self.max_cv * max(0.0001, opening)
            
        if abs(flow) < 1e-10:
            return 0.0
            
        # Reynolds number factor, IEC 60534-2-1 Annex A
        fr = FluidProperties.get_iec_valve_fr(flow, viscosity / density, eff_cv, self.max_cv,
                                              self.fl, self.fd, self.pipe_diameter)
        cv_adj = max(1e-10, eff_cv * fr)  # F_R is floored; keeps laminar Δp linear in Q

        K_CV_SI = 1.732e9
        dp = (K_CV_SI * density * flow * abs(flow)) / (cv_adj**2)
        return dp

    def calculate(self):

        inlet_0 = self.inlets[0]
        inlet_1 = self.inlets[1]
        outlet = self.outlets[0]
        
        # Mass/Energy Balance
        # Only include ports with INWARD flow as sources (the rule of calculate_temperature, noise excluded)
        sources = self.inward_ports()
        source_ids = {id(p) for p in sources}
        inward = [(abs(p.flow_rate) * p.density, p.temperature) for p in sources]
        m_tot = sum(m for m, _ in inward)
        
        # Only noise arrives: no port has a temperature to give, they keep theirs (the dead-leg fill sets them later)
        if sources:
            # Throttling heat of both forward paths: power Q·ΔP ends up in the mixed stream
            heat_w = 0.0
            for port, idx in ((inlet_0, 0), (inlet_1, 1)):
                if id(port) in source_ids:
                    heat_w += port.flow_rate * max(0.0, self.calculate_path_dp(port.flow_rate, port.density, idx, port.viscosity))
            if id(outlet) in source_ids:
                heat_w = 0.0
            # Enthalpy balance with cp(T): sum(m h) + heat = m_tot * h_mix
            fluid = getattr(self.global_settings, 'fluid_type', 'water')
            h_mix = (sum(m * FluidProperties.get_enthalpy(fluid, t) for m, t in inward) + heat_w) / m_tot
            mix_temp = FluidProperties.get_temperature_from_enthalpy(
                fluid, h_mix, sum(m * t for m, t in inward) / m_tot)
            for port in (outlet, inlet_0, inlet_1):
                if id(port) not in source_ids:
                    port.temperature = mix_temp

        outlet.flow_rate = inlet_0.flow_rate + inlet_1.flow_rate
        
        # Hydraulics & Port Telemetry:
        dp0 = self.calculate_path_dp(inlet_0.flow_rate, inlet_0.density, 0, inlet_0.viscosity)
        dp1 = self.calculate_path_dp(inlet_1.flow_rate, inlet_1.density, 1, inlet_1.viscosity)
        
        inlet_0.pressure = outlet.pressure + dp0
        inlet_1.pressure = outlet.pressure + dp1
            
        fluid_type = getattr(self.global_settings, 'fluid_type', 'water')
        
        # Dynamically update local properties based on temperature feedback
        outlet.density = FluidProperties.get_density(fluid_type, outlet.temperature)
        outlet.viscosity = FluidProperties.get_viscosity(fluid_type, outlet.temperature)
        inlet_0.density = FluidProperties.get_density(fluid_type, inlet_0.temperature)
        inlet_0.viscosity = FluidProperties.get_viscosity(fluid_type, inlet_0.temperature)
        inlet_1.density = FluidProperties.get_density(fluid_type, inlet_1.temperature)
        inlet_1.viscosity = FluidProperties.get_viscosity(fluid_type, inlet_1.temperature)
        
        return outlet.pressure
