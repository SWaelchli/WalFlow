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

    def calculate_path_dp(self, flow: float, density: float, port_idx: int) -> float:
        """
        Calculates pressure drop based on the PHYSICAL role of the port.
        """
        is_hot_path = (port_idx == self.hot_port_idx)
        
        # Opening is tied to role:
        opening = self.mix_ratio if is_hot_path else (1.0 - self.mix_ratio)
        eff_cv = self.max_cv * max(0.0001, opening)
            
        if abs(flow) < 1e-10:
            return 0.0
            
        K_CV_SI = 1.732e9
        dp = (K_CV_SI * density * (flow**2)) / (eff_cv**2)
        return dp

    def calculate(self):
        inlet_0 = self.inlets[0]
        inlet_1 = self.inlets[1]
        outlet = self.outlets[0]
        
        # Mass/Energy Balance
        m0 = abs(inlet_0.flow_rate * inlet_0.density)
        m1 = abs(inlet_1.flow_rate * inlet_1.density)
        m_tot = m0 + m1
        
        if m_tot > 1e-10:
            outlet.temperature = (m0 * inlet_0.temperature + m1 * inlet_1.temperature) / m_tot
        else:
            outlet.temperature = inlet_0.temperature
            
        outlet.flow_rate = inlet_0.flow_rate + inlet_1.flow_rate
        
        # Hydraulics
        dp0 = self.calculate_path_dp(inlet_0.flow_rate, inlet_0.density, 0)
        dp1 = self.calculate_path_dp(inlet_1.flow_rate, inlet_1.density, 1)
        
        # Reference the higher flow for pressure balance
        if m0 >= m1:
            outlet.pressure = inlet_0.pressure - dp0
        else:
            outlet.pressure = inlet_1.pressure - dp1
            
        outlet.density = inlet_0.density
        outlet.viscosity = inlet_0.viscosity
        return outlet.pressure
