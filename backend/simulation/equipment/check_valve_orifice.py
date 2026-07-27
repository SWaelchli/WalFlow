import math
from simulation.equipment.base_node import HydraulicNode
from simulation.fluid_utils import FluidProperties

class CheckValveOrifice(HydraulicNode):
    """
    A check valve with an integrated bypass orifice.
    Allows restricted flow through the orifice in reverse or sub-cracking conditions.
    Allows parallel flow through both the main valve trim and orifice when open.
    """
    def __init__(
        self,
        name: str,
        cv: float = 10.0,
        cracking_pressure_bar: float = 0.05,
        pipe_diameter: float = 0.1,
        orifice_diameter: float = 0.01
    ):
        super().__init__(name, node_type="check_valve_orifice")
        self.cv = max(0.001, cv)
        self.cracking_pressure_bar = max(0.0, cracking_pressure_bar)
        self.pipe_diameter = max(0.001, pipe_diameter)
        self.orifice_diameter = max(0.0001, orifice_diameter)

        self.add_inlet()
        self.add_outlet()

    def _calculate_orifice_dp(self, flow_rate: float, density: float, viscosity: float = 0.001) -> float:
        """Calculates pressure drop using Bernoulli orifice equation with Re-dependent Cd."""
        pipe_d = max(0.001, getattr(self, 'pipe_diameter', 0.05248))
        orif_d = max(0.0001, self.orifice_diameter)

        beta_ratio = min(0.99, orif_d / pipe_d)
        area_pipe = math.pi * (pipe_d / 2.0)**2
        velocity = flow_rate / max(1e-9, area_pipe)
        dynamic_pressure = 0.5 * density * velocity * abs(velocity)
        
        area_orifice = math.pi * (self.orifice_diameter / 2.0)**2
        v_orifice = flow_rate / max(1e-9, area_orifice)
        re_orifice = (density * abs(v_orifice) * self.orifice_diameter) / max(1e-7, viscosity)
        
        discharge_coefficient = FluidProperties.get_orifice_cd(re_orifice)
        geometry_factor = (1.0 - beta_ratio**4) / ((discharge_coefficient**2) * (beta_ratio**4))
        rec_delta_p = dynamic_pressure * geometry_factor
        perm_delta_p = rec_delta_p * (1.0 - beta_ratio**2)
        return perm_delta_p

    def calculate_delta_p(self, flow_rate: float, density: float, viscosity: float = 0.001) -> float:
        """
        Calculates total pressure drop across Check Valve w/ Orifice.
        Sub-cracking or reverse flow (Q < 0): All flow passes through the orifice.
        Forward flow above cracking pressure (Q > 0): Parallel flow across main seat and orifice.
        """
        K_CV_SI = 1.732e9
        cracking_pa = self.cracking_pressure_bar * 100000.0
        dp_ori = self._calculate_orifice_dp(flow_rate, density, viscosity)

        if flow_rate <= 0 or dp_ori < cracking_pa:
            # Main seat closed -> all flow through orifice
            return dp_ori
        else:
            # Main seat open -> parallel flow
            # Conductance of main valve seat: K_v = Cv / sqrt(K_CV_SI * density)
            k_v = self.cv / math.sqrt(K_CV_SI * density)
            # Conductance of orifice: K_o = Q / sqrt(dp_ori)
            k_o = abs(flow_rate) / math.sqrt(max(1.0, dp_ori))
            k_total = k_v + k_o
            dp_friction = (flow_rate / k_total)**2
            return cracking_pa + dp_friction

    def calculate(self):
        """Updates outlet port conditions and thermal enthalpy balance."""
        inlet = self.inlets[0]
        outlet = self.outlets[0]

        dp = self.calculate_delta_p(inlet.flow_rate, inlet.density, inlet.viscosity)

        outlet.pressure = inlet.pressure - dp
        outlet.flow_rate = inlet.flow_rate
        outlet.density = inlet.density
        outlet.viscosity = inlet.viscosity

        fluid_type = getattr(self.global_settings, 'fluid_type', 'water')
        if inlet.flow_rate >= 0:
            cp = FluidProperties.get_specific_heat(fluid_type, inlet.temperature)
            dt = abs(dp) / (inlet.density * cp)
            outlet.temperature = inlet.temperature + dt
        else:
            cp = FluidProperties.get_specific_heat(fluid_type, outlet.temperature)
            dt = abs(dp) / (outlet.density * cp)
            inlet.temperature = outlet.temperature + dt

        self.calculate_temperature()
        return dp
