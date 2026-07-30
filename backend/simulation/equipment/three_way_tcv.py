from simulation.equipment.base_node import HydraulicNode
from simulation.fluid_utils import FluidProperties
import math

class ThreeWayTCV(HydraulicNode):
    """
    A 3-Way Temperature Control Valve (Mixing Valve).
    
    Logic follows Physical Design:
    - mix_ratio (0.0 to 1.0) is strictly the opening of the user-designated HOT port.
    - 1.0 - mix_ratio is strictly the opening of the COLD port.
    """
    def __init__(self, name: str, max_cv: float, set_temperature: float, hot_port_idx: int = 0):
        super().__init__(name, node_type="three_way_tcv")
        self.max_cv = max_cv
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
            
        d_v = max(0.002, 0.01 * math.sqrt(eff_cv))
        v_v = flow / (0.25 * math.pi * d_v**2)
        re_v = (density * abs(v_v) * d_v) / max(1e-7, viscosity)
        fr = FluidProperties.get_valve_fr(re_v)
        cv_adj = max(0.0001, eff_cv * fr)

        K_CV_SI = 1.732e9
        dp = (K_CV_SI * density * flow * abs(flow)) / (cv_adj**2)
        return dp

    def calculate(self):
        inlet_0 = self.inlets[0]
        inlet_1 = self.inlets[1]
        outlet = self.outlets[0]
        
        # Mass/Energy Balance
        # Only include ports with INWARD flow as sources
        m0 = inlet_0.flow_rate * inlet_0.density if inlet_0.flow_rate > 0 else 0.0
        m1 = inlet_1.flow_rate * inlet_1.density if inlet_1.flow_rate > 0 else 0.0
        m_out_rev = abs(outlet.flow_rate) * outlet.density if outlet.flow_rate < 0 else 0.0
        m_tot = m0 + m1 + m_out_rev
        
        if m_tot > 1e-10:
            inward_temps = []
            if inlet_0.flow_rate > 0:
                inward_temps.append((m0, inlet_0.temperature))
            if inlet_1.flow_rate > 0:
                inward_temps.append((m1, inlet_1.temperature))
            if outlet.flow_rate < 0:
                inward_temps.append((m_out_rev, outlet.temperature))
            mix_temp = sum(m * t for m, t in inward_temps) / m_tot
        else:
            mix_temp = inlet_0.temperature
            
        if outlet.flow_rate >= 0:
            outlet.temperature = mix_temp
        if inlet_0.flow_rate <= 0:
            inlet_0.temperature = mix_temp
        if inlet_1.flow_rate <= 0:
            inlet_1.temperature = mix_temp
            
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
