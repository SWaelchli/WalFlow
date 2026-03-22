from simulation.equipment.base_node import HydraulicNode
from simulation.fluid_utils import FluidProperties
import math

class HeatExchanger(HydraulicNode):
    """
    Improved Heat Exchanger using a Design Duty Point.
    Calculates dynamic heat transfer based on flow and temperature difference.
    
    Physics:
    - Q = UA * (T_fluid_avg - T_medium)
    - UA scales with flow rate: UA = UA_rated * (Q_actual / Q_rated)^0.8
    """
    def __init__(self, name: str, 
                 rated_cooling_kw: float = 300.0, 
                 rated_flow_lmin: float = 500.0,
                 design_inlet_temp_c: float = 50.0,
                 medium_temp_c: float = 10.0,
                 pressure_drop_factor: float = 10.0):
        
        super().__init__(name, node_type="heat_exchanger")
        
        # Design Parameters
        self.rated_cooling_kw = rated_cooling_kw
        self.rated_flow_lmin = rated_flow_lmin
        self.design_inlet_temp_c = design_inlet_temp_c
        self.medium_temp_c = medium_temp_c
        
        # Hydraulic Parameters
        self.pressure_drop_factor = pressure_drop_factor
        
        # Internal State
        self.actual_duty_kw = 0.0
        
        self.add_inlet()
        self.add_outlet()

    def _calculate_ua_rated(self, cp: float):
        """
        Estimates the UA (Heat Transfer Coefficient * Area) from design point.
        """
        q_rated_si = self.rated_cooling_kw * 1000.0
        m_dot_rated = (self.rated_flow_lmin / 60000.0) * 850.0 # Approx oil density
        
        # 1. Find Rated Outlet Temp from energy balance: Q = m_dot * cp * (Ti - To)
        # To = Ti - Q / (m_dot * cp)
        t_in_rated = self.design_inlet_temp_c + 273.15
        t_out_rated = t_in_rated - (q_rated_si / (m_dot_rated * cp))
        
        # 2. Find UA using simplified LMTD or Average Temp Difference
        t_avg_rated = (t_in_rated + t_out_rated) / 2.0
        t_medium = self.medium_temp_c + 273.15
        
        # UA = Q / (T_avg - T_medium)
        dt = t_avg_rated - t_medium
        if dt <= 1.0: dt = 1.0 # Prevent div by zero
        
        return q_rated_si / dt

    def calculate_delta_p(self, flow: float, density: float, viscosity: float) -> float:
        # Simplified pressure drop: dP = k * Q^2
        return self.pressure_drop_factor * (flow**2) * (density / 1000.0)

    def calculate_temperature(self):
        """
        Calculates the actual cooling duty and resulting outlet temperature.
        """
        inlet = self.inlets[0]
        outlet = self.outlets[0]
        
        if abs(inlet.flow_rate) < 1e-9:
            outlet.temperature = inlet.temperature
            self.actual_duty_kw = 0.0
            return

        # Get fluid properties
        cp = FluidProperties.get_specific_heat(inlet.temperature, getattr(self.global_settings, 'fluid_type', 'water'))
        m_dot = abs(inlet.flow_rate) * inlet.density
        
        # 1. Get Base UA from design point
        ua_rated = self._calculate_ua_rated(cp)
        
        # 2. Scale UA with flow (Reynolds dependency, approx ^0.8 for turbulent)
        flow_ratio = abs(inlet.flow_rate) / (self.rated_flow_lmin / 60000.0)
        ua_actual = ua_rated * (flow_ratio ** 0.8)
        
        # 3. Solve for Outlet Temperature using NTU-like effectiveness or energy balance
        # Q = m_dot * cp * (Ti - To)  AND  Q = UA * ((Ti + To)/2 - Tm)
        # Solving for To:
        # m*cp*(Ti - To) = UA * (Ti/2 + To/2 - Tm)
        # m*cp*Ti - m*cp*To = UA*Ti/2 + UA*To/2 - UA*Tm
        # To * (UA/2 + m*cp) = m*cp*Ti - UA*Ti/2 + UA*Tm
        
        tm = self.medium_temp_c + 273.15
        ti = inlet.temperature
        
        num = (m_dot * cp * ti) - (ua_actual * ti / 2.0) + (ua_actual * tm)
        den = (m_dot * cp) + (ua_actual / 2.0)
        
        to = num / den
        
        # Physical clamp: Cannot cool below medium temperature
        if to < tm: to = tm
        
        outlet.temperature = to
        self.actual_duty_kw = (m_dot * cp * (ti - to)) / 1000.0

    def calculate(self):
        inlet = self.inlets[0]
        outlet = self.outlets[0]
        
        outlet.flow_rate = inlet.flow_rate
        outlet.pressure = inlet.pressure - self.calculate_delta_p(inlet.flow_rate, inlet.density, inlet.viscosity)
        outlet.density = inlet.density
        outlet.viscosity = inlet.viscosity
        
        return outlet.pressure
